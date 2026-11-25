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


class KeyValue(BaseModel):
    key: str
    value: int


class TopGroup(BaseModel):
    code: str
    members: int
    assignments_30d: int


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

    # Расширенная статистика (#152). Значения по умолчанию — чтобы старый клиент
    # и тесты, собирающие ModerationStats вручную, не ломались.
    active_1d: int = 0
    users_new_prev_7d: int = 0
    assignments_new_prev_7d: int = 0
    # Воронка вступления: все пользователи → подали заявку в группу → подтверждены
    users_requested_group: int = 0
    users_in_group: int = 0
    groups_active: int = 0
    groups_without_starosta: int = 0
    join_requests_pending: int = 0
    assignments_personal: int = 0
    assignments_by_day: list[DayPoint] = []
    tasks_by_state: list[KeyValue] = []
    tasks_done_7d: int = 0
    notifications_by_type_7d: list[KeyValue] = []
    support_by_status: list[KeyValue] = []
    support_median_reply_hours: float | None = None
    top_groups: list[TopGroup] = []


class GroupOverview(BaseModel):
    """Группа в списке модератора (#150)."""

    code: str
    name: str | None = None
    members: int
    pending: int
    starosta_name: str | None = None
    created_at: datetime
