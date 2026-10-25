"""Authentication routes."""

import json
import secrets
import time

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from src.api.deps import ClientIP, CurrentUser, DBSession, RedisClient, UserAgent
from src.api.rate_limit import make_rate_limit_dependency
from src.config import settings
from src.core.schemas.auth import (
    DevLoginRequest,
    RefreshTokenRequest,
    TelegramAuthRequest,
    TokenResponse,
)
from src.core.services.auth import AuthService
from src.shared.exceptions import AuthenticationError

router = APIRouter()

_rate_limit_telegram = make_rate_limit_dependency("/api/v1/auth/telegram")
_rate_limit_refresh = make_rate_limit_dependency("/api/v1/auth/refresh")
_rate_limit_init = make_rate_limit_dependency("/api/v1/auth/telegram/init")
_rate_limit_poll = make_rate_limit_dependency("/api/v1/auth/telegram/poll")

REFRESH_COOKIE = "nexora_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def set_refresh_cookie(response: Response, token: str) -> None:
    """Refresh-токен в HttpOnly cookie: недоступен скриптам страницы (защита от кражи через XSS)."""
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=not settings.is_development,
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


BOT_USERNAME = "nexora_mpu_bot"
AUTH_TOKEN_TTL = 600  # 10 minutes


@router.post("/dev", response_model=TokenResponse)
async def dev_login(
    data: DevLoginRequest,
    response: Response,
    db: DBSession,
    redis: RedisClient,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> TokenResponse:
    """Dev-only login — skips Telegram validation. Only available when APP_ENV=development."""
    if not settings.is_development:
        raise HTTPException(
            status_code=403, detail="Dev login is only available in development mode"
        )

    auth_service = AuthService(db, redis)
    user, tokens = await auth_service.dev_login(
        telegram_id=data.telegram_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    set_refresh_cookie(response, tokens.refresh_token)
    return tokens


@router.post(
    "/telegram", response_model=TokenResponse, dependencies=[Depends(_rate_limit_telegram)]
)
async def authenticate_telegram(
    data: TelegramAuthRequest,
    response: Response,
    db: DBSession,
    redis: RedisClient,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> TokenResponse:
    """Authenticate via Telegram Mini App or Login Widget."""
    auth_service = AuthService(db, redis)

    user, tokens, is_new = await auth_service.authenticate_telegram(
        init_data=data.init_data,
        widget_data=data.widget_data,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    set_refresh_cookie(response, tokens.refresh_token)
    return tokens


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(_rate_limit_refresh)])
async def refresh_tokens(
    response: Response,
    db: DBSession,
    redis: RedisClient,
    ip_address: ClientIP,
    user_agent: UserAgent,
    data: RefreshTokenRequest | None = None,
    cookie_token: str | None = Cookie(None, alias=REFRESH_COOKIE),
) -> TokenResponse:
    """Обновить токены по refresh-токену (из тела запроса или HttpOnly cookie); старый отзывается."""
    refresh_token = (data.refresh_token if data else None) or cookie_token
    if not refresh_token:
        raise AuthenticationError("Refresh token required")

    auth_service = AuthService(db, redis)

    tokens = await auth_service.refresh_tokens(
        refresh_token,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    set_refresh_cookie(response, tokens.refresh_token)
    return tokens


@router.post("/telegram/init", dependencies=[Depends(_rate_limit_init)])
async def telegram_bot_init(redis: RedisClient) -> dict[str, str]:
    """Create a pending auth token for bot-based login flow."""
    token = secrets.token_urlsafe(16)
    key = f"auth_token:{token}"
    payload = json.dumps({"status": "pending", "created_at": int(time.time())})
    await redis.set(key, payload, ex=AUTH_TOKEN_TTL)
    return {"token": token, "bot_username": BOT_USERNAME}


@router.get("/telegram/poll/{token}", dependencies=[Depends(_rate_limit_poll)])
async def telegram_bot_poll(token: str, redis: RedisClient, response: Response) -> dict[str, str]:
    """Poll for bot-auth completion."""
    key = f"auth_token:{token}"
    raw = await redis.get(key)
    if raw is None:
        raise HTTPException(status_code=404, detail="Token not found or expired")

    data = json.loads(raw)
    if data["status"] == "pending":
        return {"status": "pending"}

    # Complete — delete token and return tokens
    await redis.delete(key)
    set_refresh_cookie(response, data["refresh_token"])
    return {
        "status": "complete",
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "token_type": data["token_type"],
    }


@router.post("/logout", status_code=204)
async def logout(
    user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> Response:
    """Log out current user."""
    auth_service = AuthService(db, redis)

    await auth_service.logout(
        user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    response = Response(status_code=204)
    clear_refresh_cookie(response)
    return response
