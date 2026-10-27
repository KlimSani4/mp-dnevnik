"""Схемы модерации платформы (#99)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from src.core.models.moderation import ApplicationStatus, SupportStatus


class UserBrief(BaseModel):
    """Кто обратился / кто подал заявку."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str | None


# ─── Поддержка ───


class SupportRequestCreate(BaseModel):
    message: str = Field(..., min_length=5, max_length=4000)


class SupportRequestUpdate(BaseModel):
    """Модератор меняет статус и/или отвечает. Ответ уходит студенту в Telegram."""

    status: SupportStatus | None = None
    reply: str | None = Field(None, min_length=1, max_length=4000)


class SupportRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    message: str
    status: SupportStatus
    reply: str | None
    replied_at: datetime | None
    created_at: datetime
    user: UserBrief


class MySupportRequestResponse(BaseModel):
    """Своё обращение — без данных о модераторе."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    message: str
    status: SupportStatus
    reply: str | None
    replied_at: datetime | None
    created_at: datetime


# ─── Заявки преподавателей ───


class TeacherApplicationCreate(BaseModel):
    full_name: str = Field(..., min_length=3, max_length=255)
    department: str | None = Field(None, max_length=255)
    comment: str | None = Field(None, max_length=2000)


class TeacherApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    department: str | None
    comment: str | None
    status: ApplicationStatus
    reviewed_at: datetime | None
    created_at: datetime
    user: UserBrief


class MyTeacherApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    department: str | None
    status: ApplicationStatus
    created_at: datetime


# ─── Модераторы, журнал, статистика ───


class ModeratorResponse(BaseModel):
    """Модератор и дата выдачи роли (из журнала аудита)."""

    id: uuid.UUID
    display_name: str | None
    granted_at: datetime | None


class AuditEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    resource: str | None
    resource_id: str | None
    created_at: datetime
    user_id: uuid.UUID | None
    user_name: str | None = None


class DayPoint(BaseModel):
    day: date
    value: int


class ModerationStats(BaseModel):
    users_total: int
    users_new_7d: int
    active_7d: int
    active_30d: int
    groups_total: int
    assignments_total: int
    assignments_new_7d: int
    notifications_7d: int
    support_open: int
    teacher_pending: int
    active_by_day: list[DayPoint]
    new_users_by_day: list[DayPoint]
