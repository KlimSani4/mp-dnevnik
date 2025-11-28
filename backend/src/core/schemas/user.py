"""User and Identity schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IdentityBase(BaseModel):
    """Base identity schema."""

    provider: str = Field(..., max_length=32)
    external_id: str = Field(..., max_length=64)
    username: str | None = Field(None, max_length=64)


class IdentityCreate(IdentityBase):
    """Identity creation schema."""

    raw_data: dict[str, Any] = Field(default_factory=dict)


class IdentityResponse(IdentityBase):
    """Identity response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID


class UserBase(BaseModel):
    """Base user schema."""

    display_name: str | None = Field(None, max_length=255)


class UserCreate(UserBase):
    """User creation schema."""

    settings: dict[str, Any] = Field(default_factory=dict)


class UserUpdate(BaseModel):
    """User update schema."""

    display_name: str | None = Field(None, max_length=255)
    settings: dict[str, Any] | None = None


class UserResponse(UserBase):
    """User response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class UserWithIdentities(UserResponse):
    """User with identities response."""

    identities: list[IdentityResponse] = []


class ConsentBase(BaseModel):
    """Base consent schema."""

    consent_type: str = Field(..., max_length=64)
    granted: bool


class ConsentCreate(ConsentBase):
    """Consent creation schema."""

    consent_text_hash: str = Field(..., max_length=64)
    ip_address: str | None = Field(None, max_length=45)
    user_agent: str | None = Field(None, max_length=512)


class ConsentResponse(ConsentBase):
    """Consent response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    consent_text_hash: str
    created_at: datetime
    revoked_at: datetime | None


class AuditLogResponse(BaseModel):
    """Audit log response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    resource: str | None
    resource_id: str | None
    ip_address: str | None
    created_at: datetime
