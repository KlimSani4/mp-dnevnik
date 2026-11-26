"""Очередь на сдачу лабораторных (#62).

Староста открывает очередь на конкретную пару из расписания. Студенты записываются
в боте или на сайте и указывают, какие ЛР сдают. Порядок выбирается при открытии:
по времени записи, случайный при старте, по номеру ЛР или сначала должники.
Тот, кто ведёт очередь, отмечает «сдал / не сдал / нет на месте».
"""

import enum
import uuid
from datetime import date, datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.user import User


class QueueMode(enum.StrEnum):
    FIRST_COME = "first_come"  # кто раньше записался
    RANDOM = "random"  # перемешать при старте
    LAB_NUMBER = "lab_number"  # сначала младшие номера ЛР
    DEBTORS = "debtors"  # сначала те, у кого меньше сдано по предмету


class QueueStatus(enum.StrEnum):
    OPEN = "open"  # идёт запись, сдача ещё не началась
    STARTED = "started"  # идёт сдача
    CLOSED = "closed"


class QueueEntryStatus(enum.StrEnum):
    WAITING = "waiting"
    CURRENT = "current"  # сдаёт сейчас
    PASSED = "passed"
    FAILED = "failed"
    LEFT = "left"  # вышел из очереди


class SwapStatus(enum.StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"  # устарела: кто-то вышел или уже сдаёт


class LabQueue(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lab_queues"
    __table_args__ = (
        # Одна незакрытая очередь на пару в конкретный день
        Index(
            "uq_lab_queues_active_lesson",
            "entry_id",
            "lesson_date",
            unique=True,
            postgresql_where=text("status <> 'closed'"),
        ),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="SET NULL")
    )
    entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_entries.id", ondelete="SET NULL")
    )
    lesson_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time)
    # Снимок названия предмета: очередь читается, даже если пару удалили из расписания
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default=QueueMode.FIRST_COME)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=QueueStatus.OPEN, index=True
    )
    max_labs: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    entries: Mapped[list["LabQueueEntry"]] = relationship(
        "LabQueueEntry", back_populates="queue", cascade="all, delete-orphan"
    )


class LabQueueEntry(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lab_queue_entries"
    __table_args__ = (UniqueConstraint("queue_id", "user_id", name="uq_lab_queue_entry_user"),)

    queue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lab_queues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    labs: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    # Порядок среди ожидающих: 1, 2, 3… Пересчитывается при каждом изменении
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=QueueEntryStatus.WAITING
    )
    skips: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    queue: Mapped[LabQueue] = relationship("LabQueue", back_populates="entries")
    user: Mapped["User"] = relationship("User")


class LabQueueSwap(Base, UUIDMixin, TimestampMixin):
    """Просьба поменяться местами: кто ниже в очереди просит того, кто выше."""

    __tablename__ = "lab_queue_swaps"

    queue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lab_queues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_queue_entries.id", ondelete="CASCADE"), nullable=False
    )
    to_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_queue_entries.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=SwapStatus.PENDING)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
