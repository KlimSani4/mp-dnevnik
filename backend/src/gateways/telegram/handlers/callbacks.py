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
    tg_id: int, group_code: str, *, switch: bool = False
) -> tuple[str, InlineKeyboardMarkup | None, bool]:
    """Вступить/создать/сменить группу. (текст, кнопки, сбросить ли ожидание ввода)."""
    from src.core.models.group import Group
    from src.shared.exceptions import ConflictError, ExternalServiceError, NotFoundError

    try:
        async with get_session() as session:
            student = await GroupService(session).join_group_by_telegram(
                telegram_id=str(tg_id), group_code=group_code, switch=switch
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
    return text, None, True


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
