"""Group routes."""

import uuid

from fastapi import APIRouter, Depends, Query

from src.api.deps import CurrentUser, CurrentUserOptional, DBSession, require_group_moderator
from src.core.schemas.group import (
    GroupCreate,
    GroupInvite,
    GroupInvitePreview,
    GroupResponse,
    GroupUpdate,
    RoleUpdateRequest,
    StudentResponse,
    StudentWithContact,
    StudentWithGroup,
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
    switch: bool = Query(False, description="Выйти из текущей группы (#162)"),
) -> GroupResponse:
    """Создать группу из расписания rasp (#146). Создатель — староста.

    404 — такой группы нет на rasp.dmami.ru, 409 — группа уже есть (надо вступить),
    502/503 — rasp недоступен. Человек состоит максимум в одной группе (#162): если он
    уже в группе — 409 с code=ALREADY_IN_GROUP и current_group; switch=true — сменить.
    """
    group_service = GroupService(db)
    return await group_service.create_group(data, user.id, switch=switch)


@router.get("/my", response_model=list[StudentWithGroup])
async def get_my_groups(
    user: CurrentUser,
    db: DBSession,
) -> list[StudentWithGroup]:
    """Get groups current user is member of."""
    group_service = GroupService(db)
    return await group_service.get_user_groups(user.id)


# ─── Ссылка-приглашение (#147). Пути с /invite/ — до /{code}, чтобы не перехватились ───


@router.get("/invite/{token}", response_model=GroupInvitePreview)
async def invite_preview(token: str, db: DBSession) -> GroupInvitePreview:
    """Какая группа за ссылкой. Без входа: страница /join показывает её до логина."""
    return await GroupService(db).invite_preview(token)


@router.post("/invite/{token}/join", response_model=StudentResponse, status_code=201)
async def join_by_invite(
    token: str,
    user: CurrentUser,
    db: DBSession,
    switch: bool = Query(False, description="Выйти из текущей группы (#162)"),
) -> StudentResponse:
    """Заявка в группу по ссылке-приглашению; подтверждает староста."""
    return await GroupService(db).join_by_invite(token, user.id, switch=switch)


@router.get("/{code}/invite", response_model=GroupInvite)
async def get_invite(code: str, user: CurrentUser, db: DBSession) -> GroupInvite:
    """Токен ссылки-приглашения: видят подтверждённые участники, чтобы переслать."""
    return await GroupService(db).get_invite(code, user.id)


@router.post("/{code}/invite/reset", response_model=GroupInvite)
async def reset_invite(code: str, user: CurrentUser, db: DBSession) -> GroupInvite:
    """Сбросить ссылку: старая и её QR перестают работать. Староста или заместитель."""
    return await GroupService(db).reset_invite(code, user.id)


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
    switch: bool = Query(False, description="Выйти из текущей группы (#162)"),
) -> StudentResponse:
    """Вступить в существующую группу: заявка ждёт старосту. Группу не создаёт (#146).

    Уже в другой группе — 409 ALREADY_IN_GROUP; switch=true — выйти из неё и вступить.
    """
    group_service = GroupService(db)
    return await group_service.join_group(code, user.id, switch=switch)


@router.delete("/{code}/membership", status_code=204)
async def leave_group(
    code: str,
    user: CurrentUser,
    db: DBSession,
) -> None:
    """Выйти из группы (#157). Последнего старосту сменяет заместитель, если он есть."""
    await GroupService(db).leave_group(code, user.id)


@router.get("/{code}/subjects", response_model=list[SubjectResponse])
async def get_group_subjects(
    code: str,
    db: DBSession,
    user: CurrentUserOptional,
) -> list[SubjectResponse]:
    """Предметы группы; личные предметы видит только их владелец."""
    group_service = GroupService(db)
    return await group_service.get_group_subjects(code, user.id if user else None)


@router.get("/{code}/students", response_model=list[StudentWithContact])
async def get_group_students(
    code: str,
    _user: CurrentUser,
    db: DBSession,
    _moderator: object = Depends(require_group_moderator),
) -> list[StudentWithContact]:
    """Участники и заявки группы с контактом Telegram.

    Только старосте, заместителю и помощнику: обычные участники контакты не видят (#148).
    """
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


@router.post("/{code}/reject/{user_id}", status_code=204)
async def reject_student(
    code: str,
    user_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    _moderator: object = Depends(require_group_moderator),
) -> None:
    """Отклонить заявку в группу (староста или заместитель) (#148)."""
    group_service = GroupService(db)
    await group_service.reject_student(code, user_id, user.id)


@router.patch("/{code}/students/{user_id}/role", response_model=StudentResponse)
async def change_student_role(
    code: str,
    user_id: uuid.UUID,
    data: RoleUpdateRequest,
    user: CurrentUser,
    db: DBSession,
    _moderator: object = Depends(require_group_moderator),
) -> StudentResponse:
    """Сменить роль участника. Старосту назначает только модератор платформы (#159)."""
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
