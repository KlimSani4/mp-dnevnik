"""Redis client management."""

from __future__ import annotations

from typing import TYPE_CHECKING

import redis.asyncio as aioredis

from src.config import settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

_redis_client: Redis | None = None


async def get_redis() -> Redis:
    """Get Redis client instance."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def init_redis() -> Redis:
    """Initialize Redis connection."""
    client = await get_redis()
    await client.ping()
    return client


async def close_redis() -> None:
    """Close Redis connection."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
