"""Тесты экспорта расписания в .ics (src/core/ics.py). БД и сеть не нужны."""

import uuid
from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from typing import Any

from src.core.ics import build_ics, count_events, escape_text, fold_line

NOW = datetime(2026, 10, 11, 12, 0, tzinfo=UTC)


def _entry(**overrides: Any) -> SimpleNamespace:
    base: dict[str, Any] = {
        "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
        "subject": SimpleNamespace(name="Математика"),
        "lesson_type": "Лекция",
        "start_time": time(9, 0),
        "end_time": time(10, 30),
        "location": "Пр2403",
        "room": "2403",
        "teacher": "Иванов Иван Иванович",
        "external_link": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _day(*entries: SimpleNamespace, day: date = date(2026, 10, 12)) -> SimpleNamespace:
    # 12 октября 2026 — понедельник
    return SimpleNamespace(schedule_date=day, entries=list(entries))


def _unfold(ics: str) -> str:
    return ics.replace("\r\n ", "")


def test_event_times_are_converted_from_moscow_to_utc() -> None:
    ics = build_ics("241-327", [_day(_entry())], now=NOW)

    assert "DTSTART:20261012T060000Z" in ics  # 09:00 МСК
    assert "DTEND:20261012T073000Z" in ics  # 10:30 МСК
    assert "DTSTAMP:20261011T120000Z" in ics


def test_file_structure_and_line_endings() -> None:
    ics = build_ics("241-327", [_day(_entry())], now=NOW)

    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert ics.endswith("END:VCALENDAR\r\n")
    assert "\n" not in ics.replace("\r\n", "")  # нет «голых» переводов строки
    assert ics.count("BEGIN:VEVENT") == ics.count("END:VEVENT") == 1
    assert "X-WR-CALNAME:Расписание 241-327" in ics


def test_summary_location_and_description() -> None:
    ics = _unfold(build_ics("241-327", [_day(_entry())], now=NOW))

    assert "SUMMARY:Математика (Лекция)" in ics
    assert "LOCATION:Пр2403\r\n" in ics  # location, а не «Пр2403, 2403»
    assert "DESCRIPTION:Преподаватель: Иванов Иван Иванович" in ics


def test_room_is_used_when_location_is_empty() -> None:
    ics = build_ics("241-327", [_day(_entry(location=None, room="1320"))], now=NOW)

    assert "LOCATION:1320" in ics


def test_no_location_and_no_teacher_lines_when_empty() -> None:
    entry = _entry(location=None, room=None, teacher=None)
    ics = build_ics("241-327", [_day(entry)], now=NOW)

    assert "LOCATION" not in ics
    assert "DESCRIPTION" not in ics


def test_online_link_goes_to_description_and_url() -> None:
    entry = _entry(external_link="https://example.com/room?id=1,2")
    ics = _unfold(build_ics("241-327", [_day(entry)], now=NOW))

    assert "URL:https://example.com/room?id=1,2" in ics
    assert "Ссылка: https://example.com/room?id=1\\,2" in ics  # в тексте запятая экранирована


def test_uid_is_stable_between_exports_and_unique_per_date() -> None:
    entry = _entry()
    first = build_ics("241-327", [_day(entry)], now=NOW)
    second = build_ics("241-327", [_day(entry)], now=datetime(2026, 11, 1, tzinfo=UTC))
    other_day = build_ics("241-327", [_day(entry, day=date(2026, 10, 19))], now=NOW)

    uid = f"UID:{entry.id}-2026-10-12@nexora"
    assert uid in first
    assert uid in second
    assert f"UID:{entry.id}-2026-10-19@nexora" in other_day


def test_end_not_after_start_gets_default_duration() -> None:
    entry = _entry(start_time=time(10, 0), end_time=time(10, 0))
    ics = build_ics("241-327", [_day(entry)], now=NOW)

    assert "DTSTART:20261012T070000Z" in ics
    assert "DTEND:20261012T083000Z" in ics  # +90 минут


def test_subject_without_type_has_plain_summary() -> None:
    ics = build_ics("241-327", [_day(_entry(lesson_type=None))], now=NOW)

    assert "SUMMARY:Математика\r\n" in ics


def test_empty_schedule_is_still_a_valid_calendar() -> None:
    ics = build_ics("241-327", [_day()], now=NOW)

    assert "BEGIN:VEVENT" not in ics
    assert count_events([_day()]) == 0


def test_count_events_counts_all_days() -> None:
    days = [_day(_entry(), _entry()), _day(_entry(), day=date(2026, 10, 13))]

    assert count_events(days) == 3


def test_no_recurrence_rules_are_generated() -> None:
    ics = build_ics("241-327", [_day(_entry())], now=NOW)

    assert "RRULE" not in ics


def test_escape_text_handles_special_characters() -> None:
    assert escape_text("a,b;c\\d") == "a\\,b\\;c\\\\d"
    assert escape_text("строка1\nстрока2") == "строка1\\nстрока2"
    assert escape_text("строка1\r\nстрока2") == "строка1\\nстрока2"


def test_special_characters_in_subject_do_not_break_the_file() -> None:
    entry = _entry(subject=SimpleNamespace(name="Базы данных, ч. 1; сети\nи связь"))
    ics = _unfold(build_ics("241-327", [_day(entry)], now=NOW))

    assert "SUMMARY:Базы данных\\, ч. 1\\; сети\\nи связь (Лекция)" in ics


def test_long_lines_are_folded_to_75_octets_and_unfold_back() -> None:
    long_name = "Автоматизация процессов жизненного цикла программных средств " * 3
    entry = _entry(subject=SimpleNamespace(name=long_name.strip()))
    ics = build_ics("241-327", [_day(entry)], now=NOW)

    for physical_line in ics.split("\r\n"):
        assert len(physical_line.encode("utf-8")) <= 75

    assert f"SUMMARY:{long_name.strip()} (Лекция)" in _unfold(ics)


def test_fold_line_does_not_split_multibyte_characters() -> None:
    line = "SUMMARY:" + "я" * 100
    parts = fold_line(line)

    assert len(parts) > 1
    assert all(len(part.encode("utf-8")) <= 75 for part in parts)
    assert all(part.startswith(" ") for part in parts[1:])
    assert "".join([parts[0], *(part[1:] for part in parts[1:])]) == line
    parts[0].encode("utf-8").decode("utf-8")  # не должно падать: символы целые


def test_short_line_is_not_folded() -> None:
    assert fold_line("SUMMARY:Математика") == ["SUMMARY:Математика"]
