"""Notification routes."""

import uuid

from fastapi import APIRouter, Query, Response

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.notification import (
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationResponse,
    NotificationSettingsUpdate,
)
from src.core.services.notification import NotificationService

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: CurrentUser,
    db: DBSession,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False, description="Только непрочитанные"),
) -> NotificationListResponse:
    """Получить уведомления пользователя с пагинацией."""
    notification_service = NotificationService(db)
    return await notification_service.get_user_notifications(
        user.id,
        offset=offset,
        limit=limit,
        unread_only=unread_only,
    )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> NotificationResponse:
    """Отметить уведомление как прочитанное."""
    notification_service = NotificationService(db)
    return await notification_service.mark_as_read(notification_id, user.id)


@router.post("/read-all", status_code=200)
async def mark_all_notifications_read(
    user: CurrentUser,
    db: DBSession,
) -> dict[str, int]:
    """Отметить все уведомления как прочитанные."""
    notification_service = NotificationService(db)
    count = await notification_service.mark_all_as_read(user.id)
    return {"marked_read": count}


@router.get("/settings", response_model=NotificationPreferencesResponse)
async def get_notification_settings(
    user: CurrentUser,
    db: DBSession,
) -> NotificationPreferencesResponse:
    """Получить настройки уведомлений."""
    notification_service = NotificationService(db)
    return await notification_service.get_preferences(user.id)


@router.patch("/settings", response_model=NotificationPreferencesResponse)
async def update_notification_settings(
    data: NotificationSettingsUpdate,
    user: CurrentUser,
    db: DBSession,
) -> NotificationPreferencesResponse:
    """Обновить настройки уведомлений."""
    notification_service = NotificationService(db)
    return await notification_service.update_preferences(user.id, data)
