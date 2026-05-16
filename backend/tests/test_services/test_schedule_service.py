"""Schedule service unit tests."""

import uuid
from datetime import date, time, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.models.schedule import OverrideScope, OverrideType, ScheduleEntry, ScheduleOverride, Subject
from src.core.models.group import Group, Student, StudentRole
from src.core.services.schedule import ScheduleService
from src.shared.exceptions import AuthorizationError, NotFoundError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _make_group(code: str = "231-329") -> Group:
    g = Group()
    g.id = _uuid()
    g.code = code
    g.name = code
    g.owner_id = _uuid()
    g.settings = {}
    g.created_at = datetime.now(tz=timezone.utc)
    g.updated_at = datetime.now(tz=timezone.utc)
    return g


def _make_subject(group_id: uuid.UUID) -> Subject:
    s = Subject()
    s.id = _uuid()
    s.name = "Математика"
    s.short_name = "Мат"
    s.group_id = group_id
    s.is_custom = False
    return s


def _make_entry(group: Group, subject: Subject, weekday: int = 1) -> ScheduleEntry:
    e = ScheduleEntry()
    e.id = _uuid()
    e.group_id = group.id
    e.subject_id = subject.id
    e.subject = subject
    e.weekday = weekday
    e.pair_number = 1
    e.start_time = time(9, 0)
    e.end_time = time(10, 30)
    e.location = "Корпус А"
    e.room = "101"
    e.teacher = "Иванов И.И."
    e.lesson_type = "Лекция"
    e.date_from = None
    e.date_to = None
    e.week_parity = None
    e.external_link = None
    e.raw_data = {}
    e.created_at = datetime.now(tz=timezone.utc)
    e.updated_at = datetime.now(tz=timezone.utc)
    return e


def _make_student(user_id: uuid.UUID, group_id: uuid.UUID, role: StudentRole = StudentRole.STUDENT) -> Student:
    s = Student()
    s.id = _uuid()
    s.user_id = user_id
    s.group_id = group_id
    s.role = role
    s.verified = True
    s.created_at = datetime.now(tz=timezone.utc)
    s.updated_at = datetime.now(tz=timezone.utc)
    return s


def _make_service(session: MagicMock, redis: MagicMock | None = None) -> ScheduleService:
    svc = ScheduleService(session, redis)
    svc.group_repo = AsyncMock()
    svc.student_repo = AsyncMock()
    svc.subject_repo = AsyncMock()
    svc.entry_repo = AsyncMock()
    svc.override_repo = AsyncMock()
    return svc


# ---------------------------------------------------------------------------
# import_schedule
# ---------------------------------------------------------------------------

