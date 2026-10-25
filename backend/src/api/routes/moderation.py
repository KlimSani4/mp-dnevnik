"""Страница модератора платформы (#99). Все маршруты — только для User.is_moderator.

Здесь нет и не должно быть маршрута, который выдаёт или снимает роль модератора:
это делается только командой на сервере (python -m src.cli.moderator).
"""

import uuid

from fastapi import APIRouter, Depends, Query

from src.api.deps import DBSession, ModeratorUser, RedisClient, require_moderator
from src.core.models.moderation import ApplicationStatus, SupportStatus
from src.core.schemas.moderation import (
    AuditEntryResponse,
    ModerationStats,
    ModeratorResponse,
    SupportRequestResponse,
    SupportRequestUpdate,
    TeacherApplicationResponse,
)
from src.core.services.moderation import ModerationService

router = APIRouter(dependencies=[Depends(require_moderator)])


@router.get("/stats", response_model=ModerationStats)
async def get_stats(db: DBSession, redis: RedisClient) -> ModerationStats:
    """Статистика платформы за 30 дней."""
    return await ModerationService(db, redis).stats()


@router.get("/support", response_model=list[SupportRequestResponse])
async def list_support(
    db: DBSession,
    status: SupportStatus | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[SupportRequestResponse]:
    """Обращения в поддержку, новые сверху."""
    items = await ModerationService(db).list_support(status, offset=offset, limit=limit)
    return [SupportRequestResponse.model_validate(i) for i in items]


@router.patch("/support/{request_id}", response_model=SupportRequestResponse)
async def update_support(
    request_id: uuid.UUID, data: SupportRequestUpdate, moderator: ModeratorUser, db: DBSession
) -> SupportRequestResponse:
    """Сменить статус или ответить. Ответ уходит студенту в Telegram."""
    req = await ModerationService(db).update_support(request_id, data, moderator)
    return SupportRequestResponse.model_validate(req)


@router.get("/teacher-applications", response_model=list[TeacherApplicationResponse])
async def list_applications(
    db: DBSession,
    status: ApplicationStatus | None = ApplicationStatus.PENDING,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[TeacherApplicationResponse]:
    """Заявки преподавателей (по умолчанию — ожидающие)."""
    items = await ModerationService(db).list_applications(status, offset=offset, limit=limit)
    return [TeacherApplicationResponse.model_validate(i) for i in items]


@router.post(
    "/teacher-applications/{application_id}/approve", response_model=TeacherApplicationResponse
)
async def approve_application(
    application_id: uuid.UUID, moderator: ModeratorUser, db: DBSession
) -> TeacherApplicationResponse:
    app = await ModerationService(db).review_application(
        application_id, approve=True, moderator=moderator
    )
    return TeacherApplicationResponse.model_validate(app)


@router.post(
    "/teacher-applications/{application_id}/reject", response_model=TeacherApplicationResponse
)
async def reject_application(
    application_id: uuid.UUID, moderator: ModeratorUser, db: DBSession
) -> TeacherApplicationResponse:
    app = await ModerationService(db).review_application(
        application_id, approve=False, moderator=moderator
    )
    return TeacherApplicationResponse.model_validate(app)


@router.get("/moderators", response_model=list[ModeratorResponse])
async def list_moderators(db: DBSession) -> list[ModeratorResponse]:
    """Список модераторов — только просмотр."""
    return await ModerationService(db).list_moderators()


@router.get("/audit", response_model=list[AuditEntryResponse])
async def audit_log(
    db: DBSession, limit: int = Query(100, ge=1, le=500)
) -> list[AuditEntryResponse]:
    """Журнал действий модерации."""
    return await ModerationService(db).audit_log(limit)
