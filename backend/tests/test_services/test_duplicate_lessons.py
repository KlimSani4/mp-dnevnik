"""Пара в одной ячейке с разными периодами не должна дублироваться (#135).

Реальный пример из rasp для 241-327: «Автоматизация процессов ЖЦ ПС», четверг, 5 пара,
две записи — с 01.09 по 01.11 и с 02.11 по 27.12. Раньше импорт сводил их в одну строку
по ключу (день, пара, предмет), вторая строка оставалась с тем же периодом, и бот слал
два одинаковых напоминания, а утреннее сообщение считало «4 пар» вместо двух.
"""

import uuid
from datetime import UTC, date, datetime, time
from unittest.mock import AsyncMock, MagicMock

from src.core.models.schedule import ScheduleEntry, Subject
from src.core.services import class_reminder as cr
from src.core.services import daily_digest as dd
from src.core.services.schedule import ScheduleService

SUBJECT = "Автоматизация процессов жизненного цикла программных средств"


def _item(date_from: str, date_to: str, room: str) -> dict[str, object]:
    return {
        "subject": SUBJECT,
        "weekday": 4,
        "pair_number": 5,
        "start_time": "16:10",
        "end_time": "17:40",
        "lesson_type": "Лаб. работа",
        "room": room,
        "location": f"Автозаводская, {room}",
        "date_from": date_from,
        "date_to": date_to,
    }


def _entry(group_id: uuid.UUID, subject: Subject, date_from: date, date_to: date) -> ScheduleEntry:
    e = ScheduleEntry()
    e.id = uuid.uuid4()
    e.group_id = group_id
    e.subject_id = subject.id
    e.subject = subject
    e.weekday = 4
    e.pair_number = 5
    e.start_time = time(16, 10)
    e.end_time = time(17, 40)
    e.date_from = date_from
    e.date_to = date_to
    e.week_parity = None
    e.raw_data = {}
    return e


def _service(existing: list[ScheduleEntry], subject: Subject) -> ScheduleService:
    session = MagicMock()
    session.commit = AsyncMock()
    svc = ScheduleService(session, None)
    group = MagicMock(id=existing[0].group_id if existing else uuid.uuid4())
    svc.group_repo = AsyncMock()
    svc.group_repo.get_by_code = AsyncMock(return_value=group)
    svc.subject_repo = AsyncMock()
    svc.subject_repo.get_or_create = AsyncMock(return_value=subject)
    svc.entry_repo = AsyncMock()
    svc.entry_repo.get_group_schedule = AsyncMock(return_value=existing)
    return svc


def _subject() -> Subject:
    s = Subject()
    s.id = uuid.uuid4()
    s.name = SUBJECT
    return s


SOURCE = [
    _item("2026-09-01", "2026-11-01", "ав5108"),
    _item("2026-11-02", "2026-12-27", "ав5108"),
]


async def test_split_periods_keep_both_entries_with_own_dates() -> None:
    subject = _subject()
    gid = uuid.uuid4()
    first = _entry(gid, subject, date(2026, 9, 1), date(2026, 11, 1))
    second = _entry(gid, subject, date(2026, 11, 2), date(2026, 12, 27))
    # В базе порядок может быть любым: так раньше и появлялся дубль
    svc = _service([second, first], subject)

    await svc.import_schedule("241-327", SOURCE)

    assert (first.date_from, first.date_to) == (date(2026, 9, 1), date(2026, 11, 1))
    assert (second.date_from, second.date_to) == (date(2026, 11, 2), date(2026, 12, 27))
    svc.entry_repo.create.assert_not_called()
    svc.entry_repo.delete.assert_not_called()


async def test_leftover_duplicate_from_old_import_is_removed() -> None:
    """В базе уже лежат две строки с одинаковым периодом (след старого бага)."""
    subject = _subject()
    gid = uuid.uuid4()
    a = _entry(gid, subject, date(2026, 11, 2), date(2026, 12, 27))
    b = _entry(gid, subject, date(2026, 11, 2), date(2026, 12, 27))
    svc = _service([a, b], subject)

    await svc.import_schedule("241-327", SOURCE)

    # Одна строка совпала точно, вторая переиспользована под второй период — дублей нет
    periods = sorted([(a.date_from, a.date_to), (b.date_from, b.date_to)])
    assert periods == [
        (date(2026, 9, 1), date(2026, 11, 1)),
        (date(2026, 11, 2), date(2026, 12, 27)),
    ]
    svc.entry_repo.delete.assert_not_called()


