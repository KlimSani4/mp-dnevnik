"""User routes."""

from typing import Any

from fastapi import APIRouter, Response
from pydantic import BaseModel

from src.api.deps import ClientIP, CurrentUser, DBSession, UserAgent
from src.core.schemas.user import ConsentResponse, UserResponse, UserUpdate
from src.core.services.auth import AuthService
from src.core.services.user import UserService

router = APIRouter()

# Consent text for FZ-152 compliance
DATA_PROCESSING_CONSENT = """
Я даю согласие на обработку моих персональных данных (Telegram ID, имя пользователя,
отображаемое имя) в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ
«О персональных данных» для целей использования платформы Nexora.
"""


class ConsentRequest(BaseModel):
    """Consent grant request."""

    consent_type: str


class UserDataResponse(BaseModel):
    """Full user data export (FZ-152 compliance)."""

    user: dict[str, Any]
    consents: list[dict[str, Any]]
    audit_logs_count: int


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    user: CurrentUser,
    db: DBSession,
) -> UserResponse:
    """Get current user profile."""
    user_service = UserService(db)
    return await user_service.get_user(user.id)


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    data: UserUpdate,
    user: CurrentUser,
    db: DBSession,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> UserResponse:
    """Update current user profile."""
    user_service = UserService(db)
    return await user_service.update_user(
        user.id,
        data,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.delete("/me", status_code=204)
async def delete_current_user(
    user: CurrentUser,
    db: DBSession,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> Response:
    """Delete current user and all data (FZ-152 right to deletion)."""
    user_service = UserService(db)
    await user_service.delete_user(
        user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return Response(status_code=204)


@router.get("/me/data", response_model=UserDataResponse)
async def get_user_data(
    user: CurrentUser,
    db: DBSession,
) -> UserDataResponse:
    """Get all user data (FZ-152 right to access)."""
    user_service = UserService(db)
    data = await user_service.get_user_data(user.id)
    return UserDataResponse(**data)


@router.get("/me/consents", response_model=list[ConsentResponse])
async def get_user_consents(
    user: CurrentUser,
    db: DBSession,
) -> list[ConsentResponse]:
    """Get user's active consents."""
    user_service = UserService(db)
    return await user_service.get_user_consents(user.id)


@router.post("/me/consents", response_model=ConsentResponse, status_code=201)
async def grant_consent(
    data: ConsentRequest,
    user: CurrentUser,
    db: DBSession,
    ip_address: ClientIP,
    user_agent: UserAgent,
) -> ConsentResponse:
    """Grant consent for data processing."""
    auth_service = AuthService(db)

    # Use predefined consent text for now
    consent_text = DATA_PROCESSING_CONSENT

    await auth_service.grant_consent(
        user.id,
        data.consent_type,
        consent_text,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    user_service = UserService(db)
    consents = await user_service.get_user_consents(user.id)

    # Return the just-created consent
    for consent in consents:
        if consent.consent_type == data.consent_type:
            return consent

    # Should never reach here
    return consents[0]
