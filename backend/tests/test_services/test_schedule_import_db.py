"""Импорт расписания на настоящей PostgreSQL: без дублей пар и предметов (#139).

В CI база поднимается сервисом postgres; локально без базы тесты пропускаются.
"""

import asyncio
from collections.abc import AsyncIterator
from datetime import date
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.core.models.base import Base
from src.core.models.group import Group
from src.core.models.schedule import ScheduleEntry, Subject
from src.core.models.user import User
from src.core.services.schedule import ScheduleService
from tests.conftest import TEST_DATABASE_URL


def _item(
    weekday: int, pair: int, subject: str, start: str, end: str, **extra: Any
) -> dict[str, Any]:
    return {
        "weekday": weekday,
        "pair_number": pair,
        "subject": subject,
        "start_time": start,
        "end_time": end,
        "lesson_type": "Лаб. работа",
        "room": "ав5108",
        **extra,
    }


# Фрагмент 241-327: в ячейке лекция до 01.11 и другая пара с 02.11, плюс пара с двумя периодами
SOURCE = [
    _item(
        3,
        1,
        "Математические методы анализа данных",
        "09:00",
        "10:30",
        lesson_type="Лекция",
        date_from="2026-09-01",
        date_to="2026-11-01",
    ),
    _item(
        3,
        1,
        "Разработка мобильных приложений",
        "09:00",
        "10:30",
        date_from="2026-11-02",
        date_to="2027-01-03",
    ),
    _item(
        4,
        5,
        "Автоматизация процессов ЖЦ ПС",
        "16:10",
        "17:40",
        date_from="2026-09-01",
        date_to="2026-11-01",
    ),
    _item(
        4,
        5,
        "Автоматизация процессов ЖЦ ПС",
        "16:10",
        "17:40",
        date_from="2026-11-02",
        date_to="2026-12-27",
    ),
]


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(TEST_DATABASE_URL)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except (OSError, SQLAlchemyError) as e:
        await eng.dispose()
        pytest.skip(f"PostgreSQL недоступна: {e}")
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture
async def maker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    m = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with m() as s:
        user = User(display_name="owner")
        s.add(user)
        await s.flush()
        s.add(Group(code="241-327", name="241-327", owner_id=user.id))
        await s.commit()
    return m


async def _import(maker: async_sessionmaker[AsyncSession]) -> None:
    async with maker() as s:
        await ScheduleService(s).import_schedule("241-327", SOURCE)


async def _counts(maker: async_sessionmaker[AsyncSession]) -> tuple[int, int]:
    async with maker() as s:
        entries = (await s.execute(select(func.count()).select_from(ScheduleEntry))).scalar_one()
        subjects = (await s.execute(select(func.count()).select_from(Subject))).scalar_one()
        return entries, subjects


async def test_parallel_imports_create_no_duplicates(
    maker: async_sessionmaker[AsyncSession],
) -> None:
    await asyncio.gather(*(_import(maker) for _ in range(4)))
    assert await _counts(maker) == (4, 3)

    # И следующий импорт проходит (раньше падал на MultipleResultsFound)
    await _import(maker)
    assert await _counts(maker) == (4, 3)


async def test_week_shows_each_lesson_once(maker: async_sessionmaker[AsyncSession]) -> None:
    await asyncio.gather(_import(maker), _import(maker))
    async with maker() as s:
        days = await ScheduleService(s).get_schedule_range("241-327", date(2026, 11, 2), 1)
    by_day = {d.schedule_date: [e.subject.name for e in d.entries] for d in days}
    assert by_day[date(2026, 11, 4)] == ["Разработка мобильных приложений"]
    assert by_day[date(2026, 11, 5)] == ["Автоматизация процессов ЖЦ ПС"]


async def test_custom_subject_with_same_name_is_not_reused(
    maker: async_sessionmaker[AsyncSession],
) -> None:
    async with maker() as s:
        group = (await s.execute(select(Group))).scalar_one()
        s.add(Subject(name="Разработка мобильных приложений", group_id=group.id, is_custom=True))
        await s.commit()

    await _import(maker)

    async with maker() as s:
        subjects = (
            (
                await s.execute(
                    select(Subject).where(Subject.name == "Разработка мобильных приложений")
                )
            )
            .scalars()
            .all()
        )
        entry = (
            await s.execute(
                select(ScheduleEntry).where(
                    ScheduleEntry.weekday == 3, ScheduleEntry.date_from == date(2026, 11, 2)
                )
            )
        ).scalar_one()
    assert len(subjects) == 2
    official = next(x for x in subjects if not x.is_custom)
    assert entry.subject_id == official.id
