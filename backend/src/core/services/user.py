"""User service."""

import logging
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.assignment import Assignment, TaskStatus
from src.core.models.group import Student
from src.core.models.notification import Notification
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

        students = (
            (await self.session.execute(select(Student).where(Student.user_id == user_id)))
            .scalars()
            .all()
        )
        student_ids = [s.id for s in students]
        authored = (
            (await self.session.execute(select(Assignment).where(Assignment.author_id == user_id)))
            .scalars()
            .all()
        )
        statuses = (
            (
                await self.session.execute(
                    select(TaskStatus).where(TaskStatus.student_id.in_(student_ids))
                )
            )
            .scalars()
            .all()
            if student_ids
            else []
        )
        notifications_count = (
            await self.session.execute(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user_id)
            )
        ).scalar_one()

        return {
            "user": UserWithIdentities.model_validate(user).model_dump(),
            "consents": [ConsentResponse.model_validate(c).model_dump() for c in consents],
            "audit_logs_count": len(audit_logs),
            "memberships": [
                {
                    "group_id": str(s.group_id),
                    "role": str(s.role),
                    "verified": s.verified,
                    "joined_at": s.created_at,
                }
                for s in students
            ],
            "assignments_authored": [
                {
                    "id": str(a.id),
                    "group_id": str(a.group_id),
                    "title": a.title,
                    "description": a.description,
                    "deadline": a.deadline,
                    "link": a.link,
                    "is_personal": a.is_personal,
                    "created_at": a.created_at,
                }
                for a in authored
            ],
            "task_statuses": [
                {
                    "assignment_id": str(t.assignment_id),
                    "state": str(t.state),
                    "updated_at": t.updated_at,
                }
                for t in statuses
            ],
            "notifications_count": notifications_count,
            "audit_logs": [
                {
                    "action": log.action,
                    "resource": log.resource,
                    "ip_address": log.ip_address,
                    "user_agent": log.user_agent,
                    "created_at": log.created_at,
                }
                for log in audit_logs
            ],
        }

    async def get_user_consents(self, user_id: uuid.UUID) -> list[ConsentResponse]:
        """Get user's active consents."""
        consents = await self.consent_repo.get_active_consents(user_id)
        return [ConsentResponse.model_validate(c) for c in consents]
