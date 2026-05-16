"""Rate limiter unit tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.api.rate_limit import _check_rate_limit
from src.shared.exceptions import RateLimitError


class TestCheckRateLimit:
    @pytest.mark.asyncio
    async def test_allows_within_limit(self) -> None:
        """Requests below the limit should not raise."""
        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.ttl = MagicMock()
        # count=5, ttl=30 → well within /api/v1/auth/telegram limit of 10
        pipe.execute = AsyncMock(return_value=[5, 30])
        redis.pipeline = MagicMock(return_value=pipe)

        # Should not raise
        await _check_rate_limit(redis, "1.2.3.4", "/api/v1/auth/telegram")

    @pytest.mark.asyncio
    async def test_blocks_over_limit(self) -> None:
        """Requests over the limit must raise RateLimitError."""
        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.ttl = MagicMock()
        # count=11 > limit=10 for /api/v1/auth/telegram
        pipe.execute = AsyncMock(return_value=[11, 30])
        redis.pipeline = MagicMock(return_value=pipe)

        with pytest.raises(RateLimitError):
            await _check_rate_limit(redis, "1.2.3.4", "/api/v1/auth/telegram")

    @pytest.mark.asyncio
    async def test_sets_ttl_on_new_key(self) -> None:
        """When TTL is -1 (new key), expire must be called."""
        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.ttl = MagicMock()
        # count=1, ttl=-1 → new key
        pipe.execute = AsyncMock(return_value=[1, -1])
        redis.pipeline = MagicMock(return_value=pipe)
        redis.expire = AsyncMock()

        await _check_rate_limit(redis, "5.5.5.5", "/api/v1/auth/telegram")

        redis.expire.assert_awaited_once_with("ratelimit:5.5.5.5:/api/v1/auth/telegram", 60)

    @pytest.mark.asyncio
    async def test_does_not_set_ttl_when_already_set(self) -> None:
        """When key already has a TTL, expire should NOT be called again."""
        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.ttl = MagicMock()
        pipe.execute = AsyncMock(return_value=[3, 45])
        redis.pipeline = MagicMock(return_value=pipe)
        redis.expire = AsyncMock()

        await _check_rate_limit(redis, "9.9.9.9", "/api/v1/auth/refresh")

        redis.expire.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_endpoint_uses_default_limit(self) -> None:
        """Unknown paths fall back to 60 requests / 60s."""
        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.ttl = MagicMock()
        # count=61 > default limit=60
        pipe.execute = AsyncMock(return_value=[61, 30])
        redis.pipeline = MagicMock(return_value=pipe)

        with pytest.raises(RateLimitError):
            await _check_rate_limit(redis, "1.1.1.1", "/api/v1/some/unknown/path")

    @pytest.mark.asyncio
    async def test_exactly_at_limit_allowed(self) -> None:
        """count == limit should pass (limit is inclusive)."""
        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.ttl = MagicMock()
        # count=10 == limit=10 for /api/v1/auth/telegram → not over limit
        pipe.execute = AsyncMock(return_value=[10, 20])
        redis.pipeline = MagicMock(return_value=pipe)

        # Should not raise
        await _check_rate_limit(redis, "2.2.2.2", "/api/v1/auth/telegram")

    @pytest.mark.asyncio
    async def test_refresh_limit_is_higher(self) -> None:
        """Refresh endpoint has a higher limit (20) than telegram (10)."""
        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock()
        pipe.ttl = MagicMock()
        # count=15 is within refresh limit=20 but would exceed telegram limit=10
        pipe.execute = AsyncMock(return_value=[15, 30])
        redis.pipeline = MagicMock(return_value=pipe)

        # Should not raise for refresh
        await _check_rate_limit(redis, "3.3.3.3", "/api/v1/auth/refresh")

    @pytest.mark.asyncio
    async def test_key_format(self) -> None:
        """Verify the Redis key is constructed as expected."""
        captured_keys: list[str] = []

        redis = AsyncMock()
        pipe = AsyncMock()
        pipe.incr = MagicMock(side_effect=lambda k: captured_keys.append(k))
        pipe.ttl = MagicMock()
        pipe.execute = AsyncMock(return_value=[1, 30])
        redis.pipeline = MagicMock(return_value=pipe)

        await _check_rate_limit(redis, "10.0.0.1", "/api/v1/auth/telegram")

        assert len(captured_keys) == 1
        assert captured_keys[0] == "ratelimit:10.0.0.1:/api/v1/auth/telegram"
