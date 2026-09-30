"""Semester and subject progress schemas."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from src.core.models.semester import ControlType


class SemesterBase(BaseModel):
    """Base semester schema."""

    name: str = Field(..., max_length=128)
    start_date: date
    end_date: date
    is_current: bool = False


class SemesterResponse(SemesterBase):
    """Semester response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class SubjectSemesterBase(BaseModel):
    """Base subject-semester progress schema."""

    total_labs: int = Field(0, ge=0)
    done_labs: int = Field(0, ge=0)
    total_pz: int = Field(0, ge=0)
    done_pz: int = Field(0, ge=0)
    control_type: ControlType = ControlType.ZACHET


class SubjectSemesterUpdate(BaseModel):
    """Обновление прогресса по предмету."""

    total_labs: int | None = Field(None, ge=0)
    done_labs: int | None = Field(None, ge=0)
    total_pz: int | None = Field(None, ge=0)
    done_pz: int | None = Field(None, ge=0)
    control_type: ControlType | None = None


class SubjectSemesterResponse(SubjectSemesterBase):
    """Subject-semester progress response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject_id: uuid.UUID
    semester_id: uuid.UUID
    student_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class SubjectProgressResponse(BaseModel):
    """Прогресс по предмету в текущем семестре (для GET /subjects/semester)."""

    subject_id: uuid.UUID
    subject_name: str
    short_name: str | None = None
    teacher: str | None = None
    total_labs: int = 0
    done_labs: int = 0
    total_pz: int = 0
    done_pz: int = 0
    control_type: ControlType = ControlType.ZACHET

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_admitted(self) -> bool:
        """Допуск к сессии: >= 70% выполненных работ."""
        total = self.total_labs + self.total_pz
        if total == 0:
            return True
        done = self.done_labs + self.done_pz
        return (done / total) >= 0.7
