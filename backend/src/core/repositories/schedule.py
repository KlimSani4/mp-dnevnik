"""Schedule-related repositories."""

import uuid
from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.models.schedule import (
    OverrideScope,
    ScheduleEntry,
    ScheduleOverride,
    Subject,
)
from src.core.repositories.base import BaseRepository


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

        # Filter by date range and week parity
        week_number = target_date.isocalendar()[1]
        is_even_week = week_number % 2 == 0

        filtered = []
        for entry in entries:
            # Check date range
            if entry.date_from and target_date < entry.date_from:
                continue
            if entry.date_to and target_date > entry.date_to:
                continue

            # Check week parity
            if entry.week_parity:
                if entry.week_parity == "even" and not is_even_week:
                    continue
                if entry.week_parity == "odd" and is_even_week:
                    continue

            filtered.append(entry)

        return filtered

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
