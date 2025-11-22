"""Assignment and task tracking models."""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.group import Group, Student
    from src.core.models.schedule import Subject
    from src.core.models.user import User


class Assignment(Base, UUIDMixin, TimestampMixin):
    """Assignment posted by students."""

    __tablename__ = "assignments"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    link: Mapped[str | None] = mapped_column(String(512))
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    votes_up: Mapped[int] = mapped_column(Integer, default=0)
    votes_down: Mapped[int] = mapped_column(Integer, default=0)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="assignments")
    subject: Mapped["Subject"] = relationship("Subject", back_populates="assignments")
    author: Mapped["User"] = relationship("User")
    votes: Mapped[list["AssignmentVote"]] = relationship(
        "AssignmentVote",
        back_populates="assignment",
        cascade="all, delete-orphan",
    )
    task_statuses: Mapped[list["TaskStatus"]] = relationship(
        "TaskStatus",
        back_populates="assignment",
        cascade="all, delete-orphan",
    )


class AssignmentVote(Base, UUIDMixin):
    """Vote on assignment (confirm/deny its existence)."""

    __tablename__ = "assignment_votes"
    __table_args__ = (UniqueConstraint("assignment_id", "user_id", name="uq_assignment_vote_user"),)

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    vote: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 or -1

    # Relationships
    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="votes")
    user: Mapped["User"] = relationship("User")


class TaskState(str, enum.Enum):
    """Personal task state."""

    TODO = "todo"
    DOING = "doing"
    REVIEW = "review"
    DONE = "done"


class TaskStatus(Base, UUIDMixin, TimestampMixin):
    """Personal progress on an assignment."""

    __tablename__ = "task_statuses"
    __table_args__ = (
        UniqueConstraint("student_id", "assignment_id", name="uq_task_status_student_assignment"),
    )

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    state: Mapped[TaskState] = mapped_column(
        Enum(TaskState, native_enum=False),
        default=TaskState.TODO,
    )

    # Relationships
    student: Mapped["Student"] = relationship("Student", back_populates="task_statuses")
    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="task_statuses")
