"""Notification service."""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.notification import NotificationType
from src.core.repositories.notification import (
    NotificationPreferenceRepository,
    NotificationRepository,
)
from src.core.schemas.notification import (
    NotificationListResponse,
    NotificationPreferenceResponse,
    NotificationPreferencesResponse,
    NotificationResponse,
    NotificationSettingsUpdate,
)
from src.shared.exceptions import AuthorizationError, NotFoundError

logger = logging.getLogger(__name__)


class NotificationService:
    """Notification management service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.notification_repo = NotificationRepository(session)
        self.preference_repo = NotificationPreferenceRepository(session)

    async def get_user_notifications(
        self,
        user_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 20,
        unread_only: bool = False,
    ) -> NotificationListResponse:
        """Получить уведомления пользователя с пагинацией."""
        notifications = await self.notification_repo.get_user_notifications(
            user_id,
            offset=offset,
            limit=limit,
            unread_only=unread_only,
        )
        total = await self.notification_repo.count_user_notifications(
            user_id,
            unread_only=unread_only,
        )

        items = [NotificationResponse.model_validate(n) for n in notifications]

        return NotificationListResponse(
            items=items,
            total=total,
            has_more=(offset + limit) < total,
        )

    async def mark_as_read(
        self,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> NotificationResponse:
        """Отметить уведомление как прочитанное."""
        notification = await self.notification_repo.get(notification_id)
        if not notification:
            raise NotFoundError("Уведомление не найдено")

        # Проверить, что уведомление принадлежит пользователю
        if notification.user_id != user_id:
            raise AuthorizationError("Нет доступа к этому уведомлению")

        notification = await self.notification_repo.mark_as_read(notification_id)
        await self.session.commit()

        return NotificationResponse.model_validate(notification)

    async def mark_all_as_read(self, user_id: uuid.UUID) -> int:
        """Отметить все уведомления как прочитанные. Возвращает количество."""
        count = await self.notification_repo.mark_all_as_read(user_id)
        await self.session.commit()
        return count

    async def get_preferences(
        self,
        user_id: uuid.UUID,
    ) -> NotificationPreferencesResponse:
        """Получить настройки уведомлений. Возвращает все типы, даже если не заданы."""
        prefs = await self.preference_repo.get_user_preferences(user_id)

        # Построить маппинг существующих настроек
        pref_map = {p.type: p.enabled for p in prefs}

        # Вернуть все типы с дефолтным значением True
        all_prefs = []
        for notification_type in NotificationType:
            enabled = pref_map.get(notification_type, True)
            all_prefs.append(
                NotificationPreferenceResponse(
                    type=notification_type,
                    enabled=enabled,
                )
            )

        return NotificationPreferencesResponse(preferences=all_prefs)

    async def update_preferences(
        self,
        user_id: uuid.UUID,
        data: NotificationSettingsUpdate,
    ) -> NotificationPreferencesResponse:
        """Обновить настройки уведомлений (batch)."""
        for pref in data.preferences:
            await self.preference_repo.upsert_preference(
                user_id,
                pref.type,
                pref.enabled,
            )

        await self.session.commit()

        return await self.get_preferences(user_id)

    async def create_notification(
        self,
        user_id: uuid.UUID,
        notification_type: NotificationType,
        title: str,
        message: str,
    ) -> NotificationResponse:
        """Создать уведомление (для внутреннего использования сервисами)."""
        # Проверить настройки пользователя
        pref = await self.preference_repo.get_preference(user_id, notification_type)
        if pref and not pref.enabled:
            logger.debug(
                "Notification suppressed by user preference",
                extra={"user_id": str(user_id), "type": notification_type.value},
            )
            # Всё равно создаём, но можно изменить поведение
            # если нужно полностью блокировать

        notification = await self.notification_repo.create(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
        )
        await self.session.commit()

        return NotificationResponse.model_validate(notification)
