"""Schedule-related models."""

import enum
import uuid
from datetime import date, time
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, Text, Time
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.assignment import Assignment
    from src.core.models.group import Group, Student
    from src.core.models.user import User


class Subject(Base, UUIDMixin):
    """Academic subject."""

    __tablename__ = "subjects"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(64))
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id"),
    )
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    group: Mapped["Group | None"] = relationship("Group", back_populates="subjects")
    schedule_entries: Mapped[list["ScheduleEntry"]] = relationship(
        "ScheduleEntry",
        back_populates="subject",
    )
    assignments: Mapped[list["Assignment"]] = relationship(
        "Assignment",
        back_populates="subject",
    )


class ScheduleEntry(Base, UUIDMixin, TimestampMixin):
    """Single class in the schedule."""

    __tablename__ = "schedule_entries"

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
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-6 (Mon-Sat)
    pair_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-7
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    room: Mapped[str | None] = mapped_column(String(64))
    teacher: Mapped[str | None] = mapped_column(String(255))
    lesson_type: Mapped[str | None] = mapped_column(String(64))
    date_from: Mapped[date | None] = mapped_column(Date)
    date_to: Mapped[date | None] = mapped_column(Date)
    week_parity: Mapped[str | None] = mapped_column(String(16))  # odd/even/both
    external_link: Mapped[str | None] = mapped_column(String(512))
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="schedule_entries")
    subject: Mapped["Subject"] = relationship("Subject", back_populates="schedule_entries")
    overrides: Mapped[list["ScheduleOverride"]] = relationship(
        "ScheduleOverride",
        back_populates="entry",
        cascade="all, delete-orphan",
    )


class OverrideScope(str, enum.Enum):
    """Scope of schedule override."""

    GROUP = "group"
    PERSONAL = "personal"


class OverrideType(str, enum.Enum):
    """Type of schedule override."""

    CANCEL = "cancel"
    ONLINE = "online"
    LINK = "link"
    ROOM = "room"
    NOTE = "note"
    SKIP = "skip"


class ScheduleOverride(Base, UUIDMixin, TimestampMixin):
    """Override for a schedule entry (cancelation, online mode, etc.)."""

    __tablename__ = "schedule_overrides"

    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedule_entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    scope: Mapped[OverrideScope] = mapped_column(
        Enum(OverrideScope, native_enum=False),
        nullable=False,
    )
    override_type: Mapped[OverrideType] = mapped_column(
        Enum(OverrideType, native_enum=False),
        nullable=False,
    )
    value: Mapped[str | None] = mapped_column(Text)
    date: Mapped[date | None] = mapped_column(Date)  # null = all dates
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id"),
    )

    # Relationships
    entry: Mapped["ScheduleEntry"] = relationship("ScheduleEntry", back_populates="overrides")
    author: Mapped["User"] = relationship(
        "User",
        back_populates="schedule_overrides",
        foreign_keys=[author_id],
    )
    student: Mapped["Student | None"] = relationship(
        "Student",
        back_populates="schedule_overrides",
    )
