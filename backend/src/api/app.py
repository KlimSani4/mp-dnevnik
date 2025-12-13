"""FastAPI application factory."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.middleware import RateLimitMiddleware, RequestLoggingMiddleware
from src.api.routes import (
    assignments,
    auth,
    groups,
    health,
    schedule,
    tasks,
    users,
)
from src.config import settings
from src.gateways.telegram.bot import create_bot, create_dispatcher
from src.shared.database import close_db, init_db
from src.shared.exceptions import AppException
from src.shared.redis import close_redis, init_redis

logger = logging.getLogger(__name__)


_bot_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> Any:
    """Application lifespan events."""
    global _bot_task

    # Startup
    logger.info("Starting application...")

    await init_db()
    logger.info("Database initialized")

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

    yield

    # Shutdown
    logger.info("Shutting down application...")

    if _bot_task:
        _bot_task.cancel()
        try:
            await _bot_task
        except asyncio.CancelledError:
            pass
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
    async def generic_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception")
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

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

    return app
