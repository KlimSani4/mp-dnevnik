"""Health check endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db_session, get_redis_client

router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response."""

    status: str


class ReadyResponse(BaseModel):
    """Readiness check response."""

    status: str
    db: str
    redis: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Liveness probe. Returns ok if service is running."""
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
async def ready_check(
    db: AsyncSession = Depends(get_db_session),
) -> ReadyResponse:
    """Readiness probe. Checks database and Redis connections."""
    db_status = "ok"
    redis_status = "ok"

    # Check database
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    # Check Redis
    try:
        redis = await get_redis_client()
        await redis.ping()
    except Exception:
        redis_status = "error"

    status = "ready" if db_status == "ok" and redis_status == "ok" else "degraded"

    return ReadyResponse(
        status=status,
        db=db_status,
        redis=redis_status,
    )
