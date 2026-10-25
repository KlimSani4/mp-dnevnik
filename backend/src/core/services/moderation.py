"""Модерация платформы (#99).

- ModerationService — действия модератора: статистика, обращения, заявки преподавателей,
  список модераторов и журнал. Вызывается только из маршрутов под require_moderator.
- SupportService и TeacherApplicationService — действия обычного пользователя:
  написать в поддержку и подать заявку преподавателя.
- grant_moderator / revoke_moderator — ЕДИНСТВЕННЫЙ способ изменить роль модератора.
  Используются только CLI-командой src.cli.moderator; ни один маршрут API их не вызывает
  (это проверяет тест tests/test_services/test_moderation.py).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from html import escape
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from src.core import activity
from src.core.models.moderation import (
    ApplicationStatus,
    SupportRequest,
    SupportStatus,
    TeacherApplication,
)
from src.core.models.user import User
from src.core.repositories.moderation import (
    ModerationStatsRepository,
    ModeratorRepository,
    SupportRequestRepository,
    TeacherApplicationRepository,
)
from src.core.repositories.user import AuditLogRepository, IdentityRepository, UserRepository
from src.core.schemas.moderation import (
    AuditEntryResponse,
    DayPoint,
    ModerationStats,
    ModeratorResponse,
    SupportRequestUpdate,
    TeacherApplicationCreate,
)
from src.shared.exceptions import ConflictError, NotFoundError, ValidationError

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

Notify = Callable[[uuid.UUID, str], Awaitable[None]]

# Действия, которые показываются в журнале модерации
MODERATION_ACTIONS = [
    "moderator_granted",
    "moderator_revoked",
    "support_replied",
    "support_status_changed",
    "teacher_approved",
    "teacher_rejected",
]
MAX_OPEN_SUPPORT_REQUESTS = 5


async def telegram_notify(session: AsyncSession, user_id: uuid.UUID, text: str) -> None:
    """Отправить пользователю сообщение в Telegram. Ошибки не прерывают действие модератора."""
    try:
        from src.gateways.telegram.bot import get_bot
        from src.gateways.telegram.notifier import TelegramNotifier

        identity = await IdentityRepository(session).get_user_telegram_identity(user_id)
        if identity and identity.external_id:
            await TelegramNotifier(await get_bot()).send_message(
                identity.external_id, text, parse_mode="html"
            )
    except Exception:  # noqa: BLE001
        logger.warning("Failed to notify user", extra={"user_id": str(user_id)}, exc_info=True)


def _now() -> datetime:
    return datetime.now(tz=UTC)


class ModerationService:
    """Действия модератора платформы."""

    def __init__(
        self,
        session: AsyncSession,
        redis: Redis[str] | None = None,
        notify: Notify | None = None,
    ) -> None:
        self.session = session
        self.redis = redis
        self.support_repo = SupportRequestRepository(session)
        self.app_repo = TeacherApplicationRepository(session)
        self.stats_repo = ModerationStatsRepository(session)
        self.moderator_repo = ModeratorRepository(session)
        self.user_repo = UserRepository(session)
        self.audit_repo = AuditLogRepository(session)
        self._notify = notify or (lambda uid, text: telegram_notify(session, uid, text))

    # ─── Статистика ───

    async def stats(self, today: date | None = None, days: int = 30) -> ModerationStats:
        today = today or _now().date()
        week_ago = _now() - timedelta(days=7)
        since = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), tzinfo=UTC)

        if self.redis is not None:
            active_7d = await activity.count_active(self.redis, today, 7)
            active_30d = await activity.count_active(self.redis, today, 30)
            active_by_day = await activity.daily_active(self.redis, today, days)
        else:
            active_7d = active_30d = 0
            active_by_day = [(today - timedelta(days=i), 0) for i in reversed(range(days))]

        new_by_day = await self.stats_repo.new_users_by_day(since)
        return ModerationStats(
            users_total=await self.stats_repo.users_total(),
            users_new_7d=await self.stats_repo.users_since(week_ago),
            active_7d=active_7d,
            active_30d=active_30d,
            groups_total=await self.stats_repo.groups_total(),
            assignments_total=await self.stats_repo.assignments_total(),
            assignments_new_7d=await self.stats_repo.assignments_since(week_ago),
            notifications_7d=await self.stats_repo.notifications_since(week_ago),
            support_open=await self.support_repo.count_open(),
            teacher_pending=await self.app_repo.count_pending(),
            active_by_day=[DayPoint(day=d, value=v) for d, v in active_by_day],
            new_users_by_day=[
                DayPoint(day=d, value=new_by_day.get(d, 0)) for d, _ in active_by_day
            ],
        )

    # ─── Обращения в поддержку ───

    async def list_support(
        self, status: SupportStatus | None, *, offset: int = 0, limit: int = 50
    ) -> list[SupportRequest]:
        return await self.support_repo.list_by_status(status, offset=offset, limit=limit)

    async def update_support(
        self, request_id: uuid.UUID, data: SupportRequestUpdate, moderator: User
    ) -> SupportRequest:
        req = await self.support_repo.get_with_user(request_id)
        if not req:
            raise NotFoundError("Support request not found")
        if data.status is None and data.reply is None:
            raise ValidationError("Nothing to update")

        if data.reply is not None:
            req.reply = data.reply
            req.replied_at = _now()
            req.handled_by = moderator.id
            # Ответ закрывает обращение, если модератор явно не оставил его «в работе»
            req.status = data.status or SupportStatus.CLOSED
            action = "support_replied"
        else:
            assert data.status is not None
            req.status = data.status
            req.handled_by = moderator.id
            action = "support_status_changed"

        await self.audit_repo.log(
            action, user_id=moderator.id, resource="support_request", resource_id=str(req.id)
        )
        await self.session.commit()
        await self.session.refresh(req)

        if data.reply is not None:
            await self._notify(
                req.user_id,
                "💬 <b>Ответ поддержки Nexora</b>\n\n"
                f"<i>Ваше обращение:</i> {escape(req.message[:300])}\n\n{escape(data.reply)}",
            )
        return req

    # ─── Заявки преподавателей ───

    async def list_applications(
        self, status: ApplicationStatus | None, *, offset: int = 0, limit: int = 50
    ) -> list[TeacherApplication]:
        return await self.app_repo.list_by_status(status, offset=offset, limit=limit)

    async def review_application(
        self, application_id: uuid.UUID, *, approve: bool, moderator: User
    ) -> TeacherApplication:
        app = await self.app_repo.get_with_user(application_id)
        if not app:
            raise NotFoundError("Teacher application not found")
        if app.status != ApplicationStatus.PENDING:
            raise ConflictError("Application already reviewed")

        app.status = ApplicationStatus.APPROVED if approve else ApplicationStatus.REJECTED
        app.reviewed_by = moderator.id
        app.reviewed_at = _now()
        if approve:
            app.user.is_teacher = True

        await self.audit_repo.log(
            "teacher_approved" if approve else "teacher_rejected",
            user_id=moderator.id,
            resource="user",
            resource_id=str(app.user_id),
        )
        await self.session.commit()
        await self.session.refresh(app)

        await self._notify(
            app.user_id,
            "✅ Ваша заявка преподавателя одобрена. Теперь вам доступны функции для преподавателей."
            if approve
            else "Заявка преподавателя отклонена. Если это ошибка, напишите в поддержку.",
        )
        return app

    # ─── Модераторы и журнал (только чтение) ───

    async def list_moderators(self) -> list[ModeratorResponse]:
        return [
            ModeratorResponse(id=u.id, display_name=u.display_name, granted_at=g)
            for u, g in await self.moderator_repo.list_moderators()
        ]

    async def audit_log(self, limit: int = 100) -> list[AuditEntryResponse]:
        rows = await self.moderator_repo.audit_log(actions=MODERATION_ACTIONS, limit=limit)
        out = []
        for entry, name in rows:
            item = AuditEntryResponse.model_validate(entry)
            item.user_name = name
            out.append(item)
        return out


class SupportService:
    """Обращения пользователя в поддержку."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = SupportRequestRepository(session)

    async def create(self, user: User, message: str) -> SupportRequest:
        mine = await self.repo.list_for_user(user.id, limit=MAX_OPEN_SUPPORT_REQUESTS + 1)
        if sum(r.status != SupportStatus.CLOSED for r in mine) >= MAX_OPEN_SUPPORT_REQUESTS:
            raise ConflictError("Too many open support requests")
        req = await self.repo.create(
            user_id=user.id, message=message.strip(), status=SupportStatus.NEW
        )
        await self.session.commit()
        return req

    async def mine(self, user: User) -> list[SupportRequest]:
        return await self.repo.list_for_user(user.id)


