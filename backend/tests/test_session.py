"""Тесты расписания сессии (src/core/session.py и отметка is_session в схеме). БД и сеть не нужны."""

import json
import uuid
from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from typing import Any

from src.core.session import (
    SESSION_KIND,
    has_session_marker,
    is_session_lesson,
    normalize_session_item,
    pair_number_for_time,
)

# На всякий: 14 октября 2026 — среда, 18 октября 2026 — воскресенье


def _item(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "subject": "Базы данных",
        "date": "2026-10-14",
        "start_time": "09:00",
        "end_time": "10:30",
        "lesson_type": "Экзамен",
        "teacher": "Петров Пётр Петрович",
        "location": "Пр2403",
        "room": "2403",
    }
    base.update(overrides)
    return base


def test_session_lesson_types_are_recognized() -> None:
    for lesson_type in (
        "Экзамен",
        "экзамен",
        "ЭКЗАМЕН (устный)",
        "Консультация",
        "Зачёт",
        "Зачет",
        "Дифф. зачёт",
        "Дифференцированный зачёт",
        "Пересдача",
        "Сессия",
    ):
        assert is_session_lesson(lesson_type), lesson_type


def test_regular_lesson_types_are_not_session() -> None:
    for lesson_type in ("Лекция", "Практика", "Лаб. работа", "custom", "", None):
        assert not is_session_lesson(lesson_type), lesson_type


def test_has_session_marker() -> None:
    assert has_session_marker(SimpleNamespace(raw_data={"kind": SESSION_KIND}))
    assert not has_session_marker(SimpleNamespace(raw_data={}))
    assert not has_session_marker(SimpleNamespace(raw_data=None))
    assert not has_session_marker(SimpleNamespace(raw_data={"kind": "other"}))
    assert not has_session_marker(SimpleNamespace())


def test_pair_number_for_time() -> None:
    assert pair_number_for_time(time(9, 0)) == 1
    assert pair_number_for_time(time(10, 0)) == 1
    assert pair_number_for_time(time(10, 40)) == 2
    assert pair_number_for_time(time(14, 29)) == 3
    assert pair_number_for_time(time(14, 30)) == 4
    assert pair_number_for_time(time(19, 30)) == 7
    assert pair_number_for_time(time(21, 0)) == 7
    assert pair_number_for_time(time(8, 0)) == 1


def test_normalize_basic_item() -> None:
    result = normalize_session_item(_item())

    assert result is not None
    assert result["subject"] == "Базы данных"
    assert result["date"] == date(2026, 10, 14)
    assert result["weekday"] == 3
    assert result["pair_number"] == 1
    assert result["start_time"] == time(9, 0)
    assert result["end_time"] == time(10, 30)
    assert result["lesson_type"] == "Экзамен"
    assert result["teacher"] == "Петров Пётр Петрович"
    assert result["location"] == "Пр2403"  # аудитория уже входит в название места
    assert result["room"] == "2403"
    assert result["raw_data"]["kind"] == SESSION_KIND


def test_normalize_accepts_russian_date_and_short_time() -> None:
    result = normalize_session_item(_item(date="14.10.2026", start_time="9:00", end_time="10:30"))

    assert result is not None
    assert result["date"] == date(2026, 10, 14)
    assert result["start_time"] == time(9, 0)


def test_normalize_accepts_date_and_time_objects() -> None:
    result = normalize_session_item(
        _item(date=date(2026, 10, 14), start_time=time(12, 20), end_time=time(13, 50))
    )

    assert result is not None
    assert result["pair_number"] == 3
    assert result["end_time"] == time(13, 50)


def test_items_without_required_fields_are_skipped() -> None:
    assert normalize_session_item(_item(subject="")) is None
    assert normalize_session_item(_item(subject=None)) is None
    assert normalize_session_item(_item(date=None)) is None
    assert normalize_session_item(_item(date="не дата")) is None
    assert normalize_session_item(_item(date="31.02.2026")) is None
    assert normalize_session_item(_item(start_time=None)) is None
    assert normalize_session_item(_item(start_time="утром")) is None


