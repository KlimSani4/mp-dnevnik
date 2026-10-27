"""Учёт активных пользователей для статистики модераторов (#99).

На каждый авторизованный запрос id пользователя добавляется в HyperLogLog Redis
за текущий день (ключ active:YYYY-MM-DD, хранится 35 дней). HyperLogLog занимает
до 12 КБ на день независимо от числа пользователей, а PFCOUNT по нескольким ключам
сразу даёт число уникальных пользователей за период.

Учёт активности не должен ломать запросы: при недоступном Redis ошибки глушатся.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

KEY_PREFIX = "active:"
TTL_SECONDS = 35 * 24 * 3600


def day_key(day: date) -> str:
    return f"{KEY_PREFIX}{day.isoformat()}"


def period_keys(today: date, days: int) -> list[str]:
    """Ключи за последние `days` дней, включая сегодняшний."""
    return [day_key(today - timedelta(days=i)) for i in range(days)]


async def track_active(redis: Redis[str], user_id: uuid.UUID, today: date | None = None) -> None:
    key = day_key(today or datetime.now(tz=UTC).date())
    try:
        await redis.pfadd(key, str(user_id))
        await redis.expire(key, TTL_SECONDS)
    except Exception:  # noqa: BLE001 — статистика не важнее запроса
        logger.debug("Failed to track active user", exc_info=True)


async def count_active(redis: Redis[str], today: date, days: int) -> int:
    """Уникальные пользователи за последние `days` дней (0, если Redis недоступен)."""
    try:
        return int(await redis.pfcount(*period_keys(today, days)))
    except Exception:  # noqa: BLE001
        logger.warning("Failed to count active users", exc_info=True)
        return 0


async def daily_active(redis: Redis[str], today: date, days: int) -> list[tuple[date, int]]:
    """Активные пользователи по дням, от старых к новым."""
    out: list[tuple[date, int]] = []
    for i in reversed(range(days)):
        day = today - timedelta(days=i)
        try:
            out.append((day, int(await redis.pfcount(day_key(day)))))
        except Exception:  # noqa: BLE001
            out.append((day, 0))
    return out
