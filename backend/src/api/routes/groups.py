"""Group routes."""

import uuid

from fastapi import APIRouter, Depends, Query

from src.api.deps import CurrentUser, DBSession, require_group_moderator
from src.core.schemas.group import (
    GroupCreate,
    GroupResponse,
    GroupUpdate,
    RoleUpdateRequest,
    StudentResponse,
    StudentWithGroup,
    StudentWithUser,
)
from src.core.schemas.schedule import SubjectCreate, SubjectRequirementsUpdate, SubjectResponse
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
    _moderator: object = Depends(require_group_moderator),
) -> GroupResponse:
    """Update group settings (moderator or starosta only)."""
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


@router.get("/{code}/students", response_model=list[StudentWithUser])
async def get_group_students(
    code: str,
    _user: CurrentUser,
    db: DBSession,
    _moderator: object = Depends(require_group_moderator),
) -> list[StudentWithUser]:
    """Get all students in a group with user info (moderator only)."""
    group_service = GroupService(db)
    return await group_service.get_group_students_with_users(code)


@router.post("/{code}/verify/{user_id}", response_model=StudentResponse)
async def verify_student(
    code: str,
    user_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    _moderator: object = Depends(require_group_moderator),
) -> StudentResponse:
    """Verify student membership (moderator only)."""
    group_service = GroupService(db)
    return await group_service.verify_student(code, user_id, user.id)


@router.patch("/{code}/students/{user_id}/role", response_model=StudentResponse)
async def change_student_role(
    code: str,
    user_id: uuid.UUID,
    data: RoleUpdateRequest,
    user: CurrentUser,
    db: DBSession,
    _moderator: object = Depends(require_group_moderator),
) -> StudentResponse:
    """Change a student's role (moderator only)."""
    group_service = GroupService(db)
    return await group_service.set_student_role(code, user_id, data.role, user.id)


@router.post("/{code}/subjects/custom", response_model=SubjectResponse, status_code=201)
async def create_custom_subject(
    code: str,
    data: SubjectCreate,
    user: CurrentUser,
    db: DBSession,
) -> SubjectResponse:
    """Create a personal custom subject for assignment tracking."""
    group_service = GroupService(db)
    return await group_service.create_custom_subject(code, data, user.id)


@router.patch("/{code}/subjects/{subject_id}/requirements", response_model=GroupResponse)
async def update_subject_requirements(
    code: str,
    subject_id: uuid.UUID,
    data: SubjectRequirementsUpdate,
    user: CurrentUser,
    db: DBSession,
    _moderator: object = Depends(require_group_moderator),
) -> GroupResponse:
    """Update assignment requirements for a subject (stored in group settings)."""
    group_service = GroupService(db)
    return await group_service.update_subject_requirements(code, subject_id, data, user.id)
