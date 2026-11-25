"""Репозитории модерации платформы (#99)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from src.core.models.assignment import Assignment, TaskState, TaskStatus
from src.core.models.group import Group, Student, StudentRole
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

    async def users_between(self, start: datetime, end: datetime) -> int:
        return await self._count(
            select(func.count())
            .select_from(User)
            .where(User.created_at >= start, User.created_at < end)
        )

    async def assignments_between(self, start: datetime, end: datetime) -> int:
        return await self._count(
            select(func.count())
            .select_from(Assignment)
            .where(Assignment.created_at >= start, Assignment.created_at < end)
        )

    async def users_with_student(self, *, verified_only: bool) -> int:
        """Сколько разных пользователей подали заявку хоть в одну группу / подтверждены."""
        stmt = select(func.count(func.distinct(Student.user_id)))
        if verified_only:
            stmt = stmt.where(Student.verified.is_(True))
        return await self._count(stmt)

    async def groups_active(self) -> int:
        """Группы, где есть хотя бы один подтверждённый участник."""
        return await self._count(
            select(func.count(func.distinct(Student.group_id))).where(Student.verified.is_(True))
        )

    async def groups_with_starosta(self) -> int:
        return await self._count(
            select(func.count(func.distinct(Student.group_id))).where(
                Student.role == StudentRole.STAROSTA
            )
        )

    async def join_requests_pending(self) -> int:
        return await self._count(
            select(func.count()).select_from(Student).where(Student.verified.is_(False))
        )

    async def assignments_personal(self) -> int:
        return await self._count(
            select(func.count()).select_from(Assignment).where(Assignment.is_personal.is_(True))
        )

    async def assignments_by_day(self, since: datetime) -> dict[date, int]:
        day = cast(Assignment.created_at, Date)
        stmt = select(day, func.count()).where(Assignment.created_at >= since).group_by(day)
        return {d: int(n) for d, n in (await self.session.execute(stmt)).all()}

    async def tasks_by_state(self) -> dict[str, int]:
        stmt = select(TaskStatus.state, func.count()).group_by(TaskStatus.state)
        return {
            str(st.value if hasattr(st, "value") else st): int(n)
            for st, n in (await self.session.execute(stmt)).all()
        }

    async def tasks_done_since(self, since: datetime) -> int:
        return await self._count(
            select(func.count())
            .select_from(TaskStatus)
            .where(TaskStatus.state == TaskState.DONE, TaskStatus.updated_at >= since)
        )

    async def notifications_by_type(self, since: datetime) -> dict[str, int]:
        stmt = (
            select(Notification.type, func.count())
            .where(Notification.created_at >= since)
            .group_by(Notification.type)
        )
        return {
            str(t.value if hasattr(t, "value") else t): int(n)
            for t, n in (await self.session.execute(stmt)).all()
        }

    async def support_by_status(self) -> dict[str, int]:
        stmt = select(SupportRequest.status, func.count()).group_by(SupportRequest.status)
        return {
            str(st.value if hasattr(st, "value") else st): int(n)
            for st, n in (await self.session.execute(stmt)).all()
        }

    async def support_reply_hours(self, since: datetime) -> list[float]:
        """Сколько часов прошло от обращения до ответа — для медианы."""
        stmt = select(SupportRequest.created_at, SupportRequest.replied_at).where(
            SupportRequest.replied_at.is_not(None), SupportRequest.created_at >= since
        )
        return [
            (replied - created).total_seconds() / 3600
            for created, replied in (await self.session.execute(stmt)).all()
            if replied is not None
        ]

    async def top_groups(self, since: datetime, limit: int = 5) -> list[tuple[str, int, int]]:
        """Самые большие группы: код, подтверждённые участники, задания за период."""
        members = (
            select(func.count(Student.id))
            .where(Student.group_id == Group.id, Student.verified.is_(True))
            .correlate(Group)
            .scalar_subquery()
        )
        recent = (
            select(func.count(Assignment.id))
            .where(Assignment.group_id == Group.id, Assignment.created_at >= since)
            .correlate(Group)
            .scalar_subquery()
        )
        stmt = (
            select(Group.code, members, recent)
            .order_by(members.desc(), recent.desc(), Group.code)
            .limit(limit)
        )
        return [
            (c, int(m or 0), int(r or 0)) for c, m, r in (await self.session.execute(stmt)).all()
        ]

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


class GroupOverviewRepository:
    """Все группы с числом участников и заявок — для модератора (#150)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_groups(
        self, query: str | None = None, limit: int = 200
    ) -> list[tuple[Group, int, int, str | None]]:
        members = (
            select(func.count(Student.id))
            .where(Student.group_id == Group.id, Student.verified.is_(True))
            .correlate(Group)
            .scalar_subquery()
        )
        pending = (
            select(func.count(Student.id))
            .where(Student.group_id == Group.id, Student.verified.is_(False))
            .correlate(Group)
            .scalar_subquery()
        )
        starosta = (
            select(User.display_name)
            .join(Student, Student.user_id == User.id)
            .where(Student.group_id == Group.id, Student.role == StudentRole.STAROSTA)
            .order_by(Student.created_at)
            .limit(1)
            .correlate(Group)
            .scalar_subquery()
        )
        stmt = select(Group, members, pending, starosta)
        if query:
            stmt = stmt.where(Group.code.ilike(f"%{query.strip()}%"))
        # Сначала группы с заявками, затем по коду
        stmt = stmt.order_by(pending.desc(), Group.code).limit(limit)
        result = await self.session.execute(stmt)
        return [(g, int(m or 0), int(p or 0), st) for g, m, p, st in result.all()]
