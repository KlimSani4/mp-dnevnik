"""/settings: группа (вступить, создать, выйти) и уведомления (#157, #158)."""

from __future__ import annotations

from html import escape

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.gateways.telegram.deps import get_session

router = Router(name="settings")

SITE_URL = "https://nexora.digitaldrugs.tech"

ROLE_TITLES = {
    "starosta": "староста",
    "deputy": "заместитель старосты",
    "assistant": "помощник старосты",
    "student": "студент",
}


async def _my_groups(tg_id: int) -> list[tuple[str, str, bool]] | None:
    """[(код, роль, подтверждён)] или None, если аккаунта ещё нет."""
    from src.core.repositories.group import StudentRepository
    from src.core.repositories.user import UserRepository

    async with get_session() as session:
        user = await UserRepository(session).get_by_identity("telegram", str(tg_id))
        if not user:
            return None
        students = await StudentRepository(session).get_user_students(user.id)
        return [(s.group.code, str(s.role), s.verified) for s in students]


def _group_line(code: str, role: str, verified: bool) -> str:
    if not verified:
        return f"<b>{escape(code)}</b> — заявка ждёт подтверждения старосты"
    return f"<b>{escape(code)}</b> — {ROLE_TITLES.get(role, role)}"


async def settings_view(tg_id: int, first_name: str) -> tuple[str, InlineKeyboardMarkup]:
    groups = await _my_groups(tg_id)
    if groups is None:
        return (
            "Сначала войдите в Nexora: /start",
            InlineKeyboardMarkup(inline_keyboard=[]),
        )
    rows: list[list[InlineKeyboardButton]] = []
    lines = ["⚙️ <b>Настройки</b>", "", f"<b>Вы:</b> {escape(first_name)}"]
    if groups:
        lines.append("<b>Группа:</b> " + "; ".join(_group_line(*g) for g in groups))
        for code, _, _ in groups:
            rows.append(
                [
                    InlineKeyboardButton(
                        text=f"🚪 Выйти из {code}", callback_data=f"group:leave:{code}"
                    )
                ]
            )
        rows.insert(
            0, [InlineKeyboardButton(text="🔁 Другая группа", callback_data="settings:group")]
        )
    else:
        lines += [
            "<b>Группа:</b> не указана",
            "",
            "Без группы нет расписания и заданий — укажите её первой.",
        ]
        rows.insert(
            0, [InlineKeyboardButton(text="📚 Указать группу", callback_data="settings:group")]
        )
    rows += [
        [InlineKeyboardButton(text="🔔 Уведомления", callback_data="settings:notifications")],
        [InlineKeyboardButton(text="🌐 Открыть сайт", url=SITE_URL)],
        [InlineKeyboardButton(text="❓ Как это работает", callback_data="guide:menu")],
    ]
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(Command("settings"))
async def cmd_settings(message: Message) -> None:
    """/settings — текущая группа и что можно настроить."""
    user = message.from_user
    if not user:
        return
    text, keyboard = await settings_view(user.id, user.first_name)
    await message.answer(text, reply_markup=keyboard)


@router.callback_query(F.data == "settings:menu")
async def callback_settings_menu(callback: CallbackQuery) -> None:
    await callback.answer()
    text, keyboard = await settings_view(callback.from_user.id, callback.from_user.first_name)
    if isinstance(callback.message, Message):
        await callback.message.edit_text(text, reply_markup=keyboard)


# ─── Выход из группы (#157) ───


@router.callback_query(F.data.startswith("group:leave:"))
async def callback_leave_ask(callback: CallbackQuery) -> None:
    code = (callback.data or "").split(":", 2)[2]
    groups = await _my_groups(callback.from_user.id) or []
    mine = next((g for g in groups if g[0] == code), None)
    await callback.answer()
    if not mine or not isinstance(callback.message, Message):
        return
    warn = ""
    if mine[1] == "starosta":
        warn = (
            "\n\nВы староста. Роль перейдёт заместителю, если он есть; "
            "иначе нового старосту назначит модератор."
        )
    await callback.message.edit_text(
        f"Выйти из группы <b>{escape(code)}</b>?\n\n"
        "Пропадут ваши отметки заданий, прогресс по предметам и свои изменения в расписании "
        f"этой группы. Вернуться можно, но заново через заявку старосте.{warn}",
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(text="Да, выйти", callback_data=f"group:leave!:{code}"),
                    InlineKeyboardButton(text="Отмена", callback_data="settings:menu"),
                ]
            ]
        ),
    )


@router.callback_query(F.data.startswith("group:leave!:"))
async def callback_leave_confirm(callback: CallbackQuery) -> None:
    from src.core.repositories.user import UserRepository
    from src.core.services.group import GroupService
    from src.shared.exceptions import AppException

    code = (callback.data or "").split(":", 2)[2]
    try:
        async with get_session() as session:
            user = await UserRepository(session).get_by_identity(
                "telegram", str(callback.from_user.id)
            )
            if not user:
                await callback.answer("Сначала войдите через /start", show_alert=True)
                return
            await GroupService(session).leave_group(code, user.id)
    except AppException:
        await callback.answer("Вы уже не в этой группе", show_alert=True)
        return
    await callback.answer("Вы вышли из группы")
    if isinstance(callback.message, Message):
        await callback.message.edit_text(
            f"Вы вышли из группы <b>{escape(code)}</b>.\n\n"
            "Чтобы вступить в другую — /settings → «Указать группу».",
            reply_markup=InlineKeyboardMarkup(
                inline_keyboard=[
                    [InlineKeyboardButton(text="📚 Указать группу", callback_data="settings:group")]
                ]
            ),
        )