class TeacherApplicationService:
    """Заявка пользователя на роль преподавателя."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = TeacherApplicationRepository(session)

    async def apply(self, user: User, data: TeacherApplicationCreate) -> TeacherApplication:
        if user.is_teacher:
            raise ConflictError("Already a teacher")
        if await self.repo.get_pending_for_user(user.id):
            raise ConflictError("Application already pending")
        app = await self.repo.create(
            user_id=user.id,
            full_name=data.full_name.strip(),
            department=data.department,
            comment=data.comment,
            status=ApplicationStatus.PENDING,
        )
        await self.session.commit()
        return app

    async def latest(self, user: User) -> TeacherApplication | None:
        return await self.repo.latest_for_user(user.id)


# ─── Роль модератора: только для CLI ───


async def _find_by_telegram(session: AsyncSession, telegram_id: str) -> User:
    user = await UserRepository(session).get_by_identity("telegram", str(telegram_id))
    if not user:
        raise NotFoundError(f"No user with Telegram ID {telegram_id}")
    return user


async def grant_moderator(session: AsyncSession, telegram_id: str, *, operator: str) -> User:
    """Выдать роль модератора. Вызывается только из src.cli.moderator."""
    user = await _find_by_telegram(session, telegram_id)
    if not user.is_moderator:
        user.is_moderator = True
        await AuditLogRepository(session).log(
            "moderator_granted",
            resource="user",
            resource_id=str(user.id),
            user_agent=f"cli:{operator}",
        )
        await session.commit()
    return user


async def revoke_moderator(session: AsyncSession, telegram_id: str, *, operator: str) -> User:
    """Снять роль модератора. Вызывается только из src.cli.moderator."""
    user = await _find_by_telegram(session, telegram_id)
    if user.is_moderator:
        user.is_moderator = False
        await AuditLogRepository(session).log(
            "moderator_revoked",
            resource="user",
            resource_id=str(user.id),
            user_agent=f"cli:{operator}",
        )
        await session.commit()
    return user
