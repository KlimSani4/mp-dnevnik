"""Group routes."""

import uuid

from fastapi import APIRouter, Query

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.group import (
    GroupCreate,
    GroupResponse,
    GroupUpdate,
    StudentResponse,
    StudentWithGroup,
)
from src.core.schemas.schedule import SubjectResponse
from src.core.services.group import GroupService

router = APIRouter()


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    db: DBSession,
    search: str | None = Query(None, description="Search by group code"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[GroupResponse]:
    """List all groups with optional search."""
    group_service = GroupService(db)
    return await group_service.list_groups(
        search=search,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=GroupResponse, status_code=201)
async def create_group(
    data: GroupCreate,
    user: CurrentUser,
    db: DBSession,
) -> GroupResponse:
    """Create new group. Creator becomes starosta."""
    group_service = GroupService(db)
    return await group_service.create_group(data, user.id)


@router.get("/my", response_model=list[StudentWithGroup])
async def get_my_groups(
    user: CurrentUser,
    db: DBSession,
) -> list[StudentWithGroup]:
    """Get groups current user is member of."""
    group_service = GroupService(db)
    return await group_service.get_user_groups(user.id)


@router.get("/{code}", response_model=GroupResponse)
async def get_group(
    code: str,
    db: DBSession,
) -> GroupResponse:
    """Get group by code."""
    group_service = GroupService(db)
    return await group_service.get_group(code)


@router.patch("/{code}", response_model=GroupResponse)
async def update_group(
    code: str,
    data: GroupUpdate,
    user: CurrentUser,
    db: DBSession,
) -> GroupResponse:
    """Update group settings (starosta or owner only)."""
    group_service = GroupService(db)
    return await group_service.update_group(code, data, user.id)


@router.post("/{code}/join", response_model=StudentResponse, status_code=201)
async def join_group(
    code: str,
    user: CurrentUser,
    db: DBSession,
) -> StudentResponse:
    """Join a group as unverified student."""
    group_service = GroupService(db)
    return await group_service.join_group(code, user.id)


@router.get("/{code}/subjects", response_model=list[SubjectResponse])
async def get_group_subjects(
    code: str,
    db: DBSession,
) -> list[SubjectResponse]:
    """Get all subjects for a group."""
    group_service = GroupService(db)
    return await group_service.get_group_subjects(code)


@router.post("/{code}/verify/{user_id}", response_model=StudentResponse)
async def verify_student(
    code: str,
    user_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> StudentResponse:
    """Verify student membership (starosta only)."""
    group_service = GroupService(db)
    return await group_service.verify_student(code, user_id, user.id)
