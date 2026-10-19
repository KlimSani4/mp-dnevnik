"""Напоминание о паре за 10–15 минут (#26)."""

import json
import uuid
from datetime import datetime, time, timedelta, timezone
from types import SimpleNamespace

import pytest

from src.core.models.schedule import OverrideScope, OverrideType
from src.core.services import class_reminder as cr

MSK = timezone(timedelta(hours=3))


def _entry(**kw: object) -> SimpleNamespace:
    data: dict[str, object] = {
        "id": uuid.uuid4(),
        "subject": SimpleNamespace(name="Базы данных"),
        "start_time": time(10, 40),
        "end_time": time(12, 10),
        "lesson_type": "Лекция",
        "teacher": "Иванов И.И.",
        "room": None,
        "location": "Пр1407",
        "external_link": None,
    }
    data.update(kw)
    return SimpleNamespace(**data)


def _override(entry_id: uuid.UUID, type_: OverrideType, **kw: object) -> SimpleNamespace:
    data: dict[str, object] = {
        "id": uuid.uuid4(),
        "entry_id": entry_id,
        "override_type": type_,
        "scope": OverrideScope.GROUP,
        "value": None,
        "student_id": None,
        "author_id": uuid.uuid4(),
    }
    data.update(kw)
    return SimpleNamespace(**data)


STUDENT = uuid.uuid4()
USER = uuid.uuid4()


def _lesson(entry: SimpleNamespace, overrides: list[SimpleNamespace]) -> cr.Lesson | None:
    return cr.lesson_from_entry(entry, overrides, student_id=STUDENT, user_id=USER)  # type: ignore[arg-type]


class TestReminderMinutes:
    def test_default_is_15(self) -> None:
        assert cr.reminder_minutes(None) == 15
        assert cr.reminder_minutes({}) == 15

    def test_user_choice(self) -> None:
        assert cr.reminder_minutes({cr.SETTINGS_KEY: 10}) == 10

    @pytest.mark.parametrize("bad", [5, "10", 30, None])
    def test_invalid_falls_back(self, bad: object) -> None:
        assert cr.reminder_minutes({cr.SETTINGS_KEY: bad}) == 15


class TestIsDue:
    @pytest.mark.parametrize(
        ("now", "minutes", "expected"),
        [
            (datetime(2026, 10, 19, 10, 25, 3, tzinfo=MSK), 15, True),  # 14.95 мин
            (datetime(2026, 10, 19, 10, 25, 0, tzinfo=MSK), 15, True),  # ровно 15
            (datetime(2026, 10, 19, 10, 24, 30, tzinfo=MSK), 15, False),  # 15.5 — рано
            (datetime(2026, 10, 19, 10, 26, 1, tzinfo=MSK), 15, False),  # уже < 14 — прошло
            (datetime(2026, 10, 19, 10, 30, 2, tzinfo=MSK), 10, True),
            (datetime(2026, 10, 19, 10, 30, 2, tzinfo=MSK), 15, False),
            (datetime(2026, 10, 19, 10, 41, 0, tzinfo=MSK), 15, False),  # пара уже идёт
        ],
    )
    def test_window(self, now: datetime, minutes: int, expected: bool) -> None:
        assert cr.is_due(time(10, 40), now, minutes) is expected

    def test_each_minute_fires_once(self) -> None:
        start = datetime(2026, 10, 19, 10, 0, 5, tzinfo=MSK)
        ticks = [start + timedelta(minutes=i) for i in range(60)]
        assert sum(cr.is_due(time(10, 40), t, 15) for t in ticks) == 1


