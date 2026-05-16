"""Redis-backed per-endpoint rate limiting dependencies."""

from __future__ import annotations

from fastapi import Request
from redis.asyncio import Redis

from src.shared.exceptions import RateLimitError

# Limits: (max_requests, window_seconds)
_ENDPOINT_LIMITS: dict[str, tuple[int, int]] = {
    "/api/v1/auth/telegram": (10, 60),
    "/api/v1/auth/refresh": (20, 60),
}


async def _check_rate_limit(redis: "Redis[str]", ip: str, path: str) -> None:
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


def make_rate_limit_dependency(path: str) -> type:
    """Factory that returns a FastAPI dependency for rate limiting a specific path."""
    from src.api.deps import RedisClient

    async def _dep(request: Request, redis: RedisClient) -> None:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        elif request.client:
            ip = request.client.host
        else:
            return  # Can't identify client; skip

        await _check_rate_limit(redis, ip, path)

    return _dep  # type: ignore[return-value]
