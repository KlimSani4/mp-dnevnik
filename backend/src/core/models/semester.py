"""Semester and subject progress tracking models."""

import enum
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from src.core.models.group import Student
    from src.core.models.schedule import Subject


class ControlType(str, enum.Enum):
    """Тип контроля по предмету."""

    EXAM = "exam"
    ZACHET = "zachet"
    DIFF_ZACHET = "diff_zachet"


class Semester(Base, UUIDMixin, TimestampMixin):
    """Учебный семестр (напр. 'Осень 2025')."""

    __tablename__ = "semesters"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Relationships
    subject_semesters: Mapped[list["SubjectSemester"]] = relationship(
        "SubjectSemester",
        back_populates="semester",
        cascade="all, delete-orphan",
    )


class SubjectSemester(Base, UUIDMixin, TimestampMixin):
    """Привязка предмета к семестру с отслеживанием прогресса студента."""

    __tablename__ = "subject_semesters"
    __table_args__ = (
        UniqueConstraint(
            "subject_id", "semester_id", "student_id",
            name="uq_subject_semester_student",
        ),
    )

    subject_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subjects.id", ondelete="CASCADE"),
        nullable=False,
    )
    semester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("semesters.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Прогресс: лабораторные
    total_labs: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    done_labs: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Прогресс: практические занятия
    total_pz: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    done_pz: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Тип контроля
    control_type: Mapped[ControlType] = mapped_column(
        Enum(ControlType, native_enum=False),
        default=ControlType.ZACHET,
    )

    # Relationships
    subject: Mapped["Subject"] = relationship("Subject")
    semester: Mapped["Semester"] = relationship("Semester", back_populates="subject_semesters")
    student: Mapped["Student"] = relationship("Student")
