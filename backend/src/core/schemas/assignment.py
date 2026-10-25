"""Assignment and task schemas."""

import uuid
from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.core.models.assignment import TaskState
from src.core.schemas.schedule import SubjectResponse


def validate_http_url(value: str | None) -> str | None:
    """Ссылка в задании: только http/https (иначе javascript: и data: попадут в href)."""
    if value is None or value == "":
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("link must be an http(s) URL")
    return value.strip()


class AssignmentBase(BaseModel):
    """Base assignment schema."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    deadline: datetime | None = None
    priority: str = Field("normal", pattern="^(low|normal|high|urgent)$")
    link: str | None = Field(None, max_length=512)

    @field_validator("link")
    @classmethod
    def _check_link(cls, v: str | None) -> str | None:
        return validate_http_url(v)


class AssignmentCreate(AssignmentBase):
    """Assignment creation schema."""

    group_id: uuid.UUID
    subject_id: uuid.UUID
    is_personal: bool = False


class AssignmentUpdate(BaseModel):
    """Assignment update schema."""

    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    deadline: datetime | None = None
    priority: str | None = Field(None, pattern="^(low|normal|high|urgent)$")
    link: str | None = Field(None, max_length=512)
    is_personal: bool | None = None

    @field_validator("link")
    @classmethod
    def _check_link(cls, v: str | None) -> str | None:
        return validate_http_url(v)


class AssignmentResponse(AssignmentBase):
    """Assignment response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    subject_id: uuid.UUID
    author_id: uuid.UUID
    votes_up: int
    votes_down: int
    is_verified: bool
    is_personal: bool
    created_at: datetime
    updated_at: datetime


class AssignmentWithSubject(AssignmentResponse):
    """Assignment with subject info."""

    subject: SubjectResponse


class VoteCreate(BaseModel):
    """Vote creation schema."""

    vote: int = Field(..., ge=-1, le=1)


class VoteResponse(BaseModel):
    """Vote response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assignment_id: uuid.UUID
    user_id: uuid.UUID
    vote: int


class TaskStatusBase(BaseModel):
    """Base task status schema."""

    state: TaskState = TaskState.TODO


class TaskStatusUpdate(BaseModel):
    """Task status update schema."""

    state: TaskState


class TaskStatusResponse(TaskStatusBase):
    """Task status response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    assignment_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class TaskWithAssignment(TaskStatusResponse):
    """Task with assignment info."""

    assignment: AssignmentWithSubject


class BulkTaskUpdateItem(BaseModel):
    """Single item in bulk task update."""

    assignment_id: uuid.UUID
    state: TaskState


class BulkTaskUpdate(BaseModel):
    """Bulk task update request."""

    updates: list[BulkTaskUpdateItem] = Field(..., min_length=1, max_length=50)
