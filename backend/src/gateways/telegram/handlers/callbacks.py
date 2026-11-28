"""Callback query handlers."""

import logging
from html import escape

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.core.services.group import GroupService
from src.gateways.telegram.deps import get_session
from src.gateways.telegram.handlers.notify import wizard_button

logger = logging.getLogger(__name__)
router = Router(name="callbacks")


class GroupSelection(StatesGroup):
    """Group selection states."""

    waiting_for_group = State()


@router.callback_query(F.data == "settings:group")
async def callback_settings_group(callback: CallbackQuery, state: FSMContext) -> None:
    """Попросить номер группы."""
    await callback.answer()
    await state.set_state(GroupSelection.waiting_for_group)
    await callback.message.answer(  # type: ignore[union-attr]
        "📚 <b>Ваша группа</b>\n\n"
        "Напишите номер, как в расписании Политеха: например, <code>241-327</code> "
        "или <code>24А-431</code>.\n\n"
        "• Если группа уже есть в Nexora — отправим заявку старосте.\n"
        "• Если вы первый из группы — создадим её, а вы станете старостой.\n\n"
        "Передумали — /cancel"
    )


@router.message(GroupSelection.waiting_for_group, Command("cancel"))
async def cancel_group_input(message: Message, state: FSMContext) -> None:
    await state.clear()
    await message.answer("Ок, группу не меняем. Настройки — /settings")


async def _join(
    tg_id: int, group_code: str, *, switch: bool = False, joined_via: str = "bot"
) -> tuple[str, InlineKeyboardMarkup | None, bool]:
    """Вступить/создать/сменить группу. (текст, кнопки, сбросить ли ожидание ввода)."""
    from src.core.models.group import Group
    from src.shared.exceptions import ConflictError, ExternalServiceError, NotFoundError

    try:
        async with get_session() as session:
            student = await GroupService(session).join_group_by_telegram(
                telegram_id=str(tg_id), group_code=group_code, switch=switch, joined_via=joined_via
            )
            group = await session.get(Group, student.group_id)
            code = group.code if group else group_code
    except ConflictError as e:
        if e.extra.get("code") != "ALREADY_IN_GROUP":
            raise
        current = str(e.extra.get("current_group", ""))
        target = group_code.strip()
        text = (
            f"Вы уже в группе <b>{escape(current)}</b>. В Nexora можно состоять только "
            "в одной группе.\n\n"
            f"Сменить на <b>{escape(target)}</b>? Расписание станет расписанием новой группы, "
            "ваши личные события останутся. Отметки заданий и прогресс по предметам "
            f"в {escape(current)} пропадут."
        )
        markup = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=f"🔁 Сменить на {target}", callback_data=f"group:switch:{target}"
                    ),
                    InlineKeyboardButton(text="Оставить", callback_data="settings:menu"),
                ]
            ]
        )
        return text, markup, True
    except NotFoundError as e:
        if "/start" in e.detail:
            return "Сначала войдите в Nexora: /start", None, True
        return (
            f"❌ Группы <b>{escape(group_code)}</b> нет в расписании Политеха.\n\n"
            "Проверьте номер на rasp.dmami.ru и напишите ещё раз. Передумали — /cancel",
            None,
            False,
        )
    except ExternalServiceError:
        return (
            "Расписание Политеха сейчас не отвечает, не можем проверить номер. "
            "Попробуйте через пару минут.",
            None,
            False,
        )

    moved = "\n\nВаши личные события переехали вместе с вами." if switch else ""
    if student.role == "starosta" and student.verified:
        text = (
            f"🎉 Группа <b>{escape(code)}</b> создана, вы — староста.\n\n"
            "Что дальше:\n"
            "1. Позовите одногруппников: пусть напишут боту номер группы.\n"
            "2. Их заявки придут вам — подтвердите на сайте в Настройках → Группа "
            "(видно, кто это в Telegram).\n"
            "3. Расписание уже подтянулось: /schedule"
            f"{moved}\n\nПодробнее — /guide"
        )
    elif student.verified:
        text = f"Вы уже в группе <b>{escape(code)}</b>. Расписание — /schedule"
    else:
        text = (
            f"✅ Заявка в группу <b>{escape(code)}</b> отправлена старосте.\n\n"
            "Расписание уже доступно: /schedule. Остальное откроется, когда староста "
            f"подтвердит заявку.{moved}\n\n"
            "Как всё устроено — /guide"
        )
    setup = InlineKeyboardMarkup(inline_keyboard=[[wizard_button()]])
    return text, setup, True


@router.message(GroupSelection.waiting_for_group)
async def process_group_input(message: Message, state: FSMContext) -> None:
    """Вступить в группу или создать её (#146), с подсказкой, что дальше (#158).

    Уже в другой группе — предложить сменить (#162).
    """
    tg_user = message.from_user
    if not tg_user or not message.text:
        await message.answer("Напишите номер группы текстом, например <code>241-327</code>.")
        return

    group_code = message.text.strip()
    if len(group_code) > 16 or group_code.startswith("/"):
        await message.answer(
            "Это не похоже на номер группы. Пример: <code>241-327</code>. Передумали — /cancel"
        )
        return

    try:
        text, markup, done = await _join(tg_user.id, group_code)
    except Exception:
        logger.exception("Failed to join group")
        await message.answer("❌ Не получилось. Попробуйте ещё раз или напишите в поддержку.")
        return
    if done:
        await state.clear()
    await message.answer(text, reply_markup=markup)


@router.callback_query(F.data.startswith("group:switch:"))
async def callback_switch_group(callback: CallbackQuery) -> None:
    """Подтверждение смены группы (#162)."""
    code = (callback.data or "").split(":", 2)[2]
    try:
        text, markup, _ = await _join(callback.from_user.id, code, switch=True)
    except Exception:
        logger.exception("Failed to switch group")
        await callback.answer("Не получилось. Попробуйте ещё раз.", show_alert=True)
        return
    await callback.answer()
    if isinstance(callback.message, Message):
        await callback.message.edit_text(text, reply_markup=markup)


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
