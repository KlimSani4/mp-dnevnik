"""Наполнение предмета (#165): работы с баллами и дедлайнами, материалы, личный учёт.

Работы и материалы добавляет любой участник группы: от старосты, заместителя или
помощника — сразу approved, от остальных — pending до подтверждения ведущим.
Материалы пока ссылками; file_key — задел под загрузку файлов.
"""

import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.user import User


class ContentStatus(enum.StrEnum):
    APPROVED = "approved"
    PENDING = "pending"


class WorkKind(enum.StrEnum):
    LAB = "lab"
    PRACTICE = "practice"
    HOMEWORK = "homework"
    TEST = "test"
    COURSEWORK = "coursework"
    OTHER = "other"


class MaterialKind(enum.StrEnum):
    THEORY = "theory"
    PRESENTATION = "presentation"
    MANUAL = "manual"
    LECTURE = "lecture"
    RECORDING = "recording"
    OTHER = "other"


class SubjectWork(Base, UUIDMixin, TimestampMixin):
    """Работа по предмету: лаба, практика, контрольная…"""

    __tablename__ = "subject_works"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), index=True
    )
    semester: Mapped[int | None] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(16), default=WorkKind.LAB)
    number: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    max_points: Mapped[float | None] = mapped_column(Float)
    deadline: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(16), default=ContentStatus.APPROVED)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    author: Mapped["User | None"] = relationship("User", foreign_keys=[author_id])


class SubjectMaterial(Base, UUIDMixin, TimestampMixin):
    """Материал по предмету: теория, презентация, лекция, запись."""

    __tablename__ = "subject_materials"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), index=True
    )
    semester: Mapped[int | None] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(16), default=MaterialKind.THEORY)
    title: Mapped[str] = mapped_column(String(255))
    url: Mapped[str | None] = mapped_column(String(1024))
    # Задел под загрузку файлов в хранилище: ключ объекта, когда оно появится
    file_key: Mapped[str | None] = mapped_column(String(512))
    lecture_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default=ContentStatus.APPROVED)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    author: Mapped["User | None"] = relationship("User", foreign_keys=[author_id])


class SubjectWorkProgress(Base, UUIDMixin, TimestampMixin):
    """Личная отметка по работе: сдал и сколько баллов получил."""

    __tablename__ = "subject_work_progress"
    __table_args__ = (UniqueConstraint("work_id", "user_id", name="uq_work_progress_user"),)

    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subject_works.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    points: Mapped[float | None] = mapped_column(Float)
    passed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SubjectTag(Base, UUIDMixin, TimestampMixin):
    """Тег предмета: «прога», «ИБ», «основа основ»… Общий для группы.

    tag — как написали, key — нижний регистр без лишних пробелов: «ИБ» и «иб» —
    один тег. Ставит любой подтверждённый участник, убирает поставивший или ведущий.
    """

    __tablename__ = "subject_tags"
    __table_args__ = (UniqueConstraint("subject_id", "key", name="uq_subject_tag_key"),)

    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), index=True
    )
    tag: Mapped[str] = mapped_column(String(32))
    key: Mapped[str] = mapped_column(String(32), index=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
