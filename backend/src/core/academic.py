"""Курс и семестр группы по её коду и дате (#165).

В Политехе код группы начинается с года поступления: «241-327», «24А-431» — набор 2024.
Учебный год — с 1 сентября. Осенний семестр (сентябрь–январь, с зимней сессией) —
нечётный, весенний (февраль–август) — чётный: 1-й курс — семестры 1 и 2, 2-й — 3 и 4.

Если по коду год не понять (ДПО, «Ш-…»), семестра нет — фильтр просто не показываем.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

_YEAR = re.compile(r"^(\d{2})")
MAX_SEMESTER = 12  # бакалавриат — 8, специалитет — до 12


@dataclass(frozen=True)
class AcademicTerm:
    course: int
    semester: int  # сквозной номер с первого курса
    autumn: bool


def admission_year(group_code: str) -> int | None:
    if not isinstance(group_code, str):  # подстраховка: импорт не должен падать из-за семестра
        return None
    m = _YEAR.match(group_code.strip())
    return 2000 + int(m.group(1)) if m else None


def term_for(group_code: str, today: date) -> AcademicTerm | None:
    """Курс и семестр группы на дату. None — по коду не определить."""
    year = admission_year(group_code)
    if year is None:
        return None
    autumn = today.month >= 9 or today.month == 1
    study_year_start = today.year if today.month >= 9 else today.year - 1
    course = study_year_start - year + 1
    if course < 1:
        return None
    semester = course * 2 - (1 if autumn else 0)
    if semester > MAX_SEMESTER:
        return None
    return AcademicTerm(course=course, semester=semester, autumn=autumn)


def course_of(semester: int) -> int:
    return (semester + 1) // 2


def is_autumn(semester: int) -> bool:
    return semester % 2 == 1
