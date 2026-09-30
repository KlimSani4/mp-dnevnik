"""Shared utilities for the application."""

from src.shared.database import async_session_maker, close_db, engine, get_db, init_db
from src.shared.exceptions import (
    AppException,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    ExternalServiceError,
    NotFoundError,
    RateLimitError,
    ServiceUnavailableError,
    ValidationError,
)
from src.shared.redis import close_redis, get_redis, init_redis
from src.shared.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_consent_text,
    hash_password,
    validate_telegram_init_data,
    validate_telegram_widget_data,
    verify_password,
)

__all__ = [
    # Database
    "engine",
    "async_session_maker",
    "get_db",
    "init_db",
    "close_db",
    # Redis
    "get_redis",
    "init_redis",
    "close_redis",
    # Security
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "validate_telegram_init_data",
    "validate_telegram_widget_data",
    "hash_consent_text",
    # Exceptions
    "AppException",
    "NotFoundError",
    "ValidationError",
    "AuthenticationError",
    "AuthorizationError",
    "ConflictError",
    "RateLimitError",
    "ExternalServiceError",
    "ServiceUnavailableError",
]
