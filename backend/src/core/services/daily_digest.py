"""Тексты утреннего сообщения бота: пары на сегодня и ближайшие дедлайны (#135).

Только форматирование, без базы и Telegram, чтобы текст можно было проверить тестами.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, timezone
from html import escape

MOSCOW_TZ = timezone(timedelta(hours=3))

SUBJECT_MAX = 48  # длинные названия предметов обрезаем, чтобы строка помещалась в экран
DEADLINE_DAYS = 3  # дедлайны: сегодня и ещё два дня
DEADLINE_MAX = 5


@dataclass(frozen=True)
class DigestLesson:
    subject: str
    start: time
    end: time | None = None
    lesson_type: str | None = None
    place: str | None = None


@dataclass(frozen=True)
class DigestDeadline:
    title: str
    subject: str
    deadline: datetime


def plural(n: int, one: str, few: str, many: str) -> str:
    """Форма слова для числа: 1 пара, 2 пары, 5 пар."""
    n = abs(n) % 100
    if 11 <= n <= 14:
        return many
    if n % 10 == 1:
        return one
    if 2 <= n % 10 <= 4:
        return few
    return many


def shorten(text: str, limit: int = SUBJECT_MAX) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def unique_lessons(lessons: Iterable[DigestLesson]) -> list[DigestLesson]:
    """Одна пара — одна строка: одинаковые записи (время, предмет, место) схлопываются."""
    seen: set[tuple[time, str, str | None]] = set()
    out: list[DigestLesson] = []
    for lesson in sorted(lessons, key=lambda x: x.start):
        key = (lesson.start, lesson.subject, lesson.place)
        if key in seen:
            continue
        seen.add(key)
        out.append(lesson)
    return out


def _deadline_when(deadline: datetime, today: date) -> str:
    local = (deadline if deadline.tzinfo else deadline.replace(tzinfo=UTC)).astimezone(MOSCOW_TZ)
    days = (local.date() - today).days
    day = {0: "сегодня", 1: "завтра"}.get(days, local.strftime("%d.%m"))
    # Время показываем, только если это не «конец дня»
    if (local.hour, local.minute) in ((23, 59), (0, 0)):
        return day
    return f"{day} до {local.strftime('%H:%M')}"


def format_morning(
    lessons: Sequence[DigestLesson],
    deadlines: Sequence[DigestDeadline],
    today: date,
) -> str:
    """Утреннее сообщение (HTML для Telegram)."""
    lessons = unique_lessons(lessons)
    lines: list[str] = []

    if lessons:
        n = len(lessons)
        first, last = lessons[0], lessons[-1]
        span = first.start.strftime("%H:%M")
        if last.end:
            span += f"–{last.end.strftime('%H:%M')}"
        lines.append(
            f"☀️ <b>Доброе утро!</b> Сегодня {n} {plural(n, 'пара', 'пары', 'пар')}, {span}"
        )
        lines.append("")
        for lesson in lessons:
            details = [escape(shorten(lesson.subject))]
            if lesson.lesson_type:
                details.append(escape(lesson.lesson_type.lower()))
            if lesson.place:
                details.append(escape(lesson.place))
            lines.append(f"<b>{lesson.start.strftime('%H:%M')}</b>  " + " · ".join(details))
    else:
        lines.append("☀️ <b>Доброе утро!</b> Сегодня пар нет")

    if deadlines:
        shown = sorted(deadlines, key=lambda d: d.deadline)[:DEADLINE_MAX]
        lines.append("")
        lines.append("⏰ <b>Дедлайны</b>")
        for d in shown:
            lines.append(
                f"• {_deadline_when(d.deadline, today)} — {escape(shorten(d.title, 60))}"
                f" <i>({escape(shorten(d.subject, 32))})</i>"
            )
        rest = len(deadlines) - len(shown)
        if rest > 0:
            lines.append(f"…и ещё {rest}")

    return "\n".join(lines)
