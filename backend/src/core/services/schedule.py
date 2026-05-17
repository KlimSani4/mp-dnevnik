"""Schedule service."""

from __future__ import annotations

import logging
import uuid
from datetime import date, time, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from redis.asyncio import Redis as _Redis

from src.core.models.schedule import OverrideScope, OverrideType, ScheduleOverride
from src.core.repositories.group import GroupRepository, StudentRepository
from src.core.repositories.schedule import (
    ScheduleEntryRepository,
    ScheduleOverrideRepository,
    SubjectRepository,
)
from src.core.schemas.schedule import (
    DayScheduleResponse,
    ScheduleEntryWithSubject,
    SubjectResponse,
)
from src.integrations.rasp_parser import fetch_group_schedule
from src.shared.exceptions import AuthorizationError, NotFoundError

logger = logging.getLogger(__name__)

SCHEDULE_CACHE_TTL = 3600  # 1 hour


class ScheduleService:
    """Schedule management service."""

    def __init__(self, session: AsyncSession, redis: _Redis | None = None) -> None:
        self.session = session
        self.redis = redis
        self.group_repo = GroupRepository(session)
        self.student_repo = StudentRepository(session)
        self.subject_repo = SubjectRepository(session)
        self.entry_repo = ScheduleEntryRepository(session)
        self.override_repo = ScheduleOverrideRepository(session)

    async def get_day_schedule(
        self,
        group_code: str,
        target_date: date,
        *,
        user_id: uuid.UUID | None = None,
    ) -> DayScheduleResponse:
        """Get schedule for a specific day with overrides applied."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        # Get base entries
        entries = await self.entry_repo.get_day_schedule(group.id, target_date)

        # Auto-import from rasp.dmami.ru if no entries in DB
        if not entries:
            try:
                schedule_data = await fetch_group_schedule(group_code)
                if schedule_data:
                    await self.import_schedule(group_code, schedule_data)
                    entries = await self.entry_repo.get_day_schedule(group.id, target_date)
            except Exception:
                logger.exception(
                    "Failed to auto-import schedule",
                    extra={"group_code": group_code},
                )

        # Get student for personal overrides
        student_id: uuid.UUID | None = None
        if user_id:
            students = await self.student_repo.get_user_students(user_id)
            for s in students:
                if s.group_id == group.id:
                    student_id = s.id
                    break

        # Apply overrides
        result_entries = []
        for entry in entries:
            overrides = await self.override_repo.get_entry_overrides(
                entry.id,
                target_date=target_date,
                student_id=student_id,
            )

            # Check for cancellation or skip
            is_cancelled = any(
                o.override_type in (OverrideType.CANCEL, OverrideType.SKIP) for o in overrides
            )
            if is_cancelled:
                continue

            result_entries.append(ScheduleEntryWithSubject.model_validate(entry))

        # Include ADD overrides (custom events) as synthetic entries
        add_overrides = await self.override_repo.get_add_overrides_for_date(
            group.id,
            target_date,
            author_id=user_id,
        )
        for override in add_overrides:
            synthetic = self._synthetic_entry_from_add_override(override)
            if synthetic:
                result_entries.append(synthetic)

        # Sort by pair_number / start_time
        result_entries.sort(key=lambda e: (e.pair_number, e.start_time))

        return DayScheduleResponse(
            schedule_date=target_date,
            weekday=target_date.isoweekday(),
            entries=result_entries,
        )

    def _synthetic_entry_from_add_override(
        self,
        override: ScheduleOverride,
    ) -> ScheduleEntryWithSubject | None:
        """Build a synthetic ScheduleEntryWithSubject from an ADD override's value JSON."""
        import json

        if not override.value:
            return None

        try:
            data: dict[str, Any] = json.loads(override.value)
        except (json.JSONDecodeError, TypeError):
            return None

        subject_name = data.get("subject") or "Пользовательское занятие"
        start_str = data.get("start_time", "00:00")
        end_str = data.get("end_time", "00:00")

        try:
            start = time.fromisoformat(start_str)
            end = time.fromisoformat(end_str)
        except ValueError:
            return None

        # Derive pair_number from start time (best-effort)
        pair_number = 9  # default: after all regular pairs
        pair_start_map = {
            "09:00": 1, "10:40": 2, "12:20": 3, "14:30": 4, "16:10": 5,
            "17:50": 6, "19:30": 7,
        }
        for ts, pn in pair_start_map.items():
            if start_str.startswith(ts):
                pair_number = pn
                break

        subject = SubjectResponse(
            id=override.id,
            name=subject_name,
            short_name=data.get("short_name") or subject_name[:16],
            group_id=None,
            is_custom=True,
        )

        return ScheduleEntryWithSubject(
            id=override.id,
            group_id=override.entry_id,  # placeholder — entry_id is the anchor entry
            subject_id=override.id,
            weekday=override.date.isoweekday() if override.date else 0,
            pair_number=pair_number,
            start_time=start,
            end_time=end,
            location=data.get("location"),
            room=data.get("room"),
            teacher=data.get("teacher"),
            lesson_type=data.get("lesson_type") or "custom",
            week_parity=None,
            external_link=data.get("external_link"),
            date_from=override.date,
            date_to=override.date,
            created_at=override.created_at,
            updated_at=override.created_at,
            subject=subject,
        )

    async def get_group_schedule(
        self,
        group_code: str,
    ) -> list[ScheduleEntryWithSubject]:
        """Get full week schedule for a group."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        entries = await self.entry_repo.get_group_schedule(group.id, with_subject=True)

        return [ScheduleEntryWithSubject.model_validate(e) for e in entries]

    async def import_schedule(
        self,
        group_code: str,
        schedule_data: list[dict[str, Any]],
    ) -> int:
        """Import schedule from parser data. Returns number of entries created."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        # Delete existing schedule
        await self.entry_repo.delete_group_schedule(group.id)

        count = 0
        for item in schedule_data:
            # Get or create subject
            subject = await self.subject_repo.get_or_create(
                name=item["subject"],
                short_name=item.get("short_name"),
                group_id=group.id,
            )

            # Parse times
            start_time = time.fromisoformat(item["start_time"])
            end_time = time.fromisoformat(item["end_time"])

            # Parse dates if present
            date_from = None
            date_to = None
            if item.get("date_from"):
                date_from = date.fromisoformat(item["date_from"])
            if item.get("date_to"):
                date_to = date.fromisoformat(item["date_to"])

            # Create entry
            await self.entry_repo.create(
                group_id=group.id,
                subject_id=subject.id,
                weekday=item["weekday"],
                pair_number=item["pair_number"],
                start_time=start_time,
                end_time=end_time,
                location=item.get("location"),
                room=item.get("room"),
                teacher=item.get("teacher"),
                lesson_type=item.get("lesson_type"),
                date_from=date_from,
                date_to=date_to,
                week_parity=item.get("week_parity"),
                external_link=item.get("external_link"),
                raw_data=item.get("raw_data", {}),
            )
            count += 1

        await self.session.commit()

        # Invalidate cache
        if self.redis:
            await self.redis.delete(f"schedule:{group_code}")

        logger.info(
            "Schedule imported",
            extra={"group_code": group_code, "entries_count": count},
        )

        return count

    async def create_override(
        self,
        entry_id: uuid.UUID,
        *,
        scope: OverrideScope,
        override_type: OverrideType,
        value: str | None = None,
        target_date: date | None = None,
        author_id: uuid.UUID,
        student_id: uuid.UUID | None = None,
    ) -> ScheduleOverride:
        """Create schedule override."""
        entry = await self.entry_repo.get(entry_id)
        if not entry:
            raise NotFoundError("Schedule entry not found")

        # Check permissions — only starosta can create group SKIP/CANCEL overrides;
        # any group member can share ADD overrides (custom events) with the group
        if scope == OverrideScope.GROUP and override_type not in (OverrideType.ADD,):
            students = await self.student_repo.get_user_students(author_id)
            group_student = next((s for s in students if s.group_id == entry.group_id), None)
            if not group_student or group_student.role == "student":
                raise AuthorizationError("Only starosta can create group overrides")

        override = await self.override_repo.create(
            entry_id=entry_id,
            scope=scope,
            override_type=override_type,
            value=value,
            date=target_date,
            author_id=author_id,
            student_id=student_id,
        )

        await self.session.commit()
        return override

    async def get_user_overrides(self, user_id: uuid.UUID) -> list[ScheduleOverride]:
        """Get all overrides created by a user."""
        return await self.override_repo.get_by_author(user_id)

    async def delete_override(
        self,
        override_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        """Delete schedule override."""
        override = await self.override_repo.get(override_id)
        if not override:
            raise NotFoundError("Override not found")

        # Check permissions
        if override.author_id != user_id:
            raise AuthorizationError("Can only delete own overrides")

        await self.override_repo.delete(override)
        await self.session.commit()

    async def get_week_schedule(
        self,
        group_code: str,
        start_date: date | None = None,
        *,
        user_id: uuid.UUID | None = None,
    ) -> list[DayScheduleResponse]:
        """Get schedule for a week."""
        if start_date is None:
            start_date = date.today()
            # Start from Monday
            start_date -= timedelta(days=start_date.weekday())

        days = []
        for i in range(6):  # Mon-Sat
            day = start_date + timedelta(days=i)
            day_schedule = await self.get_day_schedule(group_code, day, user_id=user_id)
            days.append(day_schedule)

        return days