def test_sunday_is_skipped() -> None:
    assert normalize_session_item(_item(date="2026-10-18")) is None


def test_missing_or_wrong_end_time_gets_default_duration() -> None:
    no_end = normalize_session_item(_item(end_time=None))
    wrong_end = normalize_session_item(_item(end_time="08:00"))

    assert no_end is not None and no_end["end_time"] == time(10, 30)
    assert wrong_end is not None and wrong_end["end_time"] == time(10, 30)


def test_default_end_time_does_not_cross_midnight() -> None:
    result = normalize_session_item(_item(start_time="23:00", end_time=None))

    assert result is not None
    assert result["end_time"] == time(23, 59)


def test_explicit_pair_number_is_used_only_when_valid() -> None:
    explicit = normalize_session_item(_item(start_time="09:00", pair_number=3))
    invalid = normalize_session_item(_item(start_time="09:00", pair_number=9))

    assert explicit is not None and explicit["pair_number"] == 3
    assert invalid is not None and invalid["pair_number"] == 1


def test_lesson_type_is_normalized_or_defaulted() -> None:
    shouted = normalize_session_item(_item(lesson_type="КОНСУЛЬТАЦИЯ"))
    empty = normalize_session_item(_item(lesson_type=None))
    unknown = normalize_session_item(_item(lesson_type="Показ работ"))

    assert shouted is not None and shouted["lesson_type"] == "Консультация"
    assert empty is not None and empty["lesson_type"] == "Сессия"
    assert unknown is not None and unknown["lesson_type"] == "Показ работ"


def test_room_and_location_are_combined_like_the_regular_parser() -> None:
    only_room = normalize_session_item(_item(location=None, room="1320"))
    both = normalize_session_item(_item(location="Большая Семёновская", room="305"))
    room_in_location = normalize_session_item(_item(location="Пр2403", room="2403"))
    only_location = normalize_session_item(_item(location="ав5103", room=None))

    assert only_room is not None and only_room["location"] == "1320"
    assert both is not None and both["location"] == "Большая Семёновская, 305"
    assert room_in_location is not None and room_in_location["location"] == "Пр2403"
    assert only_location is not None and only_location["location"] == "ав5103"
    assert only_location["room"] is None


def test_raw_data_is_json_serializable() -> None:
    result = normalize_session_item(_item(date=date(2026, 10, 14), extra=object()))

    assert result is not None
    json.dumps(result["raw_data"])  # не должно падать: даты и объекты не попадают в JSONB
    assert "extra" not in result["raw_data"]
    assert result["raw_data"]["kind"] == SESSION_KIND


def test_schema_marks_session_entries() -> None:
    from src.core.schemas.schedule import ScheduleEntryWithSubject

    now = datetime(2026, 10, 11, tzinfo=UTC)

    def entry(lesson_type: str | None) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            group_id=uuid.uuid4(),
            subject_id=uuid.uuid4(),
            weekday=3,
            pair_number=1,
            start_time=time(9, 0),
            end_time=time(10, 30),
            location=None,
            room=None,
            teacher=None,
            lesson_type=lesson_type,
            date_from=date(2026, 10, 14),
            date_to=date(2026, 10, 14),
            week_parity=None,
            external_link=None,
            created_at=now,
            updated_at=now,
            subject=SimpleNamespace(
                id=uuid.uuid4(),
                name="Базы данных",
                short_name=None,
                group_id=None,
                is_custom=False,
            ),
        )

    assert ScheduleEntryWithSubject.model_validate(entry("Экзамен")).is_session is True
    assert ScheduleEntryWithSubject.model_validate(entry("Консультация")).is_session is True
    assert ScheduleEntryWithSubject.model_validate(entry("Лекция")).is_session is False
    assert ScheduleEntryWithSubject.model_validate(entry(None)).is_session is False
