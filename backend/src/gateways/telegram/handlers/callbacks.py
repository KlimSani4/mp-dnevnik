"""Callback query handlers."""

import logging
import re
from html import escape

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.core.services.group import GroupService
from src.gateways.telegram.deps import get_session

logger = logging.getLogger(__name__)
router = Router(name="callbacks")


class GroupSelection(StatesGroup):
    """Group selection states."""

    waiting_for_group = State()


@router.callback_query(F.data == "settings:group")
async def callback_settings_group(callback: CallbackQuery, state: FSMContext) -> None:
    """Handle group selection callback."""
    await callback.answer()
    await state.set_state(GroupSelection.waiting_for_group)
    await callback.message.answer(  # type: ignore[union-attr]
        "📚 <b>Выбор группы</b>\n\nВведите номер группы (например, 231-329):"
    )


@router.message(GroupSelection.waiting_for_group)
async def process_group_input(message: Message, state: FSMContext) -> None:
    """Process group code input."""
    tg_user = message.from_user
    if not tg_user or not message.text:
        await message.answer("Пожалуйста, введите номер группы текстом.")
        return

    group_code = message.text.strip().upper()

    # Validate group code format (e.g., 231-329, 241-1234)
    if not re.match(r"^\d{3}-\d{3,4}$", group_code):
        await message.answer(
            "❌ Неверный формат группы.\n\nВведите номер в формате XXX-XXX или XXX-XXXX:"
        )
        return

    # Save group to database
    try:
        async with get_session() as session:
            group_service = GroupService(session)
            student = await group_service.join_group_by_telegram(
                telegram_id=str(tg_user.id),
                group_code=group_code,
            )
            await session.commit()
            logger.info(f"Group joined: {group_code}, student: {student.id}")
    except Exception as e:
        logger.exception(f"Failed to join group: {e}")
        await message.answer("❌ Не удалось сохранить группу. Проверьте код и попробуйте позже.")
        return

    # Clear state
    await state.clear()

    await message.answer(
        f"✅ Группа <b>{escape(group_code)}</b> сохранена!\n\nТеперь можно посмотреть расписание: /schedule"
    )


async def _reminder_state(tg_user_id: int) -> tuple[bool, int] | None:
    """Текущие настройки напоминания о паре: (включено, за сколько минут)."""
    from src.core.models.notification import NotificationType
    from src.core.repositories.notification import NotificationPreferenceRepository
    from src.core.repositories.user import UserRepository
    from src.core.services import class_reminder as cr

    async with get_session() as session:
        user = await UserRepository(session).get_by_identity("telegram", str(tg_user_id))
        if not user:
            return None
        pref = await NotificationPreferenceRepository(session).get_preference(
            user.id, NotificationType.CLASS_REMINDER
        )
        return (pref.enabled if pref else True), cr.reminder_minutes(user.settings)


async def _update_reminder(
    tg_user_id: int, *, enabled: bool | None = None, minutes: int | None = None
) -> bool:
    """Сохранить настройки напоминания. False — пользователь не найден."""
    from src.core.models.notification import NotificationType
    from src.core.repositories.notification import NotificationPreferenceRepository
    from src.core.repositories.user import UserRepository
    from src.core.services import class_reminder as cr

    async with get_session() as session:
        user = await UserRepository(session).get_by_identity("telegram", str(tg_user_id))
        if not user:
            return False
        if enabled is not None:
            await NotificationPreferenceRepository(session).upsert_preference(
                user.id, NotificationType.CLASS_REMINDER, enabled
            )
        if minutes in cr.MINUTES_CHOICES:
            # Новый dict, чтобы SQLAlchemy заметил изменение JSONB
            user.settings = {**(user.settings or {}), cr.SETTINGS_KEY: minutes}
        await session.commit()
        return True


def _notifications_view(enabled: bool, minutes: int) -> tuple[str, InlineKeyboardMarkup]:
    """Текст и кнопки экрана «Уведомления»."""
    from src.core.services import class_reminder as cr

    status = f"включено, за {minutes} минут" if enabled else "выключено"
    text = (
        "🔔 <b>Уведомления</b>\n\n"
        f"<b>Напоминание о паре:</b> {status}\n"
        "Бот пришлёт аудиторию или ссылку на вебинар перед началом пары.\n\n"
        "Остальные уведомления настраиваются в приложении → Настройки → Уведомления."
    )
    rows = [
        [
            InlineKeyboardButton(
                text="🔕 Выключить напоминание" if enabled else "🔔 Включить напоминание",
                callback_data=f"reminder:enabled:{int(not enabled)}",
            )
        ]
    ]
    if enabled:
        rows.append(
            [
                InlineKeyboardButton(
                    text=f"{'✅ ' if m == minutes else ''}За {m} минут",
                    callback_data=f"reminder:minutes:{m}",
                )
                for m in cr.MINUTES_CHOICES
            ]
        )
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


@router.callback_query(F.data == "settings:notifications")
async def callback_settings_notifications(callback: CallbackQuery) -> None:
    """Экран настроек уведомлений: напоминание о паре."""
    await callback.answer()
    state = await _reminder_state(callback.from_user.id)
    if state is None:
        await callback.message.answer(  # type: ignore[union-attr]
            "Сначала войдите в Nexora через /start, затем настройте уведомления."
        )
        return
    text, keyboard = _notifications_view(*state)
    await callback.message.answer(text, reply_markup=keyboard)  # type: ignore[union-attr]


@router.callback_query(F.data.startswith("reminder:"))
async def callback_reminder_settings(callback: CallbackQuery) -> None:
    """Переключатель напоминания и выбор 10 / 15 минут."""
    _, field, raw = (callback.data or "").split(":", 2)
    kwargs: dict[str, bool | int] = {}
    if field == "enabled" and raw in ("0", "1"):
        kwargs["enabled"] = raw == "1"
    elif field == "minutes" and raw.isdigit():
        kwargs["minutes"] = int(raw)
    else:
        await callback.answer()
        return

    if not await _update_reminder(callback.from_user.id, **kwargs):  # type: ignore[arg-type]
        await callback.answer("Сначала войдите через /start", show_alert=True)
        return
    state = await _reminder_state(callback.from_user.id)
    await callback.answer("Сохранено")
    if state and callback.message:
        text, keyboard = _notifications_view(*state)
        await callback.message.edit_text(text, reply_markup=keyboard)  # type: ignore[union-attr]


@router.callback_query(F.data == "settings:webapp")
async def callback_settings_webapp(callback: CallbackQuery) -> None:
    """Handle Mini App callback."""
    await callback.answer()
    await callback.message.answer(  # type: ignore[union-attr]
        "🌐 <b>Mini App</b>\n\n"
        "Полный функционал доступен в Mini App.\n\n"
        "Там можно:\n"
        "• Управлять расписанием\n"
        "• Добавлять задания\n"
        "• Отслеживать прогресс\n"
        "• Настраивать уведомления"
    )
