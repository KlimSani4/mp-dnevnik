"""Authentication service."""

import json
import logging
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.models.user import User
from src.core.repositories.user import (
    AuditLogRepository,
    ConsentRepository,
    IdentityRepository,
    UserRepository,
)
from src.core.schemas.auth import ExternalIdentity, TokenResponse
from src.shared.exceptions import AuthenticationError, ValidationError
from src.shared.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_consent_text,
    validate_telegram_init_data,
    validate_telegram_widget_data,
)

if TYPE_CHECKING:
    from src.gateways.base import AuthProvider

logger = logging.getLogger(__name__)


class AuthService:
    """Authentication and authorization service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.identity_repo = IdentityRepository(session)
        self.consent_repo = ConsentRepository(session)
        self.audit_repo = AuditLogRepository(session)

    async def authenticate_telegram(
        self,
        *,
        init_data: str | None = None,
        widget_data: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[User, TokenResponse, bool]:
        """
        Authenticate user via Telegram.
        Returns (user, tokens, is_new_user).
        """
        # Validate and extract identity
        if init_data:
            data = validate_telegram_init_data(init_data)
            user_data = json.loads(data.get("user", "{}"))
            external_id = str(user_data.get("id", ""))
            username = user_data.get("username")
            first_name = user_data.get("first_name", "")
            last_name = user_data.get("last_name", "")
            display_name = f"{first_name} {last_name}".strip() or username
        elif widget_data:
            data = validate_telegram_widget_data(widget_data.copy())
            external_id = str(data.get("id", ""))
            username = data.get("username")
            first_name = data.get("first_name", "")
            last_name = data.get("last_name", "")
            display_name = f"{first_name} {last_name}".strip() or username
        else:
            raise ValidationError("Either init_data or widget_data required")

        if not external_id:
            raise AuthenticationError("Invalid Telegram data: missing user ID")

        identity = ExternalIdentity(
            provider="telegram",
            external_id=external_id,
            username=username,
            display_name=display_name,
            raw_data=data,
        )

        return await self._login(identity, ip_address=ip_address, user_agent=user_agent)

    async def authenticate(
        self,
        provider: "AuthProvider",
        data: dict[str, Any],
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[User, TokenResponse, bool]:
        """
        Authenticate user via any AuthProvider (VK, ...).
        The provider validates the data and returns the identity.
        Returns (user, tokens, is_new_user).
        """
        external = await provider.validate(data)

        if not external.external_id:
            raise AuthenticationError(f"Invalid {provider.provider} data: missing user ID")

        identity = ExternalIdentity(
            provider=external.provider,
            external_id=external.external_id,
            username=external.username,
            display_name=external.display_name,
            raw_data=external.raw_data,
        )

        return await self._login(identity, ip_address=ip_address, user_agent=user_agent)

    async def _login(
        self,
        identity: ExternalIdentity,
        *,
        ip_address: str | None,
        user_agent: str | None,
    ) -> tuple[User, TokenResponse, bool]:
        """Find or create the user for a validated identity, issue tokens, write audit."""
        user, is_new = await self._get_or_create_user(identity)

        tokens = self._create_tokens(user)

        await self.audit_repo.log(
            action="login" if not is_new else "register",
            user_id=user.id,
            resource="auth",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()

        return user, tokens, is_new

    async def dev_login(
        self,
        *,
        telegram_id: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[User, TokenResponse]:
        """Dev-only login: find or create user by telegram_id, return tokens."""
        user = await self.register_from_bot(
            telegram_id=telegram_id,
            first_name="Dev",
            last_name="User",
        )
        tokens = self._create_tokens(user)

        await self.audit_repo.log(
            action="dev_login",
            user_id=user.id,
            resource="auth",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()

        return user, tokens

    async def register_from_bot(
        self,
        *,
        telegram_id: str,
        username: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> User:
        """Register or get user from Telegram bot (no signature validation)."""
        display_name = f"{first_name or ''} {last_name or ''}".strip() or username or "User"

        identity = ExternalIdentity(
            provider="telegram",
            external_id=telegram_id,
            username=username,
            display_name=display_name,
            raw_data={"first_name": first_name, "last_name": last_name},
        )

        user, is_new = await self._get_or_create_user(identity)

        if is_new:
            logger.info(
                "User registered from bot",
                extra={"user_id": str(user.id), "telegram_id": telegram_id},
            )

        return user

    async def _get_or_create_user(self, identity: ExternalIdentity) -> tuple[User, bool]:
        """Get existing user or create new one with identity."""
        existing = await self.user_repo.get_by_identity(identity.provider, identity.external_id)

        if existing:
            return existing, False

        # Create new user
        user = await self.user_repo.create(
            display_name=identity.display_name,
            settings={},
        )

        # Create identity
        await self.identity_repo.create(
            user_id=user.id,
            provider=identity.provider,
            external_id=identity.external_id,
            username=identity.username,
            raw_data=identity.raw_data,
        )

        logger.info("New user created", extra={"user_id": str(user.id)})
        return user, True

    def _create_tokens(self, user: User) -> TokenResponse:
        """Create access and refresh tokens for user."""
        payload = {"sub": str(user.id)}

        access_token = create_access_token(payload)
        refresh_token = create_refresh_token(payload)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def refresh_tokens(
        self,
        refresh_token: str,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> TokenResponse:
        """Refresh access token using refresh token."""
        payload = decode_token(refresh_token)

        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationError("Invalid token payload")

        user = await self.user_repo.get(uuid.UUID(user_id))
        if not user:
            raise AuthenticationError("User not found")

        tokens = self._create_tokens(user)

        await self.audit_repo.log(
            action="token_refresh",
            user_id=user.id,
            resource="auth",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()

        return tokens

    async def logout(
        self,
        user_id: uuid.UUID,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Log out user (audit only, tokens are stateless)."""
        await self.audit_repo.log(
            action="logout",
            user_id=user_id,
            resource="auth",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()

    async def grant_consent(
        self,
        user_id: uuid.UUID,
        consent_type: str,
        consent_text: str,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Record user consent for FZ-152 compliance."""
        consent_hash = hash_consent_text(consent_text)

        await self.consent_repo.create(
            user_id=user_id,
            consent_type=consent_type,
            granted=True,
            ip_address=ip_address,
            user_agent=user_agent,
            consent_text_hash=consent_hash,
            created_at=datetime.utcnow(),
        )

        await self.audit_repo.log(
            action="consent_granted",
            user_id=user_id,
            resource="consent",
            resource_id=consent_type,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()

    async def revoke_consent(
        self,
        user_id: uuid.UUID,
        consent_type: str,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Revoke user consent."""
        consents = await self.consent_repo.get_active_consents(user_id)

        for consent in consents:
            if consent.consent_type == consent_type:
                await self.consent_repo.revoke_consent(consent)

        await self.audit_repo.log(
            action="consent_revoked",
            user_id=user_id,
            resource="consent",
            resource_id=consent_type,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()
