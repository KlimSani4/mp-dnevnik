"""Group and Student schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from src.core.models.group import StudentRole


class GroupBase(BaseModel):
    """Base group schema."""

    code: str = Field(..., min_length=1, max_length=16)
    name: str | None = Field(None, max_length=255)


class GroupCreate(GroupBase):
    """Group creation schema."""

    pass


class GroupUpdate(BaseModel):
    """Group update schema."""

    name: str | None = Field(None, max_length=255)
    settings: dict[str, Any] | None = None


class GroupResponse(GroupBase):
    """Group response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class GroupChatBase(BaseModel):
    """Base group chat schema."""

    provider: str = Field(..., max_length=32)
    chat_id: str = Field(..., max_length=64)


class GroupChatCreate(GroupChatBase):
    """Group chat creation schema."""

    group_id: uuid.UUID


class GroupChatResponse(GroupChatBase):
    """Group chat response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID


class StudentBase(BaseModel):
    """Base student schema."""

    role: StudentRole = StudentRole.STUDENT
    verified: bool = False


class StudentCreate(BaseModel):
    """Student creation (joining a group)."""

    group_id: uuid.UUID


class StudentUpdate(BaseModel):
    """Student update schema."""

    role: StudentRole | None = None
    verified: bool | None = None


class StudentResponse(StudentBase):
    """Student response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    group_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class StudentWithGroup(StudentResponse):
    """Student with group info."""

    group: GroupResponse
