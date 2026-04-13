"""Start and registration handlers."""

import logging
import re

import httpx
from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from src.core.services.auth import AuthService
from src.gateways.telegram.deps import get_session

logger = logging.getLogger(__name__)
router = Router(name="start")

# Auth tokens are URL-safe base64 strings (no special chars except - and _)
_AUTH_TOKEN_RE = re.compile(r"^[A-Za-z0-9_\-]{16,}$")

# Internal base URL — same process, loopback call
_INTERNAL_BASE = "http://127.0.0.1:8000/api/v1/internal"


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """Handle /start command - welcome and registration, or auth token completion."""
    tg_user = message.from_user
    if not tg_user:
        return

    # Check for auth token payload: /start <token>
    text = message.text or ""
    parts = text.split(maxsplit=1)
    token_arg = parts[1].strip() if len(parts) > 1 else ""

    if token_arg and _AUTH_TOKEN_RE.match(token_arg):
        # Bot-based auth flow
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                resp = await http.post(
                    f"{_INTERNAL_BASE}/auth/complete",
                    json={
                        "token": token_arg,
                        "telegram_id": str(tg_user.id),
                        "username": tg_user.username,
                        "first_name": tg_user.first_name,
                        "last_name": tg_user.last_name,
                    },
                )
            if resp.status_code == 200:
                await message.answer(
                    f"Привет, {tg_user.first_name}!\n\n"
                    "Авторизация прошла успешно. Вернитесь на сайт — страница обновится автоматически.",
                    parse_mode="HTML",
                )
            elif resp.status_code == 404:
                await message.answer("Ссылка для входа устарела или уже использована. Запросите новую на сайте.")
            else:
                logger.warning("Internal auth/complete returned %s: %s", resp.status_code, resp.text)
                await message.answer("Не удалось завершить авторизацию. Попробуйте ещё раз.")
        except Exception as e:
            logger.exception("Bot auth complete failed: %s", e)
            await message.answer("Произошла ошибка при авторизации. Попробуйте позже.")
        return

    # Regular /start — register/greet
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

    await message.answer(welcome_text, parse_mode="HTML")


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
