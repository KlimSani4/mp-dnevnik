"""Security utilities: JWT and password hashing."""

import hashlib
import hmac
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl

import jwt
from passlib.context import CryptContext

from src.config import settings
from src.shared.exceptions import AuthenticationError

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    return str(pwd_context.hash(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    return bool(pwd_context.verify(plain_password, hashed_password))


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    encoded: str = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded


def create_refresh_token(data: dict[str, Any]) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh", "jti": uuid.uuid4().hex})
    encoded: str = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate JWT token."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp"]},
        )
        return payload
    except jwt.PyJWTError as e:
        raise AuthenticationError("Invalid token") from e


def _check_auth_date(value: Any, what: str) -> None:
    """auth_date обязателен, это число и не старше 24 часов."""
    try:
        auth_timestamp = int(value)
    except (TypeError, ValueError) as e:
        raise AuthenticationError(f"{what}: invalid auth_date") from e
    if time.time() - auth_timestamp > 86400:
        raise AuthenticationError(f"{what} expired")


def validate_telegram_init_data(init_data: str) -> dict[str, Any]:
    """
    Validate Telegram Mini App init data.

    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        raise AuthenticationError("Telegram bot token not configured")

    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)

    if not received_hash:
        raise AuthenticationError("Missing hash in init data")

    _check_auth_date(parsed.get("auth_date"), "Init data")

    # Create data-check-string
    sorted_items = sorted(parsed.items())
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted_items)

    # Create secret key
    secret_key = hmac.new(
        b"WebAppData",
        settings.TELEGRAM_BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()

    # Calculate hash
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise AuthenticationError("Invalid init data signature")

    return parsed


def validate_telegram_widget_data(data: dict[str, Any]) -> dict[str, Any]:
    """
    Validate Telegram Login Widget data.

    https://core.telegram.org/widgets/login#checking-authorization
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        raise AuthenticationError("Telegram bot token not configured")

    check_hash = data.pop("hash", None)
    if not check_hash:
        raise AuthenticationError("Missing hash in widget data")

    _check_auth_date(data.get("auth_date"), "Widget data")

    # Create data-check-string
    sorted_items = sorted(data.items())
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted_items)

    # Create secret key
    secret_key = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()

    # Calculate hash
    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, check_hash):
        raise AuthenticationError("Invalid widget data signature")

    data["hash"] = check_hash
    return data


INTERNAL_SECRET_HEADER = "X-Internal-Secret"


def _internal_secret() -> str:
    """Секрет для вызовов бота во внутренние маршруты (выводится из APP_SECRET_KEY)."""
    return hmac.new(
        settings.APP_SECRET_KEY.encode(), b"nexora-internal-api", hashlib.sha256
    ).hexdigest()


def internal_api_headers() -> dict[str, str]:
    """Заголовки, с которыми бот вызывает /api/v1/internal/*."""
    return {INTERNAL_SECRET_HEADER: _internal_secret()}


def verify_internal_secret(value: str | None) -> bool:
    """Сравнить присланный секрет с ожидаемым за постоянное время."""
    return bool(value) and hmac.compare_digest(value or "", _internal_secret())


def hash_consent_text(text: str) -> str:
    """Create SHA-256 hash of consent text for audit trail."""
    return hashlib.sha256(text.encode()).hexdigest()
