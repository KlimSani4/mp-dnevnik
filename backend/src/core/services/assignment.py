"""Assignment service."""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.assignment import Assignment, TaskState
from src.core.repositories.assignment import (
    AssignmentRepository,
    AssignmentVoteRepository,
    TaskStatusRepository,
)
from src.core.repositories.group import GroupRepository, StudentRepository
from src.core.repositories.schedule import SubjectRepository
from src.core.schemas.assignment import (
    AssignmentCreate,
    AssignmentUpdate,
    AssignmentWithSubject,
    BulkTaskUpdate,
    TaskStatusResponse,
    TaskWithAssignment,
)
from src.core.schemas.dashboard import TaskProgress
from src.shared.exceptions import AuthorizationError, NotFoundError

logger = logging.getLogger(__name__)


class AssignmentService:
    """Assignment and task management service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.assignment_repo = AssignmentRepository(session)
        self.vote_repo = AssignmentVoteRepository(session)
        self.task_repo = TaskStatusRepository(session)
        self.group_repo = GroupRepository(session)
        self.student_repo = StudentRepository(session)
        self.subject_repo = SubjectRepository(session)

    async def create_assignment(
        self,
        data: AssignmentCreate,
        author_id: uuid.UUID,
    ) -> Assignment:
        """Create new assignment."""
        # Verify user is member of the group
        student = await self.student_repo.get_by_user_and_group(author_id, data.group_id)
        if not student:
            raise AuthorizationError("Not a member of this group")

        # Verify subject exists
        subject = await self.subject_repo.get(data.subject_id)
        if not subject:
            raise NotFoundError("Subject not found")

        assignment = await self.assignment_repo.create(
            group_id=data.group_id,
            subject_id=data.subject_id,
            title=data.title,
            description=data.description,
            deadline=data.deadline,
            priority=data.priority,
            link=data.link,
            author_id=author_id,
        )

        await self.session.commit()

        logger.info(
            "Assignment created",
            extra={
                "assignment_id": str(assignment.id),
                "author_id": str(author_id),
            },
        )

        return assignment

    async def get_assignment(
        self,
        assignment_id: uuid.UUID,
    ) -> AssignmentWithSubject:
        """Get assignment by ID."""
        assignment = await self.assignment_repo.get_with_subject(assignment_id)
        if not assignment:
            raise NotFoundError("Assignment not found")
        return AssignmentWithSubject.model_validate(assignment)

    async def get_group_assignments(
        self,
        group_id: uuid.UUID,
        *,
        subject_id: uuid.UUID | None = None,
        upcoming_only: bool = False,
        search: str | None = None,
        priorities: list[str] | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[AssignmentWithSubject]:
        """Get assignments for a group."""
        assignments = await self.assignment_repo.get_group_assignments(
            group_id,
            subject_id=subject_id,
            upcoming_only=upcoming_only,
            search=search,
            priorities=priorities,
            offset=offset,
            limit=limit,
        )
        return [AssignmentWithSubject.model_validate(a) for a in assignments]

    async def update_assignment(
        self,
        assignment_id: uuid.UUID,
        data: AssignmentUpdate,
        user_id: uuid.UUID,
    ) -> AssignmentWithSubject:
        """Update assignment."""
        assignment = await self.assignment_repo.get(assignment_id)
        if not assignment:
            raise NotFoundError("Assignment not found")

        # Only author or starosta can update
        if assignment.author_id != user_id:
            student = await self.student_repo.get_by_user_and_group(user_id, assignment.group_id)
            if not student or student.role == "student":
                raise AuthorizationError("Cannot update this assignment")

        update_data = data.model_dump(exclude_unset=True)
        await self.assignment_repo.update(assignment, **update_data)
        await self.session.commit()

        return await self.get_assignment(assignment_id)

    async def delete_assignment(
        self,
        assignment_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> None:
        """Delete assignment."""
        assignment = await self.assignment_repo.get(assignment_id)
        if not assignment:
            raise NotFoundError("Assignment not found")

        # Only author or starosta can delete
        if assignment.author_id != user_id:
            student = await self.student_repo.get_by_user_and_group(user_id, assignment.group_id)
            if not student or student.role == "student":
                raise AuthorizationError("Cannot delete this assignment")

        await self.assignment_repo.delete(assignment)
        await self.session.commit()

    async def vote_assignment(
        self,
        assignment_id: uuid.UUID,
        user_id: uuid.UUID,
        vote: int,
    ) -> None:
        """Vote on assignment (confirm/deny)."""
        assignment = await self.assignment_repo.get(assignment_id)
        if not assignment:
            raise NotFoundError("Assignment not found")

        # Verify user is member of the group
        student = await self.student_repo.get_by_user_and_group(user_id, assignment.group_id)
        if not student:
            raise AuthorizationError("Not a member of this group")

        # Normalize vote to -1 or 1
        normalized_vote = 1 if vote > 0 else -1

        await self.vote_repo.upsert_vote(assignment_id, user_id, normalized_vote)
        await self.assignment_repo.update_vote_counts(assignment_id)
        await self.session.commit()

    async def get_upcoming_deadlines(
        self,
        group_id: uuid.UUID,
        *,
        days: int = 7,
        limit: int = 10,
    ) -> list[AssignmentWithSubject]:
        """Get upcoming deadlines for notifications."""
        assignments = await self.assignment_repo.get_upcoming_deadlines(
            group_id, days=days, limit=limit
        )
        return [AssignmentWithSubject.model_validate(a) for a in assignments]

    async def get_user_tasks(
        self,
        user_id: uuid.UUID,
        group_id: uuid.UUID,
        *,
        state: TaskState | None = None,
    ) -> list[TaskWithAssignment]:
        """Get user's task statuses."""
        student = await self.student_repo.get_by_user_and_group(user_id, group_id)
        if not student:
            raise NotFoundError("Not a member of this group")

        tasks = await self.task_repo.get_student_tasks(
            student.id,
            state=state,
            with_assignment=True,
        )
        return [TaskWithAssignment.model_validate(t) for t in tasks]

    async def update_task_status(
        self,
        user_id: uuid.UUID,
        assignment_id: uuid.UUID,
        state: TaskState,
    ) -> TaskStatusResponse:
        """Update user's task status."""
        assignment = await self.assignment_repo.get(assignment_id)
        if not assignment:
            raise NotFoundError("Assignment not found")

        student = await self.student_repo.get_by_user_and_group(user_id, assignment.group_id)
        if not student:
            raise AuthorizationError("Not a member of this group")

        task = await self.task_repo.get_or_create(student.id, assignment_id)
        task = await self.task_repo.update_state(task, state)
        await self.session.commit()

        return TaskStatusResponse.model_validate(task)

    async def bulk_update_tasks(
        self,
        user_id: uuid.UUID,
        data: BulkTaskUpdate,
    ) -> list[TaskStatusResponse]:
        """Bulk update task statuses."""
        results: list[TaskStatusResponse] = []

        for item in data.updates:
            assignment = await self.assignment_repo.get(item.assignment_id)
            if not assignment:
                raise NotFoundError(f"Assignment {item.assignment_id} not found")

            student = await self.student_repo.get_by_user_and_group(
                user_id, assignment.group_id
            )
            if not student:
                raise AuthorizationError("Not a member of this group")

            task = await self.task_repo.get_or_create(student.id, item.assignment_id)
            task = await self.task_repo.update_state(task, item.state)
            results.append(TaskStatusResponse.model_validate(task))

        await self.session.commit()
        return results

    async def get_task_progress(
        self,
        user_id: uuid.UUID,
        group_id: uuid.UUID,
    ) -> TaskProgress:
        """Get task progress counters for user in a group."""
        student = await self.student_repo.get_by_user_and_group(user_id, group_id)
        if not student:
            return TaskProgress(total=0, done=0, doing=0, review=0, todo=0)

        tasks = await self.task_repo.get_student_tasks(student.id)

        counts = {"todo": 0, "doing": 0, "review": 0, "done": 0}
        for task in tasks:
            counts[task.state.value] = counts.get(task.state.value, 0) + 1

        total = sum(counts.values())
        return TaskProgress(
            total=total,
            done=counts["done"],
            doing=counts["doing"],
            review=counts["review"],
            todo=counts["todo"],
        )
