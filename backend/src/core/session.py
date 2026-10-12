"""
Сессия хранится в тех же таблицах, что и обычное расписание: это запись
`ScheduleEntry` на одну дату (`date_from == date_to`) с типом занятия «Экзамен»,
«Консультация» и т.п. (глянуть можно _SESSION_TYPE_PREFIXES на 32 строке).
Поэтому она сама попадает в `/schedule`. Отличают её по `lesson_type`
(для показа) и по метке `raw_data["kind"] == "session"` (чтобы импорт обычного
расписания не удалял экзамены, а импорт сессии не трогал обычные пары).
этот модуль без бд и сети.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from typing import Any

SESSION_KIND = "session"
DEFAULT_SESSION_LESSON_TYPE = "Сессия"
DEFAULT_LESSON_MINUTES = 90

# Начала пар (как в rasp_parser._get_default_times).
PAIR_STARTS: tuple[tuple[time, int], ...] = (
    (time(9, 0), 1),
    (time(10, 40), 2),
    (time(12, 20), 3),
    (time(14, 30), 4),
    (time(16, 10), 5),
    (time(17, 50), 6),
    (time(19, 30), 7),
)

# Начала слов после нормализации (нижний регистр, «ё» -> «е»).
_SESSION_TYPE_PREFIXES = ("экзамен", "консультац", "зачет", "диф", "пересдач", "сесс")

_TIME_RE = re.compile(r"^\s*(\d{1,2}):(\d{2})")
_RU_DATE_RE = re.compile(r"^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})")


def normalize_lesson_type(value: str | None) -> str:
    """Приводит тип занятия к виду для сравнения: нижний регистр, «ё» -> «е»."""
    return (value or "").strip().casefold().replace("ё", "е")


def is_session_lesson(lesson_type: str | None) -> bool:
    """Тип занятия относится к сессии (экзамен, консультация, зачёт, пересдача)?"""
    return normalize_lesson_type(lesson_type).startswith(_SESSION_TYPE_PREFIXES)


def has_session_marker(entry: Any) -> bool:
    """Запись создана импортом сессии (по метке в raw_data)."""
    raw = getattr(entry, "raw_data", None)
    return isinstance(raw, dict) and raw.get("kind") == SESSION_KIND


def pair_number_for_time(start: time) -> int:
    """Номер пары по времени начала: последняя пара, которая началась не позже `start`."""
    number = PAIR_STARTS[0][1]
    for pair_start, pair_number in PAIR_STARTS:
        if start >= pair_start:
            number = pair_number
    return number


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        pass
    match = _RU_DATE_RE.match(value)
    if match:
        day, month, year = (int(part) for part in match.groups())
        try:
            return date(year, month, day)
        except ValueError:
            return None
    return None


def _parse_time(value: Any) -> time | None:
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0, tzinfo=None)
    if not isinstance(value, str):
        return None
    match = _TIME_RE.match(value)
    if not match:
        return None
    try:
        return time(int(match.group(1)), int(match.group(2)))
    except ValueError:
        return None


def _add_minutes(day: date, start: time, minutes: int) -> time:
    """Время через `minutes` минут; если уходит за полночь — 23:59."""
    end = datetime.combine(day, start) + timedelta(minutes=minutes)
    if end.date() != day:
        return time(23, 59)
    return end.time()


def _clean_text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def normalize_session_item(item: dict[str, Any]) -> dict[str, Any] | None:
    """Приводит одну запись расписания сессии к виду для создания `ScheduleEntry`.

    Принимает словарь с ключами: `subject`, `date` (ГГГГ-ММ-ДД или ДД.ММ.ГГГГ),
    `start_time` (ЧЧ:ММ) и необязательными `end_time`, `lesson_type`, `teacher`,
    `location`, `room`, `external_link`, `pair_number`.
    Возвращает None, если записью нельзя пользоваться: нет предмета, даты или
    времени начала, либо дата — воскресенье (в расписании приложения дни пн–сб).
    """
    subject = _clean_text(item.get("subject"))
    day = _parse_date(item.get("date"))
    start = _parse_time(item.get("start_time"))
    if subject is None or day is None or start is None:
        return None
    if day.isoweekday() > 6:
        return None

    end = _parse_time(item.get("end_time"))
    if end is None or end <= start:
        end = _add_minutes(day, start, DEFAULT_LESSON_MINUTES)

    raw_pair = item.get("pair_number")
    if isinstance(raw_pair, int) and 1 <= raw_pair <= 7:
        pair_number = raw_pair
    else:
        pair_number = pair_number_for_time(start)

    raw_type = _clean_text(item.get("lesson_type"))
    if raw_type and is_session_lesson(raw_type):
        lesson_type = raw_type.capitalize()
    else:
        lesson_type = raw_type or DEFAULT_SESSION_LESSON_TYPE

    room = _clean_text(item.get("room"))
    location = _clean_text(item.get("location"))
    if room and location and room not in location:
        location = f"{location}, {room}"
    elif room and not location:
        location = room

    # В JSONB кладём только простые значения исходной записи + метку сессии.
    raw_data: dict[str, Any] = {
        key: value
        for key, value in item.items()
        if isinstance(value, str | int | float | bool) or value is None
    }
    raw_data["kind"] = SESSION_KIND

    return {
        "subject": subject,
        "short_name": _clean_text(item.get("short_name")),
        "date": day,
        "weekday": day.isoweekday(),
        "pair_number": pair_number,
        "start_time": start,
        "end_time": end,
        "lesson_type": lesson_type,
        "teacher": _clean_text(item.get("teacher")),
        "location": location,
        "room": room,
        "external_link": _clean_text(item.get("external_link")),
        "raw_data": raw_data,
    }
