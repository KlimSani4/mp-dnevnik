"""Репозитории модерации платформы (#99)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from src.core.models.assignment import Assignment
from src.core.models.group import Group
from src.core.models.moderation import (
    ApplicationStatus,
    SupportRequest,
    SupportStatus,
    TeacherApplication,
)
from src.core.models.notification import Notification
from src.core.models.user import AuditLog, User
from src.core.repositories.base import BaseRepository


class SupportRequestRepository(BaseRepository[SupportRequest]):
    model = SupportRequest

    async def list_by_status(
        self, status: SupportStatus | None, *, offset: int = 0, limit: int = 50
    ) -> list[SupportRequest]:
        stmt = select(SupportRequest).options(selectinload(SupportRequest.user))
        if status is not None:
            stmt = stmt.where(SupportRequest.status == status)
        stmt = stmt.order_by(SupportRequest.created_at.desc()).offset(offset).limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_with_user(self, request_id: uuid.UUID) -> SupportRequest | None:
        stmt = (
            select(SupportRequest)
            .options(selectinload(SupportRequest.user))
            .where(SupportRequest.id == request_id)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_for_user(self, user_id: uuid.UUID, limit: int = 20) -> list[SupportRequest]:
        stmt = (
            select(SupportRequest)
            .where(SupportRequest.user_id == user_id)
            .order_by(SupportRequest.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def count_open(self) -> int:
        stmt = select(func.count()).where(SupportRequest.status != SupportStatus.CLOSED)
        return int((await self.session.execute(stmt)).scalar_one())


class TeacherApplicationRepository(BaseRepository[TeacherApplication]):
    model = TeacherApplication

    async def list_by_status(
        self, status: ApplicationStatus | None, *, offset: int = 0, limit: int = 50
    ) -> list[TeacherApplication]:
        stmt = select(TeacherApplication).options(selectinload(TeacherApplication.user))
        if status is not None:
            stmt = stmt.where(TeacherApplication.status == status)
        stmt = stmt.order_by(TeacherApplication.created_at.desc()).offset(offset).limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def get_with_user(self, application_id: uuid.UUID) -> TeacherApplication | None:
        stmt = (
            select(TeacherApplication)
            .options(selectinload(TeacherApplication.user))
            .where(TeacherApplication.id == application_id)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_pending_for_user(self, user_id: uuid.UUID) -> TeacherApplication | None:
        stmt = select(TeacherApplication).where(
            TeacherApplication.user_id == user_id,
            TeacherApplication.status == ApplicationStatus.PENDING,
        )
        return (await self.session.execute(stmt)).scalars().first()

    async def latest_for_user(self, user_id: uuid.UUID) -> TeacherApplication | None:
        stmt = (
            select(TeacherApplication)
            .where(TeacherApplication.user_id == user_id)
            .order_by(TeacherApplication.created_at.desc())
            .limit(1)
        )
        return (await self.session.execute(stmt)).scalars().first()

    async def count_pending(self) -> int:
        stmt = select(func.count()).where(TeacherApplication.status == ApplicationStatus.PENDING)
        return int((await self.session.execute(stmt)).scalar_one())


class ModerationStatsRepository:
    """Агрегаты для страницы статистики. Только чтение."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _count(self, stmt: Select[tuple[int]]) -> int:
        return int((await self.session.execute(stmt)).scalar_one())

    async def users_total(self) -> int:
        return await self._count(select(func.count()).select_from(User))

    async def users_since(self, since: datetime) -> int:
        return await self._count(
            select(func.count()).select_from(User).where(User.created_at >= since)
        )

    async def groups_total(self) -> int:
        return await self._count(select(func.count()).select_from(Group))

    async def assignments_total(self) -> int:
        return await self._count(select(func.count()).select_from(Assignment))

    async def assignments_since(self, since: datetime) -> int:
        return await self._count(
            select(func.count()).select_from(Assignment).where(Assignment.created_at >= since)
        )

    async def notifications_since(self, since: datetime) -> int:
        return await self._count(
            select(func.count()).select_from(Notification).where(Notification.created_at >= since)
        )

    async def new_users_by_day(self, since: datetime) -> dict[date, int]:
        day = cast(User.created_at, Date)
        stmt = select(day, func.count()).where(User.created_at >= since).group_by(day)
        rows = (await self.session.execute(stmt)).all()
        return {d: int(n) for d, n in rows}


class ModeratorRepository:
    """Модераторы и журнал действий. Роль здесь только читается."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_moderators(self) -> list[tuple[User, datetime | None]]:
        """Модераторы и дата последней выдачи роли из журнала аудита."""
        granted = (
            select(AuditLog.resource_id, func.max(AuditLog.created_at).label("granted_at"))
            .where(AuditLog.action == "moderator_granted")
            .group_by(AuditLog.resource_id)
            .subquery()
        )
        stmt = (
            select(User, granted.c.granted_at)
            .outerjoin(granted, granted.c.resource_id == cast(User.id, String))
            .where(User.is_moderator.is_(True))
            .order_by(User.display_name)
        )
        rows = (await self.session.execute(stmt)).all()
        return [(u, g) for u, g in rows]

    async def audit_log(
        self, *, actions: list[str] | None = None, limit: int = 100
    ) -> list[tuple[AuditLog, str | None]]:
        stmt = select(AuditLog, User.display_name).outerjoin(User, User.id == AuditLog.user_id)
        if actions:
            stmt = stmt.where(AuditLog.action.in_(actions))
        stmt = stmt.order_by(AuditLog.created_at.desc()).limit(limit)
        rows = (await self.session.execute(stmt)).all()
        return [(a, n) for a, n in rows]
