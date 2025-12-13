"""Task status routes."""

import uuid

from fastapi import APIRouter, Query

from src.api.deps import CurrentUser, DBSession
from src.core.models.assignment import TaskState
from src.core.schemas.assignment import TaskStatusResponse, TaskStatusUpdate, TaskWithAssignment
from src.core.services.assignment import AssignmentService

router = APIRouter()


@router.get("", response_model=list[TaskWithAssignment])
async def get_tasks(
    user: CurrentUser,
    db: DBSession,
    group_id: uuid.UUID = Query(..., description="Group ID"),
    state: TaskState | None = Query(None, description="Filter by state"),
) -> list[TaskWithAssignment]:
    """Get user's task statuses for a group."""
    assignment_service = AssignmentService(db)
    return await assignment_service.get_user_tasks(user.id, group_id, state=state)


@router.patch("/{assignment_id}", response_model=TaskStatusResponse)
async def update_task_status(
    assignment_id: uuid.UUID,
    data: TaskStatusUpdate,
    user: CurrentUser,
    db: DBSession,
) -> TaskStatusResponse:
    """Update task status for an assignment."""
    assignment_service = AssignmentService(db)
    return await assignment_service.update_task_status(user.id, assignment_id, data.state)
