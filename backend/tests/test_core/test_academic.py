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
