"""Курс и семестр по коду группы (#165)."""

from datetime import date

import pytest

from src.core.academic import admission_year, course_of, is_autumn, term_for


@pytest.mark.parametrize(
    ("code", "today", "course", "semester"),
    [
        ("241-327", date(2024, 9, 2), 1, 1),
        ("241-327", date(2025, 1, 20), 1, 1),  # зимняя сессия — ещё осенний семестр
        ("241-327", date(2025, 2, 10), 1, 2),
        ("241-327", date(2026, 11, 28), 3, 5),
        ("24А-431", date(2026, 3, 1), 2, 4),
        ("221-361", date(2026, 11, 28), 5, 9),
    ],
)
def test_term_for(code: str, today: date, course: int, semester: int) -> None:
    term = term_for(code, today)
    assert term is not None
    assert (term.course, term.semester) == (course, semester)


def test_unknown_or_future_codes() -> None:
    assert term_for("ДПО-ЦМ2", date(2026, 11, 28)) is None
    assert admission_year("ДПО-ЦМ2") is None
    assert term_for("271-101", date(2026, 11, 28)) is None  # набор ещё не пришёл
    assert term_for("101-101", date(2026, 11, 28)) is None  # 17-й курс не бывает


def test_helpers() -> None:
    assert [course_of(n) for n in (1, 2, 3, 4, 5)] == [1, 1, 2, 2, 3]
    assert is_autumn(5) and not is_autumn(6)


def test_first_last_lesson_snap_to_weekday() -> None:
    """Период из расписания — по неделям; показываем даты реальных пар (#165)."""
    from datetime import date
    from types import SimpleNamespace

    from src.core.services.subject import _first_lesson, _last_lesson

    # Вт, период 02.11 (пн) — 27.12 (вс) → 03.11 — 22.12
    e = SimpleNamespace(
        weekday=2, date_from=date(2026, 11, 2), date_to=date(2026, 12, 27), week_parity=None
    )
    assert (_first_lesson(e), _last_lesson(e)) == (date(2026, 11, 3), date(2026, 12, 22))  # type: ignore[arg-type]
    # Сб, 01.09 — 13.09 → 05.09 — 12.09
    e = SimpleNamespace(
        weekday=6, date_from=date(2026, 9, 1), date_to=date(2026, 9, 13), week_parity=None
    )
    assert (_first_lesson(e), _last_lesson(e)) == (date(2026, 9, 5), date(2026, 9, 12))  # type: ignore[arg-type]
    # Только чётные недели: 03.11 — 45-я (нечёт) → первая 10.11
    e = SimpleNamespace(
        weekday=2, date_from=date(2026, 11, 2), date_to=date(2026, 12, 27), week_parity="even"
    )
    assert _first_lesson(e) == date(2026, 11, 10)  # type: ignore[arg-type]
    # Без дат — как есть
    e = SimpleNamespace(weekday=2, date_from=None, date_to=None, week_parity=None)
    assert (_first_lesson(e), _last_lesson(e)) == (None, None)  # type: ignore[arg-type]
