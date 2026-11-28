"""FastAPI application factory."""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.middleware import RateLimitMiddleware, RequestLoggingMiddleware
from src.api.routes import (
    assignments,
    auth,
    dashboard,
    groups,
    health,
    internal,
    moderation,
    notifications,
    queues,
    schedule,
    semesters,
    subjects,
    support,
    tasks,
    users,
)
from src.config import settings
from src.gateways.telegram.bot import create_bot, create_dispatcher
from src.gateways.telegram.scheduler import start_scheduler, stop_scheduler
from src.shared.database import close_db, init_db
from src.shared.exceptions import AppException
from src.shared.redis import close_redis, init_redis

logger = logging.getLogger(__name__)


_bot_task: asyncio.Task[None] | None = None


def is_schema_outdated(exc: BaseException) -> bool:
    """Ошибка из-за неприменённых миграций: нет таблицы или колонки."""
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        name = type(cur).__name__
        if name in (
            "UndefinedColumnError",
            "UndefinedTableError",
            "UndefinedColumn",
            "UndefinedTable",
        ):
            return True
        cur = cur.__cause__ or cur.__context__ or getattr(cur, "orig", None)
    return False


async def warn_if_migrations_pending() -> None:
    """Громко сказать в лог, если база отстаёт от миграций в коде (#165)."""
    try:
        from pathlib import Path

        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from sqlalchemy import text

        from src.shared.database import engine

        root = Path(__file__).resolve().parents[2]
        head = ScriptDirectory.from_config(Config(str(root / "alembic.ini"))).get_current_head()
        async with engine.connect() as conn:
            current = (
                await conn.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one_or_none()
        if current != head:
            logger.error(
                "Database is at migration %s, code expects %s: run `alembic upgrade head`",
                current,
                head,
            )
    except Exception as e:  # noqa: BLE001 — проверка не должна мешать старту
        logger.warning("Could not check migrations: %s", e)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> Any:
    """Application lifespan events."""
    global _bot_task

    # Startup
    logger.info("Starting application...")

    await init_db()
    logger.info("Database initialized")
    await warn_if_migrations_pending()

    try:
        await init_redis()
        logger.info("Redis initialized")
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}")

    # Start Telegram bot polling
    bot = create_bot()
    if bot:
        dp = create_dispatcher()
        _bot_task = asyncio.create_task(dp.start_polling(bot))
        logger.info("Telegram bot started")

    # Start scheduler
    start_scheduler()

    yield

    # Shutdown
    logger.info("Shutting down application...")

    stop_scheduler()

    if _bot_task:
        _bot_task.cancel()
        with suppress(asyncio.CancelledError):
            await _bot_task
        logger.info("Telegram bot stopped")

    await close_redis()
    await close_db()

    logger.info("Application shutdown complete")


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    app = FastAPI(
        title="Nexora API",
        description="Student platform for Moscow Polytechnic University",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
    )

    # Exception handlers
    @app.exception_handler(AppException)
    async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                **exc.extra,
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception")
        content: dict[str, str] = {"detail": "Internal server error", "code": "INTERNAL"}
        if is_schema_outdated(exc):
            # Таблицы или колонки нет — не применены миграции (#165)
            content = {
                "detail": "Database schema is outdated: run alembic upgrade head",
                "code": "DB_SCHEMA_OUTDATED",
            }
        response = JSONResponse(status_code=500, content=content)
        # Ответ на необработанную ошибку собирается снаружи CORSMiddleware и уходит
        # без CORS-заголовков: браузер прячет 500 и сайт видит «нет связи с сервером».
        # Добавляем их сами для разрешённых источников.
        origin = request.headers.get("origin")
        if origin and (origin in settings.CORS_ORIGINS or "*" in settings.CORS_ORIGINS):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"
        return response

    # Middleware (order matters - first added = last executed)
    app.add_middleware(RequestLoggingMiddleware)

    if settings.is_production:
        app.add_middleware(
            RateLimitMiddleware,
            requests_per_minute=60,
            burst=10,
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routes
    app.include_router(health.router)
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
    app.include_router(groups.router, prefix="/api/v1/groups", tags=["groups"])
    app.include_router(schedule.router, prefix="/api/v1/schedule", tags=["schedule"])
    app.include_router(assignments.router, prefix="/api/v1/assignments", tags=["assignments"])
    app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["tasks"])
    app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
    app.include_router(semesters.router, prefix="/api/v1/subjects", tags=["semesters"])
    app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
    app.include_router(internal.router, prefix="/api/v1/internal", tags=["internal"])
    app.include_router(queues.router, prefix="/api/v1/queues", tags=["queues"])
    app.include_router(subjects.router, prefix="/api/v1/subjects", tags=["subjects"])
    app.include_router(support.router, prefix="/api/v1/support", tags=["support"])
    app.include_router(moderation.router, prefix="/api/v1/moderation", tags=["moderation"])

    return app
