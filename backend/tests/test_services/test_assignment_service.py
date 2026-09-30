"""Assignment service unit tests."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.models.assignment import Assignment, AssignmentVote, TaskState, TaskStatus
from src.core.models.group import Student, StudentRole
from src.core.models.schedule import Subject
from src.core.schemas.assignment import AssignmentCreate, AssignmentUpdate
from src.core.services.assignment import AssignmentService
from src.shared.exceptions import AuthorizationError, NotFoundError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _make_subject(group_id: uuid.UUID | None = None) -> Subject:
    s = Subject()
    s.id = _uuid()
    s.name = "Математика"
    s.short_name = "Мат"
    s.group_id = group_id
    s.is_custom = False
    return s


def _make_assignment(group_id: uuid.UUID, subject: Subject, author_id: uuid.UUID) -> Assignment:
    a = Assignment()
    a.id = _uuid()
    a.group_id = group_id
    a.subject_id = subject.id
    a.subject = subject
    a.title = "Сдать лабу"
    a.description = None
    a.deadline = None
    a.priority = "normal"
    a.link = None
    a.author_id = author_id
    a.votes_up = 0
    a.votes_down = 0
    a.is_verified = False
    a.created_at = datetime.now(tz=timezone.utc)
    a.updated_at = datetime.now(tz=timezone.utc)
    return a


def _make_student(
    user_id: uuid.UUID,
    group_id: uuid.UUID,
    role: StudentRole = StudentRole.STUDENT,
) -> Student:
    s = Student()
    s.id = _uuid()
    s.user_id = user_id
    s.group_id = group_id
    s.role = role
    s.verified = True
    s.created_at = datetime.now(tz=timezone.utc)
    s.updated_at = datetime.now(tz=timezone.utc)
    return s


def _make_service(session: MagicMock) -> AssignmentService:
    svc = AssignmentService(session)
    svc.assignment_repo = AsyncMock()
    svc.vote_repo = AsyncMock()
    svc.task_repo = AsyncMock()
    svc.group_repo = AsyncMock()
    svc.student_repo = AsyncMock()
    svc.subject_repo = AsyncMock()
    return svc


# ---------------------------------------------------------------------------
# create_assignment
# ---------------------------------------------------------------------------

class TestCreateAssignment:
    @pytest.mark.asyncio
    async def test_creates_successfully(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group_id = _uuid()
        author_id = _uuid()
        subject = _make_subject(group_id)
        student = _make_student(author_id, group_id)
        assignment = _make_assignment(group_id, subject, author_id)

        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=student)
        svc.subject_repo.get = AsyncMock(return_value=subject)
        svc.assignment_repo.create = AsyncMock(return_value=assignment)

        data = AssignmentCreate(
            group_id=group_id,
            subject_id=subject.id,
            title="Сдать лабу",
        )

        result = await svc.create_assignment(data, author_id)

        assert result is assignment
        svc.assignment_repo.create.assert_awaited_once()
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_not_member_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group_id = _uuid()
        author_id = _uuid()
        subject = _make_subject(group_id)

        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=None)

        data = AssignmentCreate(
            group_id=group_id,
            subject_id=subject.id,
            title="Тест",
        )

        with pytest.raises(AuthorizationError, match="Not a member"):
            await svc.create_assignment(data, author_id)

    @pytest.mark.asyncio
    async def test_subject_not_found_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group_id = _uuid()
        author_id = _uuid()
        student = _make_student(author_id, group_id)

        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=student)
        svc.subject_repo.get = AsyncMock(return_value=None)

        data = AssignmentCreate(
            group_id=group_id,
            subject_id=_uuid(),
            title="Тест",
        )

        with pytest.raises(NotFoundError, match="Subject not found"):
            await svc.create_assignment(data, author_id)


# ---------------------------------------------------------------------------
# get_group_assignments
# ---------------------------------------------------------------------------

class TestGetGroupAssignments:
    @pytest.mark.asyncio
    async def test_returns_list(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group_id = _uuid()
        author_id = _uuid()
        subject = _make_subject(group_id)
        a = _make_assignment(group_id, subject, author_id)

        svc.assignment_repo.get_group_assignments = AsyncMock(return_value=[a])

        with patch(
            "src.core.services.assignment.AssignmentWithSubject.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.get_group_assignments(group_id)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_empty_group(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        svc.assignment_repo.get_group_assignments = AsyncMock(return_value=[])

        with patch(
            "src.core.services.assignment.AssignmentWithSubject.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.get_group_assignments(_uuid())

        assert result == []


# ---------------------------------------------------------------------------
# vote_assignment
# ---------------------------------------------------------------------------

class TestVoteAssignment:
    @pytest.mark.asyncio
    async def test_vote_calls_upsert_and_update(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group_id = _uuid()
        user_id = _uuid()
        subject = _make_subject(group_id)
        assignment = _make_assignment(group_id, subject, _uuid())
        student = _make_student(user_id, group_id)

        svc.assignment_repo.get = AsyncMock(return_value=assignment)
        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=student)
        svc.vote_repo.upsert_vote = AsyncMock()
        svc.assignment_repo.update_vote_counts = AsyncMock()

        await svc.vote_assignment(assignment.id, user_id, vote=1)

        svc.vote_repo.upsert_vote.assert_awaited_once_with(assignment.id, user_id, 1)
        svc.assignment_repo.update_vote_counts.assert_awaited_once_with(assignment.id)
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_negative_vote_normalised(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group_id = _uuid()
        user_id = _uuid()
        subject = _make_subject(group_id)
        assignment = _make_assignment(group_id, subject, _uuid())
        student = _make_student(user_id, group_id)

        svc.assignment_repo.get = AsyncMock(return_value=assignment)
        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=student)
        svc.vote_repo.upsert_vote = AsyncMock()
        svc.assignment_repo.update_vote_counts = AsyncMock()

        await svc.vote_assignment(assignment.id, user_id, vote=-1)

        svc.vote_repo.upsert_vote.assert_awaited_once_with(assignment.id, user_id, -1)

    @pytest.mark.asyncio
    async def test_assignment_not_found_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        svc.assignment_repo.get = AsyncMock(return_value=None)

        with pytest.raises(NotFoundError):
            await svc.vote_assignment(_uuid(), _uuid(), vote=1)

    @pytest.mark.asyncio
    async def test_not_group_member_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group_id = _uuid()
        subject = _make_subject(group_id)
        assignment = _make_assignment(group_id, subject, _uuid())

        svc.assignment_repo.get = AsyncMock(return_value=assignment)
        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=None)

        with pytest.raises(AuthorizationError):
            await svc.vote_assignment(assignment.id, _uuid(), vote=1)


# ---------------------------------------------------------------------------
# vote verification threshold (via update_vote_counts repo logic)
# ---------------------------------------------------------------------------

class TestVoteVerificationThreshold:
    @pytest.mark.asyncio
    async def test_three_upvotes_would_verify(self) -> None:
        """Simulate the repo updating is_verified when votes_up >= 3."""
        # We test the repository's update_vote_counts logic indirectly:
        # the service calls vote_repo.upsert_vote + assignment_repo.update_vote_counts.
        # Here we verify that the service correctly passes the assignment_id through.
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group_id = _uuid()
        user_ids = [_uuid() for _ in range(3)]
        subject = _make_subject(group_id)
        assignment = _make_assignment(group_id, subject, _uuid())

        svc.assignment_repo.get = AsyncMock(return_value=assignment)
        svc.student_repo.get_by_user_and_group = AsyncMock(
            return_value=_make_student(_uuid(), group_id)
        )
        svc.vote_repo.upsert_vote = AsyncMock()
        svc.assignment_repo.update_vote_counts = AsyncMock()

        for uid in user_ids:
            svc.student_repo.get_by_user_and_group = AsyncMock(
                return_value=_make_student(uid, group_id)
            )
            await svc.vote_assignment(assignment.id, uid, vote=1)

        # update_vote_counts called once per vote
        assert svc.assignment_repo.update_vote_counts.await_count == 3


# ---------------------------------------------------------------------------
# get_user_tasks
# ---------------------------------------------------------------------------

class TestGetStudentTasksMerge:
    @pytest.mark.asyncio
    async def test_synthesises_todo_for_new_assignment(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group_id = _uuid()
        user_id = _uuid()
        subject = _make_subject(group_id)
        assignment = _make_assignment(group_id, subject, _uuid())
        student = _make_student(user_id, group_id)

        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=student)
        svc.task_repo.get_student_tasks = AsyncMock(return_value=[])
        svc.assignment_repo.get_group_assignments = AsyncMock(return_value=[assignment])

        # model_validate must return something with an .updated_at attribute
        # (the service sorts by it after collecting results).
        def _fake_validate(data: object) -> MagicMock:
            m = MagicMock()
            if isinstance(data, dict):
                m.updated_at = data.get("updated_at", datetime.now(tz=timezone.utc))
                m.state = data.get("state")
                m.assignment = data.get("assignment")
            else:
                m.updated_at = getattr(data, "updated_at", datetime.now(tz=timezone.utc))
            return m

        with patch(
            "src.core.services.assignment.TaskWithAssignment.model_validate",
            side_effect=_fake_validate,
        ):
            result = await svc.get_user_tasks(user_id, group_id)

        assert len(result) == 1
        assert result[0].state == TaskState.TODO
        assert result[0].assignment is assignment

    @pytest.mark.asyncio
    async def test_uses_existing_task_when_present(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group_id = _uuid()
        user_id = _uuid()
        subject = _make_subject(group_id)
        assignment = _make_assignment(group_id, subject, _uuid())
        student = _make_student(user_id, group_id)

        task = TaskStatus()
        task.id = _uuid()
        task.student_id = student.id
        task.assignment_id = assignment.id
        task.assignment = assignment
        task.state = TaskState.DONE
        task.created_at = datetime.now(tz=timezone.utc)
        task.updated_at = datetime.now(tz=timezone.utc)

        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=student)
        svc.task_repo.get_student_tasks = AsyncMock(return_value=[task])
        svc.assignment_repo.get_group_assignments = AsyncMock(return_value=[assignment])

        with patch(
            "src.core.services.assignment.TaskWithAssignment.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.get_user_tasks(user_id, group_id)

        assert len(result) == 1
        assert result[0] is task

    @pytest.mark.asyncio
    async def test_not_member_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=None)

        with pytest.raises(NotFoundError):
            await svc.get_user_tasks(_uuid(), _uuid())
