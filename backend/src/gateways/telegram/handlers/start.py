"""Start and registration handlers."""

import logging

from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from src.core.services.auth import AuthService
from src.gateways.telegram.deps import get_session

logger = logging.getLogger(__name__)
router = Router(name="start")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """Handle /start command - welcome and registration."""
    tg_user = message.from_user
    if not tg_user:
        return

    # Register or get user
    try:
        async with get_session() as session:
            auth_service = AuthService(session)
            user = await auth_service.register_from_bot(
                telegram_id=str(tg_user.id),
                username=tg_user.username,
                first_name=tg_user.first_name,
                last_name=tg_user.last_name,
            )
            await session.commit()
            logger.info(f"User registered: {user.id}")
    except Exception as e:
        logger.exception(f"Failed to register user: {e}")
        await message.answer(f"Ошибка регистрации: {e}")
        return

    welcome_text = (
        f"Привет, {tg_user.first_name}!\n\n"
        "Я бот платформы <b>Nexora</b> для студентов Московского Политеха.\n\n"
        "Что я умею:\n"
        "• /schedule — расписание на сегодня\n"
        "• /deadlines — ближайшие дедлайны\n"
        "• /settings — настройки\n"
        "• /help — справка\n\n"
        "Для начала укажи свою группу в /settings."
    )

    await message.answer(welcome_text)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    """Handle /help command."""
    help_text = (
        "<b>Справка по командам</b>\n\n"
        "/start — начало работы\n"
        "/schedule — расписание на сегодня\n"
        "/deadlines — ближайшие дедлайны\n"
        "/settings — настройки (группа, уведомления)\n"
        "/help — эта справка\n\n"
        "<b>Как это работает</b>\n"
        "1. Укажи группу в настройках\n"
        "2. Получай расписание и дедлайны\n"
        "3. Отмечай выполнение заданий\n\n"
        "Вопросы? Пиши в поддержку."
    )

    await message.answer(help_text)
