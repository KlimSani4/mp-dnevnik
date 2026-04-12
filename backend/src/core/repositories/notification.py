"""Notification repositories."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.notification import Notification, NotificationPreference, NotificationType
from src.core.repositories.base import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    """Notification repository."""

    model = Notification

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_user_notifications(
        self,
        user_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 20,
        unread_only: bool = False,
    ) -> list[Notification]:
        """Получить уведомления пользователя с пагинацией."""
        stmt = select(Notification).where(Notification.user_id == user_id)

        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))

        stmt = (
            stmt.order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_user_notifications(
        self,
        user_id: uuid.UUID,
        *,
        unread_only: bool = False,
    ) -> int:
        """Подсчитать количество уведомлений пользователя."""
        stmt = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
        )
        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def mark_as_read(self, notification_id: uuid.UUID) -> Notification | None:
        """Отметить уведомление как прочитанное."""
        notification = await self.get(notification_id)
        if notification:
            notification.is_read = True
            await self.session.flush()
        return notification

    async def mark_all_as_read(self, user_id: uuid.UUID) -> int:
        """Отметить все уведомления пользователя как прочитанные. Возвращает количество."""
        stmt = (
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read.is_(False),
            )
            .values(is_read=True)
        )
        result = await self.session.execute(stmt)
        return result.rowcount


class NotificationPreferenceRepository(BaseRepository[NotificationPreference]):
    """Notification preferences repository."""

    model = NotificationPreference

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_user_preferences(
        self,
        user_id: uuid.UUID,
    ) -> list[NotificationPreference]:
        """Получить все настройки уведомлений пользователя."""
        stmt = (
            select(NotificationPreference)
            .where(NotificationPreference.user_id == user_id)
            .order_by(NotificationPreference.type)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_preference(
        self,
        user_id: uuid.UUID,
        notification_type: NotificationType,
    ) -> NotificationPreference | None:
        """Получить настройку для конкретного типа уведомлений."""
        stmt = select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            NotificationPreference.type == notification_type,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_preference(
        self,
        user_id: uuid.UUID,
        notification_type: NotificationType,
        enabled: bool,
    ) -> NotificationPreference:
        """Создать или обновить настройку уведомлений."""
        existing = await self.get_preference(user_id, notification_type)
        if existing:
            existing.enabled = enabled
            await self.session.flush()
            return existing
        return await self.create(
            user_id=user_id,
            type=notification_type,
            enabled=enabled,
        )
