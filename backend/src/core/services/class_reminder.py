"""Напоминание о паре за 10–15 минут до начала.

Чистые функции без БД: что напоминать конкретному студенту и каким текстом.
Фоновая задача, которая ходит в БД и шлёт сообщения, — в
``src.gateways.telegram.scheduler.send_upcoming_class_notifications``.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, time
from html import escape
from typing import Any

from src.core.models.schedule import OverrideScope, OverrideType, ScheduleEntry, ScheduleOverride

# Ключ в users.settings и допустимые значения «за сколько минут напоминать»
SETTINGS_KEY = "class_reminder_minutes"
MINUTES_CHOICES = (10, 15)
DEFAULT_MINUTES = 15
MAX_MINUTES = max(MINUTES_CHOICES)


@dataclass(frozen=True)
class Lesson:
    """Занятие, о котором напоминаем, — уже с применёнными переопределениями."""

    key: str  # для дедупликации: id записи или ADD-переопределения
    subject: str
    start: time
    end: time | None = None
    lesson_type: str | None = None
    teacher: str | None = None
    room: str | None = None
    link: str | None = None
    online: bool = False


def reminder_minutes(settings: dict[str, Any] | None) -> int:
    """За сколько минут до пары напоминать пользователю (10 или 15, по умолчанию 15)."""
    value = (settings or {}).get(SETTINGS_KEY)
    return value if value in MINUTES_CHOICES else DEFAULT_MINUTES


def is_due(start: time, now: datetime, minutes: int) -> bool:
    """Пора ли напоминать: до начала осталось (minutes - 1, minutes] минут.

    Задача запускается раз в минуту, поэтому окно шириной в минуту ловит каждую пару
    ровно один раз. Повтор после рестарта отсекает дедупликация в Redis.
    """
    start_at = datetime.combine(now.date(), start, tzinfo=now.tzinfo)
    left = (start_at - now).total_seconds() / 60
    return minutes - 1 < left <= minutes


def visible_to(override: ScheduleOverride, *, student_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    """Групповые переопределения видны всем, личные — только автору.

    Старые личные записи могли сохраниться без student_id, поэтому сверяем и автора.
    """
    if override.scope == OverrideScope.GROUP:
        return True
    return override.student_id == student_id or override.author_id == user_id


def lesson_from_entry(
    entry: ScheduleEntry,
    overrides: Iterable[ScheduleOverride],
    *,
    student_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Lesson | None:
    """Занятие из расписания с учётом переопределений студента; None — пара отменена или скрыта."""
    room = entry.room or entry.location
    link = entry.external_link
    online = bool(entry.external_link)

    for o in overrides:
        if o.entry_id != entry.id or not visible_to(o, student_id=student_id, user_id=user_id):
            continue
        if o.override_type in (OverrideType.CANCEL, OverrideType.SKIP):
            return None
        if o.override_type == OverrideType.ROOM and o.value:
            room = o.value
        elif o.override_type == OverrideType.LINK and o.value:
            link = o.value
        elif o.override_type == OverrideType.ONLINE:
            online = True
            link = o.value or link

    subject = entry.subject.name if entry.subject else "Пара"
    return Lesson(
        key=str(entry.id),
        subject=subject,
        start=entry.start_time,
        end=entry.end_time,
        lesson_type=entry.lesson_type,
        teacher=entry.teacher,
        room=room,
        link=link,
        online=online,
    )


def lesson_from_add(override: ScheduleOverride) -> Lesson | None:
    """Своё занятие (ADD-переопределение): поля лежат в JSON в value."""
    try:
        data: dict[str, Any] = json.loads(override.value or "")
        start = time.fromisoformat(data["start_time"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None
    try:
        end: time | None = time.fromisoformat(data.get("end_time") or "")
    except ValueError:
        end = None

    link = data.get("external_link")
    return Lesson(
        key=f"add:{override.id}",
        subject=data.get("subject") or "Своё занятие",
        start=start,
        end=end,
        lesson_type=data.get("lesson_type"),
        teacher=data.get("teacher"),
        room=data.get("room") or data.get("location"),
        link=link,
        online=bool(link),
    )


def format_reminder(lesson: Lesson, minutes: int) -> str:
    """Текст напоминания (HTML для Telegram)."""
    lines = [f"🔔 <b>Через {minutes} минут — {escape(lesson.subject)}</b>", ""]

    when = lesson.start.strftime("%H:%M")
    if lesson.end:
        when += f"–{lesson.end.strftime('%H:%M')}"
    lines.append(f"🕐 {when}")

    if lesson.lesson_type and lesson.lesson_type != "custom":
        lines.append(f"📖 {escape(lesson.lesson_type)}")
    if lesson.teacher:
        lines.append(f"👤 {escape(lesson.teacher)}")

    if lesson.online:
        lines.append("💻 Онлайн" + ("" if lesson.link else " — ссылки пока нет"))
    if lesson.room and not (lesson.online and _looks_online(lesson.room)):
        lines.append(f"📍 {escape(lesson.room)}")
    if lesson.link:
        lines.append(f'🔗 <a href="{escape(lesson.link, quote=True)}">Подключиться</a>')

    if not lesson.room and not lesson.link:
        lines.append("📍 Аудитория не указана")
    return "\n".join(lines)


def _looks_online(room: str) -> bool:
    """В поле аудитории у онлайн-пар обычно «Webinar» / «Онлайн» — дублировать не нужно."""
    low = room.lower()
    return any(word in low for word in ("webinar", "вебинар", "онлайн", "online", "zoom"))