async def test_extra_rows_are_deleted() -> None:
    subject = _subject()
    gid = uuid.uuid4()
    rows = [_entry(gid, subject, date(2026, 11, 2), date(2026, 12, 27)) for _ in range(3)]
    svc = _service(rows, subject)

    await svc.import_schedule("241-327", SOURCE)

    assert svc.entry_repo.delete.await_count == 1


async def test_ids_are_kept_when_period_changes() -> None:
    """Сдвиг периода в rasp не пересоздаёт запись: переопределения привязаны к её id."""
    subject = _subject()
    gid = uuid.uuid4()
    entry = _entry(gid, subject, date(2026, 9, 1), date(2026, 12, 20))
    svc = _service([entry], subject)

    await svc.import_schedule("241-327", [_item("2026-09-01", "2026-12-27", "ав5108")])

    assert entry.date_to == date(2026, 12, 27)
    svc.entry_repo.create.assert_not_called()
    svc.entry_repo.delete.assert_not_called()


def test_reminder_dedup_by_content() -> None:
    a = cr.Lesson(key=str(uuid.uuid4()), subject=SUBJECT, start=time(16, 10), room="ав5108")
    b = cr.Lesson(key=str(uuid.uuid4()), subject=SUBJECT, start=time(16, 10), room="ав5108")
    other = cr.Lesson(key=str(uuid.uuid4()), subject="Экономика", start=time(16, 10))
    assert cr.unique([a, b, other]) == [a, other]
    day = date(2026, 11, 5)
    assert cr.dedup_id(a, day) == cr.dedup_id(b, day)
    assert cr.dedup_id(a, day) != cr.dedup_id(other, day)


# ─── Утреннее сообщение ───


def test_morning_lists_lessons_and_deadlines() -> None:
    today = date(2026, 11, 5)
    lessons = [
        dd.DigestLesson(SUBJECT, time(16, 10), time(17, 40), "Лаб. работа", "ав5108"),
        dd.DigestLesson(SUBJECT, time(16, 10), time(17, 40), "Лаб. работа", "ав5108"),  # дубль
        dd.DigestLesson(SUBJECT, time(14, 30), time(16, 0), "Лаб. работа", "ав5108"),
    ]
    deadlines = [
        dd.DigestDeadline("ЛР №3", "Экономика", datetime(2026, 11, 6, 20, 59, tzinfo=UTC)),
        dd.DigestDeadline("ЛР №2 <html>", "Сети", datetime(2026, 11, 5, 15, 0, tzinfo=UTC)),
    ]
    text = dd.format_morning(lessons, deadlines, today)

    assert "Сегодня 2 пары, 14:30–17:40" in text
    assert text.index("<b>14:30</b>") < text.index("<b>16:10</b>")
    assert text.count("<b>16:10</b>") == 1
    assert "лаб. работа · ав5108" in text
    # дедлайны по порядку, время по Москве, «конец дня» без времени
    assert "• сегодня до 18:00 — ЛР №2 &lt;html&gt;" in text
    assert "• завтра — ЛР №3" in text
    assert text.index("сегодня до 18:00") < text.index("завтра —")


def test_morning_without_lessons_and_deadlines() -> None:
    text = dd.format_morning([], [], date(2026, 11, 5))
    assert text == "☀️ <b>Доброе утро!</b> Сегодня пар нет"


def test_morning_limits_deadlines() -> None:
    deadlines = [
        dd.DigestDeadline(f"Задание {i}", "Предмет", datetime(2026, 11, 6, i, 0, tzinfo=UTC))
        for i in range(8)
    ]
    text = dd.format_morning([], deadlines, date(2026, 11, 5))
    assert text.count("• ") == dd.DEADLINE_MAX
    assert "…и ещё 3" in text


def test_long_subject_is_shortened() -> None:
    text = dd.format_morning(
        [dd.DigestLesson("Очень " * 20, time(9, 0))], [], date(2026, 11, 5)
    )
    line = text.splitlines()[2]
    assert line.endswith("…")
    assert len(line) < 80


def test_plural() -> None:
    forms = ("пара", "пары", "пар")
    assert [dd.plural(n, *forms) for n in (1, 2, 4, 5, 11, 21, 22, 25)] == [
        "пара", "пары", "пары", "пар", "пар", "пара", "пары", "пар",
    ]
