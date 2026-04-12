"""Notification models."""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.user import User


class NotificationType(str, enum.Enum):
    """Тип уведомления."""

    SCHEDULE_CHANGE = "schedule_change"
    NEW_ASSIGNMENT = "new_assignment"
    DEADLINE = "deadline"
    VOTE = "vote"
    DIGEST = "digest"


class Notification(Base, UUIDMixin):
    """Уведомление пользователя."""

    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, native_enum=False),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User")


class NotificationPreference(Base, UUIDMixin):
    """Настройки уведомлений пользователя (per notification type)."""

    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "type", name="uq_notification_pref_user_type"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, native_enum=False),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # Relationships
    user: Mapped["User"] = relationship("User")
