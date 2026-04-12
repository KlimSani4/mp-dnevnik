"""Authentication routes."""

from fastapi import APIRouter, HTTPException, Response

from src.api.deps import ClientIP, CurrentUser, DBSession, UserAgent
from src.config import settings
from src.core.schemas.auth import DevLoginRequest, RefreshTokenRequest, TelegramAuthRequest, TokenResponse
from src.core.services.auth import AuthService

router = APIRouter()


@router.post("/dev", response_model=TokenResponse)
async def dev_login(
    data: DevLoginRequest,
    db: DBSession,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> TokenResponse:
    """Dev-only login — skips Telegram validation. Only available when APP_ENV=development."""
    if not settings.is_development:
        raise HTTPException(status_code=403, detail="Dev login is only available in development mode")

    auth_service = AuthService(db)
    user, tokens = await auth_service.dev_login(
        telegram_id=data.telegram_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return tokens


@router.post("/telegram", response_model=TokenResponse)
async def authenticate_telegram(
    data: TelegramAuthRequest,
    db: DBSession,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> TokenResponse:
    """Authenticate via Telegram Mini App or Login Widget."""
    auth_service = AuthService(db)

    user, tokens, is_new = await auth_service.authenticate_telegram(
        init_data=data.init_data,
        widget_data=data.widget_data,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    data: RefreshTokenRequest,
    db: DBSession,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> TokenResponse:
    """Refresh access token using refresh token."""
    auth_service = AuthService(db)

    tokens = await auth_service.refresh_tokens(
        data.refresh_token,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return tokens


@router.post("/logout", status_code=204)
async def logout(
    user: CurrentUser,
    db: DBSession,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> Response:
    """Log out current user."""
    auth_service = AuthService(db)

    await auth_service.logout(
        user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return Response(status_code=204)
