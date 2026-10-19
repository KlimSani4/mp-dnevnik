"""Schedule-related repositories."""

import uuid
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.models.schedule import (
    OverrideScope,
    OverrideType,
    ScheduleEntry,
    ScheduleOverride,
    Subject,
)
from src.core.repositories.base import BaseRepository


def entry_applies_on(entry: ScheduleEntry, day: date) -> bool:
    """Занятие проходит в этот день: день недели, диапазон дат и чётность недели.
    Общая проверка для расписания на день и для выгрузки на несколько недель,
    чтобы обе считали одинаково.
    """
    if entry.weekday != day.isoweekday():
        return False
    if entry.date_from and day < entry.date_from:
        return False
    if entry.date_to and day > entry.date_to:
        return False
    if entry.week_parity:
        is_even_week = day.isocalendar()[1] % 2 == 0
        if entry.week_parity == "even" and not is_even_week:
            return False
        if entry.week_parity == "odd" and is_even_week:
            return False
    return True


class SubjectRepository(BaseRepository[Subject]):
    """Subject repository."""

    model = Subject

    async def get_by_name(self, name: str, group_id: uuid.UUID | None = None) -> Subject | None:
        """Get subject by name, optionally for specific group."""
        stmt = select(Subject).where(Subject.name == name)
        if group_id is not None:
            stmt = stmt.where(Subject.group_id == group_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_group_subjects(self, group_id: uuid.UUID) -> list[Subject]:
        """Get all subjects for a group (including global ones)."""
        stmt = select(Subject).where((Subject.group_id == group_id) | (Subject.group_id.is_(None)))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_or_create(
        self,
        name: str,
        *,
        short_name: str | None = None,
        group_id: uuid.UUID | None = None,
    ) -> Subject:
        """Get existing subject or create new one."""
        existing = await self.get_by_name(name, group_id)
        if existing:
            return existing
        return await self.create(name=name, short_name=short_name, group_id=group_id)


class ScheduleEntryRepository(BaseRepository[ScheduleEntry]):
    """Schedule entry repository."""

    model = ScheduleEntry

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_group_schedule(
        self,
        group_id: uuid.UUID,
        *,
        weekday: int | None = None,
        with_subject: bool = False,
    ) -> list[ScheduleEntry]:
        """Get schedule entries for a group."""
        stmt = select(ScheduleEntry).where(ScheduleEntry.group_id == group_id)
        if weekday is not None:
            stmt = stmt.where(ScheduleEntry.weekday == weekday)
        if with_subject:
            stmt = stmt.options(selectinload(ScheduleEntry.subject))
        stmt = stmt.order_by(ScheduleEntry.weekday, ScheduleEntry.pair_number)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_day_schedule(
        self,
        group_id: uuid.UUID,
        target_date: date,
    ) -> list[ScheduleEntry]:
        """Get schedule for specific date considering date ranges and parity."""
        weekday = target_date.isoweekday()

        stmt = (
            select(ScheduleEntry)
            .where(
                ScheduleEntry.group_id == group_id,
                ScheduleEntry.weekday == weekday,
            )
            .options(selectinload(ScheduleEntry.subject))
            .order_by(ScheduleEntry.pair_number)
        )

        result = await self.session.execute(stmt)
        entries = list(result.scalars().all())

        return [entry for entry in entries if entry_applies_on(entry, target_date)]

    async def delete_group_schedule(self, group_id: uuid.UUID) -> int:
        """Delete all schedule entries for a group. Returns count of deleted entries."""
        stmt = select(ScheduleEntry).where(ScheduleEntry.group_id == group_id)
        result = await self.session.execute(stmt)
        entries = result.scalars().all()
        count = 0
        for entry in entries:
            await self.session.delete(entry)
            count += 1
        await self.session.flush()
        return count


class ScheduleOverrideRepository(BaseRepository[ScheduleOverride]):
    """Schedule override repository."""

    model = ScheduleOverride

    async def get_entry_overrides(
        self,
        entry_id: uuid.UUID,
        *,
        target_date: date | None = None,
        student_id: uuid.UUID | None = None,
    ) -> list[ScheduleOverride]:
        """Get overrides for a schedule entry."""
        conditions = [ScheduleOverride.entry_id == entry_id]

        if target_date is not None:
            conditions.append(
                (ScheduleOverride.date == target_date) | (ScheduleOverride.date.is_(None))
            )

        if student_id is not None:
            conditions.append(
                (ScheduleOverride.student_id == student_id)
                | (ScheduleOverride.scope == OverrideScope.GROUP)
            )
        else:
            # Без студента (аноним или, например, не член группы)
            # личные переопределения других людей не должны
            # применяться, ток групповые применяются.
            conditions.append(ScheduleOverride.scope == OverrideScope.GROUP)
        stmt = select(ScheduleOverride).where(and_(*conditions))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_group_overrides(
        self,
        group_id: uuid.UUID,
        target_date: date | None = None,
    ) -> list[ScheduleOverride]:
        """Get all group-level overrides."""
        stmt = (
            select(ScheduleOverride)
            .join(ScheduleEntry)
            .where(
                ScheduleEntry.group_id == group_id,
                ScheduleOverride.scope == OverrideScope.GROUP,
            )
        )
        if target_date is not None:
            stmt = stmt.where(
                (ScheduleOverride.date == target_date) | (ScheduleOverride.date.is_(None))
            )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_student_overrides(
        self,
        student_id: uuid.UUID,
        target_date: date | None = None,
    ) -> list[ScheduleOverride]:
        """Get personal overrides for a student."""
        stmt = select(ScheduleOverride).where(
            ScheduleOverride.student_id == student_id,
            ScheduleOverride.scope == OverrideScope.PERSONAL,
        )
        if target_date is not None:
            stmt = stmt.where(
                (ScheduleOverride.date == target_date) | (ScheduleOverride.date.is_(None))
            )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_author(self, author_id: uuid.UUID) -> list[ScheduleOverride]:
        """Get all overrides created by a specific user."""
        stmt = select(ScheduleOverride).where(ScheduleOverride.author_id == author_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_add_overrides_for_date(
        self,
        group_id: uuid.UUID,
        target_date: date,
        *,
        author_id: uuid.UUID | None = None,
    ) -> list[ScheduleOverride]:
        """Get ADD-type overrides for a date (custom events).

        Returns group-scoped ADD overrides visible to all, plus personal ones
        for author_id (if provided).
        """
        conditions = [
            ScheduleOverride.override_type == OverrideType.ADD,
            (ScheduleOverride.date == target_date) | (ScheduleOverride.date.is_(None)),
        ]

        scope_conditions = [ScheduleOverride.scope == OverrideScope.GROUP]
        if author_id is not None:
            scope_conditions.append(
                (ScheduleOverride.scope == OverrideScope.PERSONAL)
                & (ScheduleOverride.author_id == author_id)
            )

        from sqlalchemy import or_

        stmt = (
            select(ScheduleOverride)
            .join(ScheduleEntry)
            .where(
                ScheduleEntry.group_id == group_id,
                *conditions,
                or_(*scope_conditions),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_reminder_overrides(
        self,
        group_id: uuid.UUID,
        entry_ids: list[uuid.UUID],
        target_date: date,
    ) -> list[ScheduleOverride]:
        """Все переопределения группы на дату для напоминаний о парах.

        Без фильтра по студенту: переопределения записей ``entry_ids`` и все ADD-события
        группы (и групповые, и личные). Кому что видно, решает вызывающий код.
        """
        from sqlalchemy import or_

        targets = [ScheduleOverride.override_type == OverrideType.ADD]
        if entry_ids:
            targets.append(ScheduleOverride.entry_id.in_(entry_ids))
        stmt = (
            select(ScheduleOverride)
            .join(ScheduleEntry)
            .where(
                ScheduleEntry.group_id == group_id,
                (ScheduleOverride.date == target_date) | (ScheduleOverride.date.is_(None)),
                or_(*targets),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_overrides_for_entries(
        self,
        entry_ids: list[uuid.UUID],
        *,
        start: date,
        end: date,
        student_id: uuid.UUID | None = None,
    ) -> list[ScheduleOverride]:
        """ОДНИИИМ запросом получаем переобпредление для записей за диапазон
        дат.
        Используется тот же фильтр, что и в get_entry_overrides (вынесли его отдельно,
        см. начало файла), но сразу для всех записей:
        дата попадает в интервал [start, end]
        или не указана (применяется к любой дате)."""
        if not entry_ids:
            return []
        # формируем узловие для WHERE в бд
        conditions = [
            ScheduleOverride.entry_id.in_(entry_ids),
            ScheduleOverride.date.between(start, end) | ScheduleOverride.date.is_(None),
        ]
        # либо личные правки, либо то, что все видят
        if student_id is not None:
            conditions.append(
                (ScheduleOverride.student_id == student_id)
                | (ScheduleOverride.scope == OverrideScope.GROUP)
            )
        result = await self.session.execute(select(ScheduleOverride).where(and_(*conditions)))
        return list(result.scalars().all())

    async def get_add_overrides_between(
        self,
        group_id: uuid.UUID,
        start: date,
        end: date,
        *,
        author_id: uuid.UUID | None = None,
    ) -> list[ScheduleOverride]:
        """Аналогичен предыдущему методу, но под под персональные событя пользователей"""
        scope_conditions = [ScheduleOverride.scope == OverrideScope.GROUP]
        if author_id is not None:
            scope_conditions.append(
                (ScheduleOverride.scope == OverrideScope.PERSONAL)
                & (ScheduleOverride.author_id == author_id)
            )

        from sqlalchemy import or_

        stmt = (
            select(ScheduleOverride)
            .join(ScheduleEntry)
            .where(
                ScheduleEntry.group_id == group_id,
                ScheduleOverride.override_type == OverrideType.ADD,
                ScheduleOverride.date.between(start, end) | ScheduleOverride.date.is_(None),
                or_(*scope_conditions),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
