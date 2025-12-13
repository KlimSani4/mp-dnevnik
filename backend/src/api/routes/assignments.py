"""Assignment routes."""

import uuid

from fastapi import APIRouter, Query, Response

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.assignment import (
    AssignmentCreate,
    AssignmentUpdate,
    AssignmentWithSubject,
    VoteCreate,
)
from src.core.services.assignment import AssignmentService

router = APIRouter()


@router.get("", response_model=list[AssignmentWithSubject])
async def list_assignments(
    _user: CurrentUser,
    db: DBSession,
    group_id: uuid.UUID = Query(..., description="Group ID"),
    subject_id: uuid.UUID | None = Query(None, description="Filter by subject"),
    upcoming_only: bool = Query(False, description="Only show upcoming deadlines"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> list[AssignmentWithSubject]:
    """Get assignments for a group."""
    assignment_service = AssignmentService(db)
    return await assignment_service.get_group_assignments(
        group_id,
        subject_id=subject_id,
        upcoming_only=upcoming_only,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=AssignmentWithSubject, status_code=201)
async def create_assignment(
    data: AssignmentCreate,
    user: CurrentUser,
    db: DBSession,
) -> AssignmentWithSubject:
    """Create new assignment."""
    assignment_service = AssignmentService(db)
    assignment = await assignment_service.create_assignment(data, user.id)
    return await assignment_service.get_assignment(assignment.id)


@router.get("/{assignment_id}", response_model=AssignmentWithSubject)
async def get_assignment(
    assignment_id: uuid.UUID,
    db: DBSession,
) -> AssignmentWithSubject:
    """Get assignment by ID."""
    assignment_service = AssignmentService(db)
    return await assignment_service.get_assignment(assignment_id)


@router.patch("/{assignment_id}", response_model=AssignmentWithSubject)
async def update_assignment(
    assignment_id: uuid.UUID,
    data: AssignmentUpdate,
    user: CurrentUser,
    db: DBSession,
) -> AssignmentWithSubject:
    """Update assignment (author or starosta only)."""
    assignment_service = AssignmentService(db)
    return await assignment_service.update_assignment(assignment_id, data, user.id)


@router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> Response:
    """Delete assignment (author or starosta only)."""
    assignment_service = AssignmentService(db)
    await assignment_service.delete_assignment(assignment_id, user.id)
    return Response(status_code=204)


@router.post("/{assignment_id}/vote", status_code=204)
async def vote_assignment(
    assignment_id: uuid.UUID,
    data: VoteCreate,
    user: CurrentUser,
    db: DBSession,
) -> Response:
    """Vote on assignment (confirm/deny its existence)."""
    assignment_service = AssignmentService(db)
    await assignment_service.vote_assignment(assignment_id, user.id, data.vote)
    return Response(status_code=204)
