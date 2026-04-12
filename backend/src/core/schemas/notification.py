"""Notification schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from src.core.models.notification import NotificationType


class NotificationResponse(BaseModel):
    """Notification response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    type: NotificationType
    title: str
    message: str
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Paginated notification list."""

    items: list[NotificationResponse]
    total: int
    has_more: bool


class NotificationPreferenceResponse(BaseModel):
    """Notification preference response schema."""

    model_config = ConfigDict(from_attributes=True)

    type: NotificationType
    enabled: bool


class NotificationPreferencesResponse(BaseModel):
    """Полный набор настроек уведомлений."""

    preferences: list[NotificationPreferenceResponse]


class NotificationPreferenceUpdate(BaseModel):
    """Обновление настроек уведомлений."""

    type: NotificationType
    enabled: bool


class NotificationSettingsUpdate(BaseModel):
    """Batch-обновление настроек уведомлений."""

    preferences: list[NotificationPreferenceUpdate] = Field(
        ..., min_length=1, max_length=10
    )
