"""Модерация платформы: обращения в поддержку и заявки преподавателей (#99)."""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.user import User


class SupportStatus(enum.StrEnum):
    """Статус обращения в поддержку."""

    NEW = "new"
    IN_PROGRESS = "in_progress"
    CLOSED = "closed"


class ApplicationStatus(enum.StrEnum):
    """Статус заявки преподавателя."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class SupportRequest(Base, UUIDMixin, TimestampMixin):
    """Обращение студента в поддержку."""

    __tablename__ = "support_requests"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SupportStatus] = mapped_column(
        Enum(SupportStatus, native_enum=False, length=16),
        default=SupportStatus.NEW,
        nullable=False,
        index=True,
    )
    reply: Mapped[str | None] = mapped_column(Text)
    handled_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])


class TeacherApplication(Base, UUIDMixin, TimestampMixin):
    """Заявка пользователя на роль преподавателя."""

    __tablename__ = "teacher_applications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(255))
    comment: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, native_enum=False, length=16),
        default=ApplicationStatus.PENDING,
        nullable=False,
        index=True,
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
