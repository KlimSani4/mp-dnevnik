"""Callback query handlers."""

import logging
import re

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from src.core.services.group import GroupService
from src.gateways.telegram.deps import get_session

logger = logging.getLogger(__name__)
router = Router(name="callbacks")


class GroupSelection(StatesGroup):
    """Group selection states."""

    waiting_for_group = State()


@router.callback_query(F.data == "settings:group")
async def callback_settings_group(
    callback: CallbackQuery, state: FSMContext
) -> None:
    """Handle group selection callback."""
    await callback.answer()
    await state.set_state(GroupSelection.waiting_for_group)
    await callback.message.answer(  # type: ignore[union-attr]
        "📚 <b>Выбор группы</b>\n\n"
        "Введите номер группы (например, 231-329):"
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
            "❌ Неверный формат группы.\n\n"
            "Введите номер в формате XXX-XXX или XXX-XXXX:"
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
        await message.answer(f"❌ Ошибка: {e}")
        return

    # Clear state
    await state.clear()

    await message.answer(
        f"✅ Группа <b>{group_code}</b> сохранена!\n\n"
        "Теперь можно посмотреть расписание: /schedule"
    )


@router.callback_query(F.data == "settings:notifications")
async def callback_settings_notifications(callback: CallbackQuery) -> None:
    """Handle notifications settings callback."""
    await callback.answer()
    await callback.message.answer(  # type: ignore[union-attr]
        "🔔 <b>Уведомления</b>\n\n"
        "Управление уведомлениями доступно в Mini App.\n\n"
        "Типы уведомлений:\n"
        "• Расписание на день (утром)\n"
        "• Напоминания о дедлайнах\n"
        "• Изменения в расписании"
    )


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
