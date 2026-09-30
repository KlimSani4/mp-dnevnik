"""User and Identity models."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.group import Student
    from src.core.models.schedule import ScheduleOverride


class User(Base, UUIDMixin, TimestampMixin):
    """Platform user. May have multiple identities (Telegram, VK, etc.)."""

    __tablename__ = "users"

    display_name: Mapped[str | None] = mapped_column(String(255))
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")

    # Relationships
    identities: Mapped[list["Identity"]] = relationship(
        "Identity",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    students: Mapped[list["Student"]] = relationship(
        "Student",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    schedule_overrides: Mapped[list["ScheduleOverride"]] = relationship(
        "ScheduleOverride",
        back_populates="author",
        foreign_keys="ScheduleOverride.author_id",
    )
    consent_records: Mapped[list["ConsentRecord"]] = relationship(
        "ConsentRecord",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user",
    )


class Identity(Base, UUIDMixin):
    """External identity linking (Telegram, VK, MAX)."""

    __tablename__ = "identities"
    __table_args__ = (UniqueConstraint("provider", "external_id", name="uq_identity_provider"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    username: Mapped[str | None] = mapped_column(String(64))
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="identities")


class AuditLog(Base, UUIDMixin):
    """Audit log for tracking user actions. GOST R 57580 compliance."""

    __tablename__ = "audit_logs"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource: Mapped[str | None] = mapped_column(String(64))
    resource_id: Mapped[str | None] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
        nullable=False,
    )

    # Relationships
    user: Mapped["User | None"] = relationship("User", back_populates="audit_logs")


class ConsentRecord(Base, UUIDMixin):
    """Consent record for FZ-152 compliance."""

    __tablename__ = "consent_records"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    consent_type: Mapped[str] = mapped_column(String(64), nullable=False)
    granted: Mapped[bool] = mapped_column(nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    consent_text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow,
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column()

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="consent_records")