class TestImportSchedule:
    @pytest.mark.asyncio
    async def test_creates_entries(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group = _make_group("231-329")
        subject = _make_subject(group.id)

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.entry_repo.delete_group_schedule = AsyncMock()
        svc.subject_repo.get_or_create = AsyncMock(return_value=subject)
        svc.entry_repo.create = AsyncMock()

        schedule_data = [
            {
                "subject": "Математика",
                "weekday": 1,
                "pair_number": 1,
                "start_time": "09:00:00",
                "end_time": "10:30:00",
            },
            {
                "subject": "Физика",
                "weekday": 2,
                "pair_number": 2,
                "start_time": "11:00:00",
                "end_time": "12:30:00",
            },
        ]

        count = await svc.import_schedule("231-329", schedule_data)

        assert count == 2
        assert svc.entry_repo.create.await_count == 2
        svc.entry_repo.delete_group_schedule.assert_awaited_once_with(group.id)

    @pytest.mark.asyncio
    async def test_invalidates_redis_cache(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        redis = AsyncMock()
        svc = _make_service(session, redis)

        group = _make_group("231-329")
        subject = _make_subject(group.id)

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.entry_repo.delete_group_schedule = AsyncMock()
        svc.subject_repo.get_or_create = AsyncMock(return_value=subject)
        svc.entry_repo.create = AsyncMock()

        await svc.import_schedule("231-329", [
            {
                "subject": "Математика",
                "weekday": 1,
                "pair_number": 1,
                "start_time": "09:00:00",
                "end_time": "10:30:00",
            }
        ])

        redis.delete.assert_awaited_once_with("schedule:231-329")

    @pytest.mark.asyncio
    async def test_group_not_found_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        svc.group_repo.get_by_code = AsyncMock(return_value=None)

        with pytest.raises(NotFoundError):
            await svc.import_schedule("999-ZZZ", [])

    @pytest.mark.asyncio
    async def test_handles_optional_fields(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group = _make_group()
        subject = _make_subject(group.id)

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.entry_repo.delete_group_schedule = AsyncMock()
        svc.subject_repo.get_or_create = AsyncMock(return_value=subject)
        svc.entry_repo.create = AsyncMock()

        item = {
            "subject": "ДМиТИ",
            "weekday": 3,
            "pair_number": 3,
            "start_time": "12:10:00",
            "end_time": "13:40:00",
            "room": "204",
            "teacher": "Петров П.П.",
            "lesson_type": "Практика",
            "date_from": "2025-09-01",
            "date_to": "2026-01-15",
            "week_parity": "odd",
        }

        count = await svc.import_schedule("231-329", [item])
        assert count == 1

        call_kwargs = svc.entry_repo.create.call_args.kwargs
        assert call_kwargs["room"] == "204"
        assert call_kwargs["week_parity"] == "odd"


# ---------------------------------------------------------------------------
# get_day_schedule
# ---------------------------------------------------------------------------

class TestGetDaySchedule:
    @pytest.mark.asyncio
    async def test_returns_entries(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group = _make_group()
        subject = _make_subject(group.id)
        entry = _make_entry(group, subject)

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.entry_repo.get_day_schedule = AsyncMock(return_value=[entry])
        svc.override_repo.get_entry_overrides = AsyncMock(return_value=[])
        svc.student_repo.get_user_students = AsyncMock(return_value=[])

        with patch(
            "src.core.services.schedule.ScheduleEntryWithSubject.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.get_day_schedule(group.code, date.today())

        assert result.weekday == date.today().isoweekday()
        assert len(result.entries) == 1

    @pytest.mark.asyncio
    async def test_cancelled_entries_excluded(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group = _make_group()
        subject = _make_subject(group.id)
        entry = _make_entry(group, subject)

        cancel_override = MagicMock()
        cancel_override.override_type = OverrideType.CANCEL

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.entry_repo.get_day_schedule = AsyncMock(return_value=[entry])
        svc.override_repo.get_entry_overrides = AsyncMock(return_value=[cancel_override])
        svc.student_repo.get_user_students = AsyncMock(return_value=[])

        result = await svc.get_day_schedule(group.code, date.today())

        assert result.entries == []

    @pytest.mark.asyncio
    async def test_group_not_found_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        svc.group_repo.get_by_code = AsyncMock(return_value=None)

        with pytest.raises(NotFoundError):
            await svc.get_day_schedule("UNKNOWN", date.today())

    @pytest.mark.asyncio
    async def test_auto_import_on_empty(self) -> None:
        """If no DB entries exist, auto-import from rasp.dmami.ru is attempted."""
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group = _make_group()

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        # First call returns empty, second call (after import) also empty
        svc.entry_repo.get_day_schedule = AsyncMock(return_value=[])
        svc.override_repo.get_entry_overrides = AsyncMock(return_value=[])
        svc.student_repo.get_user_students = AsyncMock(return_value=[])

        with (
            patch(
                "src.core.services.schedule.fetch_group_schedule",
                new_callable=AsyncMock,
                return_value=[],
            ),
            patch.object(svc, "import_schedule", new_callable=AsyncMock) as mock_import,
        ):
            result = await svc.get_day_schedule(group.code, date.today())

        # import_schedule should NOT be called when fetch returns empty list
        mock_import.assert_not_awaited()
        assert result.entries == []


# ---------------------------------------------------------------------------
# get_week_schedule
# ---------------------------------------------------------------------------

class TestGetWeekSchedule:
    @pytest.mark.asyncio
    async def test_returns_six_days(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group = _make_group()

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.entry_repo.get_day_schedule = AsyncMock(return_value=[])
        svc.override_repo.get_entry_overrides = AsyncMock(return_value=[])
        svc.student_repo.get_user_students = AsyncMock(return_value=[])

        result = await svc.get_week_schedule(group.code)

        assert len(result) == 6


# ---------------------------------------------------------------------------
# create_override
# ---------------------------------------------------------------------------

class TestCreateOverride:
    @pytest.mark.asyncio
    async def test_personal_override_created(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group = _make_group()
        subject = _make_subject(group.id)
        entry = _make_entry(group, subject)
        user_id = _uuid()

        override = MagicMock()
        svc.entry_repo.get = AsyncMock(return_value=entry)
        svc.override_repo.create = AsyncMock(return_value=override)
        svc.student_repo.get_user_students = AsyncMock(return_value=[])

        result = await svc.create_override(
            entry.id,
            scope=OverrideScope.PERSONAL,
            override_type=OverrideType.CANCEL,
            author_id=user_id,
        )

        assert result is override
        svc.override_repo.create.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_group_override_requires_starosta(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group = _make_group()
        subject = _make_subject(group.id)
        entry = _make_entry(group, subject)
        user_id = _uuid()

        plain_student = _make_student(user_id, group.id, role=StudentRole.STUDENT)

        svc.entry_repo.get = AsyncMock(return_value=entry)
        svc.student_repo.get_user_students = AsyncMock(return_value=[plain_student])

        with pytest.raises(AuthorizationError, match="starosta"):
            await svc.create_override(
                entry.id,
                scope=OverrideScope.GROUP,
                override_type=OverrideType.CANCEL,
                author_id=user_id,
            )

    @pytest.mark.asyncio
    async def test_entry_not_found_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        svc.entry_repo.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundError):
            await svc.create_override(
                _uuid(),
                scope=OverrideScope.PERSONAL,
                override_type=OverrideType.CANCEL,
                author_id=_uuid(),
            )
