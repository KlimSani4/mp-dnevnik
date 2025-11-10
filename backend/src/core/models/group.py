"""Group and Student models."""

import enum
import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.assignment import Assignment, TaskStatus
    from src.core.models.schedule import ScheduleEntry, ScheduleOverride, Subject
    from src.core.models.user import User


class Group(Base, UUIDMixin, TimestampMixin):
    """Academic group (e.g., 231-329)."""

    __tablename__ = "groups"

    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")

    # Relationships
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])
    students: Mapped[list["Student"]] = relationship(
        "Student",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    chats: Mapped[list["GroupChat"]] = relationship(
        "GroupChat",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    schedule_entries: Mapped[list["ScheduleEntry"]] = relationship(
        "ScheduleEntry",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    subjects: Mapped[list["Subject"]] = relationship(
        "Subject",
        back_populates="group",
    )
    assignments: Mapped[list["Assignment"]] = relationship(
        "Assignment",
        back_populates="group",
        cascade="all, delete-orphan",
    )


class GroupChat(Base, UUIDMixin):
    """Chat linked to a group (Telegram, VK, etc.)."""

    __tablename__ = "group_chats"
    __table_args__ = (UniqueConstraint("provider", "chat_id", name="uq_group_chat_provider"),)

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    chat_id: Mapped[str] = mapped_column(String(64), nullable=False)

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="chats")


class StudentRole(str, enum.Enum):
    """Student role in group."""

    STUDENT = "student"
    STAROSTA = "starosta"
    DEPUTY = "deputy"


class Student(Base, UUIDMixin, TimestampMixin):
    """Student membership in a group."""

    __tablename__ = "students"
    __table_args__ = (UniqueConstraint("user_id", "group_id", name="uq_student_user_group"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[StudentRole] = mapped_column(
        Enum(StudentRole, native_enum=False),
        default=StudentRole.STUDENT,
    )
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="students")
    group: Mapped["Group"] = relationship("Group", back_populates="students")
    schedule_overrides: Mapped[list["ScheduleOverride"]] = relationship(
        "ScheduleOverride",
        back_populates="student",
    )
    task_statuses: Mapped[list["TaskStatus"]] = relationship(
        "TaskStatus",
        back_populates="student",
        cascade="all, delete-orphan",
    )
