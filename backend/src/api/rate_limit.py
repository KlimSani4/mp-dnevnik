"""Redis-backed per-endpoint rate limiting dependencies."""

from __future__ import annotations

import logging

from fastapi import Request
from redis.asyncio import Redis

from src.shared.exceptions import RateLimitError

logger = logging.getLogger(__name__)

# Limits: (max_requests, window_seconds)
_ENDPOINT_LIMITS: dict[str, tuple[int, int]] = {
    "/api/v1/auth/telegram": (10, 60),
    "/api/v1/auth/refresh": (20, 60),
    "/api/v1/auth/telegram/init": (10, 60),
    "/api/v1/auth/telegram/poll": (60, 60),
}


async def _check_rate_limit(redis: Redis, ip: str, path: str) -> None:
    """Increment counter for ip+path; raise RateLimitError if over limit."""
    limit, window = _ENDPOINT_LIMITS.get(path, (60, 60))
    key = f"ratelimit:{ip}:{path}"

    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.ttl(key)
    count, ttl = await pipe.execute()

    if ttl < 0:
        # Key was just created or has no TTL — set it
        await redis.expire(key, window)

    if count > limit:
        raise RateLimitError("Too many requests. Please slow down.")


def make_rate_limit_dependency(path: str):  # type: ignore[no-untyped-def]
    """Factory that returns a FastAPI dependency for rate limiting a specific path (by IP)."""
    from fastapi import Depends

    from src.api.deps import get_redis_client
    from src.shared.net import get_client_ip

    async def _dep(request: Request, redis: Redis = Depends(get_redis_client)) -> None:
        ip = get_client_ip(request)
        if ip is None:
            return  # Can't identify client; skip
        await _check_rate_limit(redis, ip, path)

    return _dep


async def hit_limit(redis: Redis, key: str, limit: int, window: int) -> None:
    """Счётчик в Redis: при превышении RateLimitError. Недоступный Redis лимит не включает."""
    try:
        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        count, ttl = await pipe.execute()
        if ttl < 0:
            await redis.expire(key, window)
    except Exception:  # noqa: BLE001 — сбой Redis не должен ронять API
        logger.warning("Rate limit check skipped: Redis unavailable", exc_info=True)
        return
    if count > limit:
        raise RateLimitError("Too many requests. Please slow down.")


def user_rate_limit(name: str, limit: int, window: int = 60):  # type: ignore[no-untyped-def]
    """Лимит на пользователя (а не на IP: за одним NAT университета много студентов)."""
    from fastapi import Depends

    from src.api.deps import get_current_user, get_redis_client
    from src.core.models.user import User

    async def _dep(
        user: User = Depends(get_current_user), redis: Redis = Depends(get_redis_client)
    ) -> None:
        await hit_limit(redis, f"ratelimit:user:{user.id}:{name}", limit, window)

    return _dep
