"""Экспорт расписания в iCalendar (.ics, RFC 5545).

Модуль не ходит в БД: он принимает уже готовое расписание по дням
(`ScheduleService.get_schedule_range`) и превращает его в текст файла.
Каждая пара становится отдельным событием на конкретную дату, поэтому в файл
попадают только реальные занятия: чётность недели, диапазоны дат, отмены и
личные правки уже учтены сервисом.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.core.schemas.schedule import DayScheduleResponse, ScheduleEntryWithSubject

# Москва — UTC+3 круглый год (перехода на летнее время нет с 2014 года).
# Фиксированное смещение вместо zoneinfo: не нужен пакет tzdata (например, на Windows).
MSK = timezone(timedelta(hours=3), "MSK")

DEFAULT_LESSON_MINUTES = 90
_MAX_LINE_OCTETS = 75


def escape_text(value: str) -> str:
    """Экранирует текстовое значение по RFC 5545 (раздел 3.3.11)."""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def fold_line(line: str) -> list[str]:
    """Переносит длинную строку: физическая строка не длиннее 75 октетов (RFC 5545, 3.1).

    Продолжение начинается с пробела. Перенос делается по символам, поэтому
    многобайтовые русские буквы не разрезаются.
    """
    parts: list[str] = []
    current = ""
    size = 0
    limit = _MAX_LINE_OCTETS
    for char in line:
        char_size = len(char.encode("utf-8"))
        if size + char_size > limit:
            parts.append(current)
            current, size = char, char_size
            limit = _MAX_LINE_OCTETS - 1  # один октет занимает пробел продолжения
        else:
            current += char
            size += char_size
    parts.append(current)
    return [parts[0], *(" " + part for part in parts[1:])]


def _to_utc(day: date, at: time) -> datetime:
    return datetime.combine(day, at, tzinfo=MSK).astimezone(UTC)


def _format_utc(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _event_lines(day: date, entry: ScheduleEntryWithSubject, stamp: str) -> list[str]:
    start = _to_utc(day, entry.start_time)
    end = _to_utc(day, entry.end_time)
    if end <= start:
        end = start + timedelta(minutes=DEFAULT_LESSON_MINUTES)

    name = entry.subject.name if entry.subject else "Занятие"
    summary = f"{name} ({entry.lesson_type})" if entry.lesson_type else name

    lines = [
        "BEGIN:VEVENT",
        # Стабильный UID: при повторном импорте календарь обновит событие, а не задвоит его.
        f"UID:{entry.id}-{day.isoformat()}@nexora",
        f"DTSTAMP:{stamp}",
        f"DTSTART:{_format_utc(start)}",
        f"DTEND:{_format_utc(end)}",
        f"SUMMARY:{escape_text(summary)}",
    ]

    # В location парсер расписания уже склеивает корпус и аудиторию, поэтому room — запасной вариант.
    place = entry.location or entry.room
    if place:
        lines.append(f"LOCATION:{escape_text(place)}")

    details: list[str] = []
    if entry.teacher:
        details.append(f"Преподаватель: {entry.teacher}")
    if entry.external_link:
        details.append(f"Ссылка: {entry.external_link}")
    if details:
        description = "\n".join(details)
        lines.append(f"DESCRIPTION:{escape_text(description)}")
    if entry.external_link:
        lines.append(f"URL:{entry.external_link}")

    lines.append("END:VEVENT")
    return lines


def count_events(days: Iterable[DayScheduleResponse]) -> int:
    """Сколько занятий в расписании (чтобы не отдавать пустой файл)."""
    return sum(len(day.entries) for day in days)


def build_ics(
    group_code: str,
    days: Iterable[DayScheduleResponse],
    *,
    now: datetime | None = None,
) -> str:
    """Собирает текст .ics-файла (строки разделены CRLF, как требует RFC 5545)."""
    stamp = _format_utc(now or datetime.now(tz=UTC))
    calendar_name = f"Расписание {group_code}"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Nexora//Schedule Export//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_text(calendar_name)}",
    ]
    for day in days:
        for entry in day.entries:
            lines.extend(_event_lines(day.schedule_date, entry, stamp))
    lines.append("END:VCALENDAR")

    folded = [part for line in lines for part in fold_line(line)]
    return "\r\n".join(folded) + "\r\n"
