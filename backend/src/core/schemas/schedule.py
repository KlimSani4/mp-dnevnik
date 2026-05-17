"""Schedule-related schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from src.core.models.schedule import OverrideScope, OverrideType


class SubjectBase(BaseModel):
    """Base subject schema."""

    name: str = Field(..., max_length=255)
    short_name: str | None = Field(None, max_length=64)


class SubjectCreate(BaseModel):
    """Subject creation schema (used for custom subjects)."""

    name: str = Field(..., max_length=255)


class SubjectCreateFull(SubjectBase):
    """Full subject creation schema (internal use)."""

    group_id: uuid.UUID | None = None
    is_custom: bool = False


class SubjectRequirementsUpdate(BaseModel):
    """Update assignment requirements for a subject (stored in group settings)."""

    total: int | None = Field(None, ge=0)
    type_breakdown: dict[str, int] | None = None


class SubjectResponse(SubjectBase):
    """Subject response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID | None
    is_custom: bool


class ScheduleEntryBase(BaseModel):
    """Base schedule entry schema."""

    weekday: int = Field(..., ge=1, le=6)
    pair_number: int = Field(..., ge=1, le=7)
    start_time: time
    end_time: time
    location: str | None = Field(None, max_length=255)
    room: str | None = Field(None, max_length=64)
    teacher: str | None = Field(None, max_length=255)
    lesson_type: str | None = Field(None, max_length=64)


class ScheduleEntryCreate(ScheduleEntryBase):
    """Schedule entry creation schema."""

    group_id: uuid.UUID
    subject_id: uuid.UUID
    date_from: date | None = None
    date_to: date | None = None
    week_parity: str | None = Field(None, max_length=16)
    external_link: str | None = Field(None, max_length=512)
    raw_data: dict[str, Any] = Field(default_factory=dict)


class ScheduleEntryUpdate(BaseModel):
    """Schedule entry update schema."""

    location: str | None = None
    room: str | None = None
    external_link: str | None = None


class ScheduleEntryResponse(ScheduleEntryBase):
    """Schedule entry response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    subject_id: uuid.UUID
    date_from: date | None
    date_to: date | None
    week_parity: str | None
    external_link: str | None
    created_at: datetime
    updated_at: datetime


class ScheduleEntryWithSubject(ScheduleEntryResponse):
    """Schedule entry with subject info."""

    subject: SubjectResponse


class OverrideBase(BaseModel):
    """Base override schema."""

    scope: OverrideScope
    override_type: OverrideType
    value: str | None = None
    target_date: date | None = None


class OverrideCreate(OverrideBase):
    """Override creation schema."""

    entry_id: uuid.UUID


class OverrideResponse(OverrideBase):
    """Override response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entry_id: uuid.UUID
    author_id: uuid.UUID
    student_id: uuid.UUID | None
    created_at: datetime


class DayScheduleResponse(BaseModel):
    """Day schedule response."""

    schedule_date: date
    weekday: int
    entries: list[ScheduleEntryWithSubject]
