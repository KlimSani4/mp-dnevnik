"""Выгрузка на несколько недель: те же занятия, что по дням, но фиксированное число запросов.
!!!! Тесты не требуют БД: репозитории заменены памятью, а фильтры повторяют условия SQL
из `ScheduleOverrideRepository`. !!!!
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from typing import Any

import pytest

from src.core.models.schedule import OverrideScope, OverrideType
from src.core.repositories.schedule import entry_applies_on
from src.core.services.schedule import ScheduleService
from src.shared.exceptions import NotFoundError

GROUP_ID = uuid.uuid4()
USER_ID = uuid.uuid4()
STUDENT_ID = uuid.uuid4()
OTHER_STUDENT_ID = uuid.uuid4()
OTHER_USER_ID = uuid.uuid4()
NOW = datetime(2026, 10, 1, tzinfo=UTC)

SUBJECT = SimpleNamespace(
    id=uuid.uuid4(), name="Базы данных", short_name="БД", group_id=GROUP_ID, is_custom=False
)


def make_entry(weekday: int, pair: int, **kwargs: Any) -> SimpleNamespace:
    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "group_id": GROUP_ID,
        "subject_id": SUBJECT.id,
        "weekday": weekday,
        "pair_number": pair,
        "start_time": time(9, 0),
        "end_time": time(10, 30),
        "location": None,
        "room": None,
        "teacher": None,
        "lesson_type": "Лекция",
        "date_from": None,
        "date_to": None,
        "week_parity": None,
        "external_link": None,
        "created_at": NOW,
        "updated_at": NOW,
        "subject": SUBJECT,
    }
    data.update(kwargs)
    return SimpleNamespace(**data)


def make_override(entry_id: uuid.UUID, **kwargs: Any) -> SimpleNamespace:
    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "entry_id": entry_id,
        "scope": OverrideScope.GROUP,
        "override_type": OverrideType.CANCEL,
        "value": None,
        "date": None,
        "author_id": USER_ID,
        "student_id": None,
        "created_at": NOW,
    }
    data.update(kwargs)
    return SimpleNamespace(**data)


class FakeGroupRepo:
    def __init__(self, calls: dict[str, int]) -> None:
        self.calls = calls

    async def get_by_code(self, code: str) -> SimpleNamespace | None:
        self.calls["group"] += 1
        return SimpleNamespace(id=GROUP_ID, code=code) if code == "241-327" else None


class FakeStudentRepo:
    def __init__(self, calls: dict[str, int]) -> None:
        self.calls = calls

    async def get_user_students(self, user_id: uuid.UUID) -> list[SimpleNamespace]:
        self.calls["student"] += 1
        if user_id == USER_ID:
            return [SimpleNamespace(id=STUDENT_ID, group_id=GROUP_ID)]
        return []


class FakeEntryRepo:
    def __init__(self, entries: list[SimpleNamespace], calls: dict[str, int]) -> None:
        self.entries = entries
        self.calls = calls

    async def get_group_schedule(self, _group_id: uuid.UUID, **_: Any) -> list[SimpleNamespace]:
        self.calls["entries"] += 1
        return sorted(self.entries, key=lambda e: (e.weekday, e.pair_number))

    async def get_day_schedule(self, _group_id: uuid.UUID, day: date) -> list[SimpleNamespace]:
        self.calls["entries"] += 1
        found = [e for e in self.entries if entry_applies_on(e, day)]
        return sorted(found, key=lambda e: e.pair_number)


class FakeOverrideRepo:
    """Условия фильтров повторяют SQL из ScheduleOverrideRepository."""

    def __init__(self, overrides: list[SimpleNamespace], calls: dict[str, int]) -> None:
        self.overrides = overrides
        self.calls = calls

    @staticmethod
    def _visible(o: SimpleNamespace, student_id: uuid.UUID | None) -> bool:
        if student_id is None:
            return True
        return o.student_id == student_id or o.scope == OverrideScope.GROUP

    async def get_entry_overrides(
        self, entry_id: uuid.UUID, *, target_date: date | None = None, student_id=None
    ) -> list[SimpleNamespace]:
        self.calls["overrides"] += 1
        return [
            o
            for o in self.overrides
            if o.entry_id == entry_id
            and (target_date is None or o.date is None or o.date == target_date)
            and self._visible(o, student_id)
        ]

    async def get_overrides_for_entries(
        self, entry_ids, *, start: date, end: date, student_id=None
    ) -> list[SimpleNamespace]:
        self.calls["overrides"] += 1
        return [
            o
            for o in self.overrides
            if o.entry_id in set(entry_ids)
            and (o.date is None or start <= o.date <= end)
            and self._visible(o, student_id)
        ]

    def _add_visible(self, o: SimpleNamespace, author_id: uuid.UUID | None) -> bool:
        if o.override_type != OverrideType.ADD:
            return False
        if o.scope == OverrideScope.GROUP:
            return True
        return (
            author_id is not None and o.scope == OverrideScope.PERSONAL and o.author_id == author_id
        )

    async def get_add_overrides_for_date(
        self, _group_id: uuid.UUID, day: date, *, author_id=None
    ) -> list[SimpleNamespace]:
        self.calls["add"] += 1
        return [
            o
            for o in self.overrides
            if (o.date is None or o.date == day) and self._add_visible(o, author_id)
        ]

    async def get_add_overrides_between(
        self, _group_id: uuid.UUID, start: date, end: date, *, author_id=None
    ) -> list[SimpleNamespace]:
        self.calls["add"] += 1
        return [
            o
            for o in self.overrides
            if (o.date is None or start <= o.date <= end) and self._add_visible(o, author_id)
        ]


def build_service() -> tuple[ScheduleService, dict[str, int]]:
    calls = {"group": 0, "student": 0, "entries": 0, "overrides": 0, "add": 0}

    every_monday = make_entry(1, 1)
    even_tuesday = make_entry(2, 2, week_parity="even")
    wednesday_range = make_entry(
        3, 3, week_parity="odd", date_from=date(2026, 10, 21), date_to=date(2026, 11, 25)
    )
    thursday = make_entry(4, 1)
    friday = make_entry(5, 2)
    exam = make_entry(
        6, 1, lesson_type="Экзамен", date_from=date(2026, 10, 17), date_to=date(2026, 10, 17)
    )
    entries = [every_monday, even_tuesday, wednesday_range, thursday, friday, exam]

    custom = json.dumps({"subject": "Своё дело", "start_time": "10:40", "end_time": "12:10"})
    overrides = [
        # группа отменила четверг только 15 октября
        make_override(thursday.id, date=date(2026, 10, 15)),
        # личная отмена пятниц у этого студента
        make_override(
            friday.id,
            scope=OverrideScope.PERSONAL,
            override_type=OverrideType.SKIP,
            student_id=STUDENT_ID,
        ),
        # личная отмена понедельников у ДРУГОГО студента: не должна влиять
        make_override(
            every_monday.id,
            scope=OverrideScope.PERSONAL,
            student_id=OTHER_STUDENT_ID,
            author_id=OTHER_USER_ID,
        ),
        # не отмена: на расписание не влияет
        make_override(every_monday.id, override_type=OverrideType.NOTE, value="принести ноутбук"),
        # личное событие автора на один день и чужое личное событие
        make_override(
            every_monday.id,
            scope=OverrideScope.PERSONAL,
            override_type=OverrideType.ADD,
            value=custom,
            date=date(2026, 10, 14),
        ),
        make_override(
            every_monday.id,
            scope=OverrideScope.PERSONAL,
            override_type=OverrideType.ADD,
            value=custom,
            date=date(2026, 10, 14),
            author_id=OTHER_USER_ID,
        ),
    ]

    service = ScheduleService.__new__(ScheduleService)
    service.session = None
    service.redis = None
    service.group_repo = FakeGroupRepo(calls)
    service.student_repo = FakeStudentRepo(calls)
    service.entry_repo = FakeEntryRepo(entries, calls)
    service.override_repo = FakeOverrideRepo(overrides, calls)
    return service, calls


def dump(days: list[Any]) -> list[dict[str, Any]]:
    return [d.model_dump(mode="json") for d in days]


async def per_day(service: ScheduleService, start: date, weeks: int, user_id) -> list[Any]:
    days = []
    for week in range(weeks):
        for offset in range(6):
            day = date.fromordinal(start.toordinal() - start.weekday() + 7 * week + offset)
            days.append(
                await service.get_day_schedule("241-327", day, user_id=user_id, auto_import=False)
            )
    return days


@pytest.mark.parametrize("user_id", [USER_ID, None])
def test_range_equals_day_by_day(user_id: uuid.UUID | None) -> None:
    service, _ = build_service()
    start = date(2026, 10, 12)

    async def run() -> tuple[list[Any], list[Any]]:
        fast = await service.get_schedule_range("241-327", start, 18, user_id=user_id)
        slow = await per_day(service, start, 18, user_id)
        return fast, slow

    fast, slow = asyncio.run(run())

    assert len(fast) == 18 * 6
    assert dump(fast) == dump(slow)


def test_range_has_exam_and_respects_overrides() -> None:
    service, _ = build_service()
    days = asyncio.run(
        service.get_schedule_range("241-327", date(2026, 10, 12), 2, user_id=USER_ID)
    )
    by_date = {d.schedule_date: d for d in days}

    exam_day = by_date[date(2026, 10, 17)]
    assert [e.lesson_type for e in exam_day.entries] == ["Экзамен"]
    assert by_date[date(2026, 10, 15)].entries == []  # четверг отменён группой
    assert by_date[date(2026, 10, 22)].entries != []  # другой четверг остался
    assert by_date[date(2026, 10, 16)].entries == []  # пятница отменена лично студентом
    monday = by_date[date(2026, 10, 12)].entries
    assert [e.lesson_type for e in monday] == ["Лекция"]  # чужая личная отмена не мешает
    custom = [e.subject.name for e in by_date[date(2026, 10, 14)].entries]
    assert custom.count("Своё дело") == 1  # свой ADD есть, чужой нет


def test_query_count_does_not_depend_on_weeks() -> None:
    expected = {"group": 1, "student": 1, "entries": 1, "overrides": 1, "add": 1}
    for weeks in (1, 18, 26):
        service, calls = build_service()
        asyncio.run(
            service.get_schedule_range("241-327", date(2026, 10, 12), weeks, user_id=USER_ID)
        )
        assert calls == expected


def test_unknown_group_raises() -> None:
    service, _ = build_service()
    with pytest.raises(NotFoundError):
        asyncio.run(service.get_schedule_range("000-000", date(2026, 10, 12), 1))


def test_entry_applies_on_weekday_range_and_parity() -> None:
    tuesday = date(2026, 10, 13)  # ISO-неделя 42, чётная
    assert entry_applies_on(make_entry(2, 1), tuesday)
    assert not entry_applies_on(make_entry(3, 1), tuesday)  # другой день недели
    assert entry_applies_on(make_entry(2, 1, week_parity="even"), tuesday)
    assert not entry_applies_on(make_entry(2, 1, week_parity="odd"), tuesday)
    assert not entry_applies_on(make_entry(2, 1, date_from=date(2026, 10, 14)), tuesday)
    assert not entry_applies_on(make_entry(2, 1, date_to=date(2026, 10, 12)), tuesday)
    assert entry_applies_on(
        make_entry(2, 1, date_from=date(2026, 10, 13), date_to=date(2026, 10, 13)), tuesday
    )
