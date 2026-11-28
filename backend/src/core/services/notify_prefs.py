"""Что и когда бот присылает (#32).

По умолчанию бот тихий: пишет только о том, что требует действия (дедлайн по несданному
заданию, изменение расписания). Ежедневная сводка и напоминание о паре включаются
по желанию — в мастере настройки, в /settings или на сайте.

Переключатели по типам — в notification_preferences (их же меняет сайт), время сводки
и тихие часы — в users.settings["notify"]. Без базы и Telegram, чтобы проверять тестами.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping
from datetime import datetime
from typing import Any

from src.core.models.notification import NotificationType

# Нет строки в notification_preferences — действует это значение.
DEFAULTS: dict[NotificationType, bool] = {
    NotificationType.SCHEDULE_CHANGE: True,
    NotificationType.DEADLINE: True,
    NotificationType.NEW_ASSIGNMENT: False,
    NotificationType.VOTE: False,
    NotificationType.DIGEST: False,
    NotificationType.CLASS_REMINDER: False,
}

SETTINGS_KEY = "notify"

# Время сводки: утром — пары на сегодня, вечером — на завтра. "HHMM": в callback_data
# двоеточие занято разделителем.
DIGEST_TIMES = ("0730", "2000", "2100")
DEFAULT_DIGEST_TIME = "2000"
MORNING_TIMES = frozenset({"0730"})

# Тихие часы "с-до" по Москве; "off" — без тихих часов.
QUIET_CHOICES = ("23-8", "0-9", "off")
DEFAULT_QUIET = "23-8"


def is_enabled(saved: Mapping[NotificationType, bool], ntype: NotificationType) -> bool:
    """Включён ли тип с учётом умолчаний."""
    return saved.get(ntype, DEFAULTS[ntype])


def enabled_users(
    user_ids: Iterable[uuid.UUID],
    saved: Iterable[tuple[uuid.UUID, bool]],
    ntype: NotificationType,
) -> set[uuid.UUID]:
    """Кому из user_ids слать ntype. saved — (user_id, enabled) из notification_preferences."""
    explicit = dict(saved)
    return {u for u in user_ids if explicit.get(u, DEFAULTS[ntype])}


def _notify(settings: Mapping[str, Any] | None) -> Mapping[str, Any]:
    value = (settings or {}).get(SETTINGS_KEY)
    return value if isinstance(value, Mapping) else {}


def digest_time(settings: Mapping[str, Any] | None) -> str:
    value = _notify(settings).get("digest_time")
    return value if value in DIGEST_TIMES else DEFAULT_DIGEST_TIME


def quiet(settings: Mapping[str, Any] | None) -> str:
    value = _notify(settings).get("quiet")
    return value if value in QUIET_CHOICES else DEFAULT_QUIET


def is_setup_done(settings: Mapping[str, Any] | None) -> bool:
    return bool(_notify(settings).get("setup"))


def with_notify(settings: Mapping[str, Any] | None, **changes: Any) -> dict[str, Any]:
    """Новый dict настроек: SQLAlchemy замечает изменение JSONB только при замене объекта."""
    current = dict(settings or {})
    current[SETTINGS_KEY] = {**_notify(settings), **changes}
    return current


def in_quiet_hours(settings: Mapping[str, Any] | None, now: datetime) -> bool:
    """now — московское время. Интервал полуоткрытый: [с; до)."""
    value = quiet(settings)
    if value == "off":
        return False
    start, end = (int(x) for x in value.split("-"))
    h = now.hour
    return start <= h < end if start < end else h >= start or h < end


def format_digest_time(value: str) -> str:
    return f"{value[:2]}:{value[2:]}"


def format_quiet(value: str) -> str:
    if value == "off":
        return "нет"
    start, end = value.split("-")
    return f"{start}:00–{end}:00"


# Готовые наборы для первого шага мастера.
PRESETS: dict[str, dict[NotificationType, bool]] = {
    "quiet": {
        NotificationType.DEADLINE: True,
        NotificationType.SCHEDULE_CHANGE: True,
        NotificationType.DIGEST: False,
        NotificationType.CLASS_REMINDER: False,
        NotificationType.NEW_ASSIGNMENT: False,
    },
    "digest": {
        NotificationType.DEADLINE: True,
        NotificationType.SCHEDULE_CHANGE: True,
        NotificationType.DIGEST: True,
        NotificationType.CLASS_REMINDER: False,
        NotificationType.NEW_ASSIGNMENT: False,
    },
    "all": {
        NotificationType.DEADLINE: True,
        NotificationType.SCHEDULE_CHANGE: True,
        NotificationType.DIGEST: True,
        NotificationType.CLASS_REMINDER: True,
        NotificationType.NEW_ASSIGNMENT: True,
    },
}
