"""User service."""

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.repositories.user import (
    AuditLogRepository,
    ConsentRepository,
    IdentityRepository,
    UserRepository,
)
from src.core.schemas.user import (
    ConsentResponse,
    UserResponse,
    UserUpdate,
    UserWithIdentities,
)
from src.shared.exceptions import NotFoundError

logger = logging.getLogger(__name__)


class UserService:
    """User management service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.identity_repo = IdentityRepository(session)
        self.consent_repo = ConsentRepository(session)
        self.audit_repo = AuditLogRepository(session)

    async def get_user(self, user_id: uuid.UUID) -> UserResponse:
        """Get user by ID."""
        user = await self.user_repo.get(user_id)
        if not user:
            raise NotFoundError("User not found")
        return UserResponse.model_validate(user)

    async def get_user_with_identities(self, user_id: uuid.UUID) -> UserWithIdentities:
        """Get user with all linked identities."""
        user = await self.user_repo.get_with_identities(user_id)
        if not user:
            raise NotFoundError("User not found")
        return UserWithIdentities.model_validate(user)

    async def update_user(
        self,
        user_id: uuid.UUID,
        data: UserUpdate,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> UserResponse:
        """Update user profile."""
        user = await self.user_repo.get(user_id)
        if not user:
            raise NotFoundError("User not found")

        update_data = data.model_dump(exclude_unset=True)
        user = await self.user_repo.update(user, **update_data)

        await self.audit_repo.log(
            action="profile_updated",
            user_id=user_id,
            resource="user",
            resource_id=str(user_id),
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self.session.commit()

        return UserResponse.model_validate(user)

    async def delete_user(
        self,
        user_id: uuid.UUID,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Delete user and all associated data (FZ-152 right to deletion)."""
        user = await self.user_repo.get(user_id)
        if not user:
            raise NotFoundError("User not found")

        # Log deletion before actually deleting
        await self.audit_repo.log(
            action="account_deleted",
            user_id=user_id,
            resource="user",
            resource_id=str(user_id),
            ip_address=ip_address,
            user_agent=user_agent,
        )

        await self.user_repo.delete_with_data(user)
        await self.session.commit()

        logger.info("User deleted", extra={"user_id": str(user_id)})

    async def get_user_data(self, user_id: uuid.UUID) -> dict[str, Any]:
        """Get all user data (FZ-152 right to access)."""
        user = await self.user_repo.get_with_identities(user_id)
        if not user:
            raise NotFoundError("User not found")

        # Gather all user data
        consents = await self.consent_repo.get_active_consents(user_id)
        audit_logs = await self.audit_repo.get_user_logs(user_id, limit=1000)

        return {
            "user": UserWithIdentities.model_validate(user).model_dump(),
            "consents": [ConsentResponse.model_validate(c).model_dump() for c in consents],
            "audit_logs_count": len(audit_logs),
        }

    async def get_user_consents(self, user_id: uuid.UUID) -> list[ConsentResponse]:
        """Get user's active consents."""
        consents = await self.consent_repo.get_active_consents(user_id)
        return [ConsentResponse.model_validate(c) for c in consents]
