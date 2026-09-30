"""User and Identity repositories."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.models.user import AuditLog, ConsentRecord, Identity, User
from src.core.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """User repository."""

    model = User

    async def get_with_identities(self, user_id: uuid.UUID) -> User | None:
        """Get user with all identities loaded."""
        stmt = select(User).where(User.id == user_id).options(selectinload(User.identities))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_identity(self, provider: str, external_id: str) -> User | None:
        """Get user by external identity."""
        stmt = (
            select(User)
            .join(Identity)
            .where(Identity.provider == provider, Identity.external_id == external_id)
            .options(selectinload(User.identities))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_with_data(self, user: User) -> None:
        """Delete user and all associated data (FZ-152 compliance)."""
        await self.session.delete(user)
        await self.session.flush()


class IdentityRepository(BaseRepository[Identity]):
    """Identity repository."""

    model = Identity

    async def get_by_external(self, provider: str, external_id: str) -> Identity | None:
        """Get identity by provider and external ID."""
        stmt = select(Identity).where(
            Identity.provider == provider,
            Identity.external_id == external_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_identities(self, user_id: uuid.UUID) -> list[Identity]:
        """Get all identities for a user."""
        stmt = select(Identity).where(Identity.user_id == user_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_user_telegram_identity(self, user_id: uuid.UUID) -> Identity | None:
        """Get Telegram identity for a user."""
        stmt = select(Identity).where(
            Identity.user_id == user_id,
            Identity.provider == "telegram",
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class AuditLogRepository(BaseRepository[AuditLog]):
    """Audit log repository."""

    model = AuditLog

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def log(
        self,
        action: str,
        *,
        user_id: uuid.UUID | None = None,
        resource: str | None = None,
        resource_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        """Create audit log entry."""
        return await self.create(
            user_id=user_id,
            action=action,
            resource=resource,
            resource_id=resource_id,
            ip_address=ip_address,
            user_agent=user_agent,
            created_at=datetime.utcnow(),
        )

    async def get_user_logs(
        self,
        user_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 100,
    ) -> list[AuditLog]:
        """Get audit logs for user."""
        stmt = (
            select(AuditLog)
            .where(AuditLog.user_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class ConsentRepository(BaseRepository[ConsentRecord]):
    """Consent record repository."""

    model = ConsentRecord

    async def get_active_consents(self, user_id: uuid.UUID) -> list[ConsentRecord]:
        """Get all active (non-revoked) consents for user."""
        stmt = (
            select(ConsentRecord)
            .where(
                ConsentRecord.user_id == user_id,
                ConsentRecord.revoked_at.is_(None),
            )
            .order_by(ConsentRecord.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def revoke_consent(self, consent: ConsentRecord) -> ConsentRecord:
        """Revoke a consent record."""
        consent.revoked_at = datetime.utcnow()
        await self.session.flush()
        return consent

    async def has_consent(self, user_id: uuid.UUID, consent_type: str) -> bool:
        """Check if user has active consent of given type."""
        stmt = select(ConsentRecord.id).where(
            ConsentRecord.user_id == user_id,
            ConsentRecord.consent_type == consent_type,
            ConsentRecord.granted.is_(True),
            ConsentRecord.revoked_at.is_(None),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None
