"""Settings command handlers."""

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

router = Router(name="settings")


def get_settings_keyboard() -> InlineKeyboardMarkup:
    """Create settings keyboard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📚 Выбрать группу", callback_data="settings:group")],
            [InlineKeyboardButton(text="🔔 Уведомления", callback_data="settings:notifications")],
            [InlineKeyboardButton(text="🌐 Открыть Mini App", callback_data="settings:webapp")],
        ]
    )


@router.message(Command("settings"))
async def cmd_settings(message: Message) -> None:
    """Handle /settings command."""
    user = message.from_user
    if not user:
        return

    # In real implementation, would show actual user settings
    settings_text = (
        "⚙️ <b>Настройки</b>\n\n"
        f"<b>Пользователь:</b> {user.first_name}\n"
        "<b>Группа:</b> не указана\n"
        "<b>Уведомления:</b> включены\n\n"
        "Выберите, что настроить:"
    )

    await message.answer(settings_text, reply_markup=get_settings_keyboard())