class TestLessonFromEntry:
    def test_plain_lesson_has_room(self) -> None:
        lesson = _lesson(_entry(), [])
        assert lesson is not None
        assert lesson.room == "Пр1407"
        assert lesson.link is None
        assert not lesson.online

    def test_external_link_means_online(self) -> None:
        lesson = _lesson(
            _entry(external_link="https://online.mospolytech.ru/x", location="Webinar"), []
        )
        assert lesson is not None
        assert lesson.online
        assert lesson.link == "https://online.mospolytech.ru/x"

    @pytest.mark.parametrize("type_", [OverrideType.CANCEL, OverrideType.SKIP])
    def test_cancelled_or_hidden_is_skipped(self, type_: OverrideType) -> None:
        e = _entry()
        assert _lesson(e, [_override(e.id, type_)]) is None

    def test_own_personal_skip_hides(self) -> None:
        e = _entry()
        o = _override(e.id, OverrideType.SKIP, scope=OverrideScope.PERSONAL, student_id=STUDENT)
        assert _lesson(e, [o]) is None

    def test_legacy_personal_skip_without_student_matches_author(self) -> None:
        e = _entry()
        o = _override(e.id, OverrideType.SKIP, scope=OverrideScope.PERSONAL, author_id=USER)
        assert _lesson(e, [o]) is None

    def test_someone_elses_personal_skip_is_ignored(self) -> None:
        e = _entry()
        o = _override(
            e.id, OverrideType.SKIP, scope=OverrideScope.PERSONAL, student_id=uuid.uuid4()
        )
        assert _lesson(e, [o]) is not None

    def test_override_of_other_entry_is_ignored(self) -> None:
        e = _entry()
        assert _lesson(e, [_override(uuid.uuid4(), OverrideType.CANCEL)]) is not None

    def test_room_link_online_overrides(self) -> None:
        e = _entry()
        lesson = _lesson(
            e,
            [
                _override(e.id, OverrideType.ROOM, value="Ав4512"),
                _override(e.id, OverrideType.ONLINE, value="https://zoom.us/j/1"),
            ],
        )
        assert lesson is not None
        assert lesson.room == "Ав4512"
        assert lesson.online
        assert lesson.link == "https://zoom.us/j/1"


class TestLessonFromAdd:
    def test_parses_custom_event(self) -> None:
        o = _override(
            uuid.uuid4(),
            OverrideType.ADD,
            value=json.dumps({"subject": "Консультация", "start_time": "18:00", "room": "Б-201"}),
        )
        lesson = cr.lesson_from_add(o)  # type: ignore[arg-type]
        assert lesson is not None
        assert lesson.subject == "Консультация"
        assert lesson.start == time(18, 0)
        assert lesson.room == "Б-201"
        assert lesson.key.startswith("add:")

    @pytest.mark.parametrize("value", [None, "", "not json", json.dumps({"subject": "x"})])
    def test_broken_value(self, value: str | None) -> None:
        o = _override(uuid.uuid4(), OverrideType.ADD, value=value)
        assert cr.lesson_from_add(o) is None  # type: ignore[arg-type]


class TestFormat:
    def test_offline(self) -> None:
        text = cr.format_reminder(
            cr.Lesson("k", "Матан", time(9, 0), time(10, 30), room="Пр1407"), 15
        )
        assert "Через 15 минут — Матан" in text
        assert "09:00–10:30" in text
        assert "📍 Пр1407" in text
        assert "Подключиться" not in text

    def test_online_with_link_hides_webinar_room(self) -> None:
        lesson = cr.Lesson(
            "k", "Матан", time(9, 0), room="Webinar", link="https://x.ru/a?b=1&c=2", online=True
        )
        text = cr.format_reminder(lesson, 10)
        assert "Через 10 минут" in text
        assert "💻 Онлайн" in text
        assert "Webinar" not in text
        assert 'href="https://x.ru/a?b=1&amp;c=2"' in text

    def test_online_without_link(self) -> None:
        text = cr.format_reminder(cr.Lesson("k", "Матан", time(9, 0), online=True), 15)
        assert "ссылки пока нет" in text

    def test_no_room_no_link(self) -> None:
        text = cr.format_reminder(cr.Lesson("k", "Матан", time(9, 0)), 15)
        assert "Аудитория не указана" in text

    def test_html_is_escaped(self) -> None:
        text = cr.format_reminder(cr.Lesson("k", "<b>x</b>", time(9, 0), teacher="A & B"), 15)
        assert "&lt;b&gt;x&lt;/b&gt;" in text
        assert "A &amp; B" in text
