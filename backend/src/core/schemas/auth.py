"""Authentication schemas."""

import uuid
from typing import Any

from pydantic import BaseModel, Field


class TelegramAuthRequest(BaseModel):
    """Telegram authentication request."""

    init_data: str | None = None
    widget_data: dict[str, Any] | None = None


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class DevLoginRequest(BaseModel):
    """Dev login request (development only)."""

    telegram_id: str = "12345"


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str


class AuthenticatedUser(BaseModel):
    """Authenticated user info for JWT payload."""

    user_id: uuid.UUID
    provider: str
    external_id: str


class ExternalIdentity(BaseModel):
    """External identity from auth provider."""

    provider: str = Field(..., max_length=32)
    external_id: str = Field(..., max_length=64)
    username: str | None = Field(None, max_length=64)
    display_name: str | None = Field(None, max_length=255)
    raw_data: dict[str, Any] = Field(default_factory=dict)
