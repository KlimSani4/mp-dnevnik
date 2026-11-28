"""Start and registration handlers."""

import logging
import re
from html import escape

import httpx
from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.core.services.auth import AuthService
from src.gateways.telegram.deps import get_session

logger = logging.getLogger(__name__)
router = Router(name="start")

SITE_URL = "https://nexora.digitaldrugs.tech"

# Команды в меню бота (set_my_commands при старте) и в /help (#158)
COMMANDS: list[tuple[str, str]] = [
    ("schedule", "расписание на сегодня"),
    ("deadlines", "ближайшие дедлайны"),
    ("queue", "очередь на сдачу лабораторных"),
    ("settings", "группа и уведомления"),
    ("guide", "как работает Nexora"),
    ("help", "список команд"),
]

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

    # Ссылка-приглашение в группу: t.me/<бот>?start=join_<токен> (#147)
    invite = token_arg[len("join_") :] if token_arg.startswith("join_") else None

    if token_arg and not invite and _AUTH_TOKEN_RE.match(token_arg):
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
                await message.answer(
                    "Ссылка для входа устарела или уже использована. Запросите новую на сайте."
                )
            else:
                logger.warning(
                    "Internal auth/complete returned %s: %s", resp.status_code, resp.text
                )
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

    if invite:
        await _join_by_invite(message, invite)
        return

    from src.gateways.telegram.handlers.settings import _my_groups

    groups = await _my_groups(tg_user.id) or []
    if groups:
        welcome_text = (
            f"С возвращением, {escape(tg_user.first_name)}!\n\n"
            "• /schedule — пары на сегодня\n"
            "• /deadlines — что скоро сдавать\n"
            "• /queue — очередь на сдачу лабораторных\n"
            "• /settings — группа и уведомления\n"
            "• /guide — как всё устроено"
        )
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="🌐 Открыть сайт", url=SITE_URL)],
                [InlineKeyboardButton(text="❓ Как это работает", callback_data="guide:menu")],
            ]
        )
    else:
        welcome_text = (
            f"Привет, {escape(tg_user.first_name)}! Я бот <b>Nexora</b> — расписание, задания "
            "и дедлайны группы Московского Политеха в одном месте.\n\n"
            "<b>Как начать</b>\n"
            "1. Укажите группу — расписание подтянется само.\n"
            "2. Староста подтвердит, что вы из группы. Если вы первый — станете старостой.\n"
            "3. Дальше бот сам напомнит о парах и дедлайнах.\n\n"
            "Начнём с группы 👇"
        )
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="📚 Указать группу", callback_data="settings:group")],
                [InlineKeyboardButton(text="❓ Как это работает", callback_data="guide:menu")],
            ]
        )

    await message.answer(welcome_text, parse_mode="HTML", reply_markup=keyboard)


async def _join_by_invite(message: Message, token: str) -> None:
    """Заявка в группу по QR или ссылке-приглашению (#147).

    Дальше — тот же путь, что при вводе номера группы: заявка старосте или
    предложение сменить группу, если человек уже в другой (#162).
    """
    from src.core.services.group import GroupService
    from src.gateways.telegram.handlers.callbacks import _join
    from src.shared.exceptions import NotFoundError

    tg_user = message.from_user
    if not tg_user:
        return
    try:
        async with get_session() as session:
            code = await GroupService(session).group_code_by_invite(token)
    except NotFoundError:
        await message.answer(
            "Ссылка-приглашение устарела: староста её сбросил. Попросите новую "
            "или укажите группу вручную — /settings."
        )
        return
    text, markup, _ = await _join(tg_user.id, code, joined_via="invite")
    await message.answer(text, reply_markup=markup)


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    """/help — команды и куда идти дальше."""
    await message.answer(
        "<b>Команды</b>\n\n"
        + "\n".join(f"/{c} — {d}" for c, d in COMMANDS)
        + "\n\nНе понятно, как всё устроено? /guide — коротко по темам.\n"
        "Вопрос или ошибка — Настройки → «Поддержка» на сайте.",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="❓ Как это работает", callback_data="guide:menu")]
            ]
        ),
    )
