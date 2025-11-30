"""Assignment and task repositories."""

import uuid
from datetime import datetime

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.models.assignment import Assignment, AssignmentVote, TaskState, TaskStatus
from src.core.repositories.base import BaseRepository


class AssignmentRepository(BaseRepository[Assignment]):
    """Assignment repository."""

    model = Assignment

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_with_subject(self, assignment_id: uuid.UUID) -> Assignment | None:
        """Get assignment with subject loaded."""
        stmt = (
            select(Assignment)
            .where(Assignment.id == assignment_id)
            .options(selectinload(Assignment.subject))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_group_assignments(
        self,
        group_id: uuid.UUID,
        *,
        subject_id: uuid.UUID | None = None,
        upcoming_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Assignment]:
        """Get assignments for a group."""
        stmt = (
            select(Assignment)
            .where(Assignment.group_id == group_id)
            .options(selectinload(Assignment.subject))
        )

        if subject_id is not None:
            stmt = stmt.where(Assignment.subject_id == subject_id)

        if upcoming_only:
            stmt = stmt.where(
                (Assignment.deadline.is_(None)) | (Assignment.deadline >= datetime.utcnow())
            )

        stmt = stmt.order_by(Assignment.deadline.asc().nulls_last()).offset(offset).limit(limit)

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_upcoming_deadlines(
        self,
        group_id: uuid.UUID,
        *,
        days: int = 7,
        limit: int = 10,
    ) -> list[Assignment]:
        """Get upcoming deadlines for a group."""
        from datetime import timedelta

        now = datetime.utcnow()
        deadline_cutoff = now + timedelta(days=days)

        stmt = (
            select(Assignment)
            .where(
                Assignment.group_id == group_id,
                Assignment.deadline.is_not(None),
                Assignment.deadline >= now,
                Assignment.deadline <= deadline_cutoff,
            )
            .options(selectinload(Assignment.subject))
            .order_by(Assignment.deadline.asc())
            .limit(limit)
        )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_vote_counts(self, assignment_id: uuid.UUID) -> None:
        """Recalculate vote counts for an assignment."""
        # Count up votes
        up_stmt = select(func.count()).where(
            AssignmentVote.assignment_id == assignment_id,
            AssignmentVote.vote == 1,
        )
        up_result = await self.session.execute(up_stmt)
        votes_up = up_result.scalar() or 0

        # Count down votes
        down_stmt = select(func.count()).where(
            AssignmentVote.assignment_id == assignment_id,
            AssignmentVote.vote == -1,
        )
        down_result = await self.session.execute(down_stmt)
        votes_down = down_result.scalar() or 0

        # Update assignment
        update_stmt = (
            update(Assignment)
            .where(Assignment.id == assignment_id)
            .values(votes_up=votes_up, votes_down=votes_down)
        )
        await self.session.execute(update_stmt)


class AssignmentVoteRepository(BaseRepository[AssignmentVote]):
    """Assignment vote repository."""

    model = AssignmentVote

    async def get_user_vote(
        self, assignment_id: uuid.UUID, user_id: uuid.UUID
    ) -> AssignmentVote | None:
        """Get user's vote on an assignment."""
        stmt = select(AssignmentVote).where(
            AssignmentVote.assignment_id == assignment_id,
            AssignmentVote.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_vote(
        self, assignment_id: uuid.UUID, user_id: uuid.UUID, vote: int
    ) -> AssignmentVote:
        """Create or update a vote."""
        existing = await self.get_user_vote(assignment_id, user_id)
        if existing:
            existing.vote = vote
            await self.session.flush()
            return existing
        return await self.create(
            assignment_id=assignment_id,
            user_id=user_id,
            vote=vote,
        )


class TaskStatusRepository(BaseRepository[TaskStatus]):
    """Task status repository."""

    model = TaskStatus

    async def get_student_tasks(
        self,
        student_id: uuid.UUID,
        *,
        state: TaskState | None = None,
        with_assignment: bool = False,
    ) -> list[TaskStatus]:
        """Get task statuses for a student."""
        stmt = select(TaskStatus).where(TaskStatus.student_id == student_id)

        if state is not None:
            stmt = stmt.where(TaskStatus.state == state)

        if with_assignment:
            stmt = stmt.options(
                selectinload(TaskStatus.assignment).selectinload(Assignment.subject)
            )

        stmt = stmt.order_by(TaskStatus.updated_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_or_create(
        self,
        student_id: uuid.UUID,
        assignment_id: uuid.UUID,
    ) -> TaskStatus:
        """Get existing task status or create new one."""
        stmt = select(TaskStatus).where(
            and_(
                TaskStatus.student_id == student_id,
                TaskStatus.assignment_id == assignment_id,
            )
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing
        return await self.create(
            student_id=student_id,
            assignment_id=assignment_id,
        )

    async def update_state(self, task: TaskStatus, state: TaskState) -> TaskStatus:
        """Update task state."""
        task.state = state
        await self.session.flush()
        return task
