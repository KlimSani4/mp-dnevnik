"""Уведомления в боте (#32): мастер настройки, экран /notify и кнопки под уведомлениями.

Мастер — одно сообщение, которое меняется на месте: что присылать → время сводки →
за сколько минут до пары → тихие часы. На каждом шаге можно выйти: уже выбранное сохранено.
"""

from __future__ import annotations

import logging
import uuid

from aiogram import F, Router
from aiogram.enums import ButtonStyle
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.filters.callback_data import CallbackData
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from src.core.models.notification import NotificationType as T
from src.core.services import class_reminder as cr
from src.core.services import notify_prefs as np
from src.gateways.telegram.deps import get_session

logger = logging.getLogger(__name__)
router = Router(name="notify")


class WizCb(CallbackData, prefix="wiz"):
    step: str
    value: str


class SetCb(CallbackData, prefix="ns"):
    key: str
    value: str


class MuteCb(CallbackData, prefix="mute"):
    type: str


class DoneCb(CallbackData, prefix="done"):
    assignment: str  # uuid.hex: 32 символа, с запасом до лимита callback_data в 64 байта


# ─── Данные ───


class Prefs:
    """Срез настроек одного пользователя."""

    def __init__(self, saved: dict[T, bool], settings: dict[str, object]) -> None:
        self.saved = saved
        self.settings = settings

    def on(self, ntype: T) -> bool:
        return np.is_enabled(self.saved, ntype)

    @property
    def digest_time(self) -> str:
        return np.digest_time(self.settings)

    @property
    def quiet(self) -> str:
        return np.quiet(self.settings)

    @property
    def minutes(self) -> int:
        return cr.reminder_minutes(self.settings)


async def load_prefs(tg_id: int) -> Prefs | None:
    from src.core.repositories.notification import NotificationPreferenceRepository
    from src.core.repositories.user import UserRepository

    async with get_session() as session:
        user = await UserRepository(session).get_by_identity("telegram", str(tg_id))
        if not user:
            return None
        rows = await NotificationPreferenceRepository(session).get_user_preferences(user.id)
        return Prefs({p.type: p.enabled for p in rows}, dict(user.settings or {}))


async def save_prefs(
    tg_id: int,
    toggles: dict[T, bool] | None = None,
    *,
    minutes: int | None = None,
    **notify: object,
) -> bool:
    """Сохранить переключатели и users.settings. False — пользователь не найден."""
    from src.core.repositories.notification import NotificationPreferenceRepository
    from src.core.repositories.user import UserRepository

    async with get_session() as session:
        user = await UserRepository(session).get_by_identity("telegram", str(tg_id))
        if not user:
            return False
        repo = NotificationPreferenceRepository(session)
        for ntype, enabled in (toggles or {}).items():
            await repo.upsert_preference(user.id, ntype, enabled)
        settings = dict(user.settings or {})
        if minutes in cr.MINUTES_CHOICES:
            settings[cr.SETTINGS_KEY] = minutes
        if notify:
            settings = np.with_notify(settings, **notify)
        user.settings = settings
        await session.commit()
        return True


# ─── Мастер ───


def wizard_button(text: str = "🪄 Настроить уведомления — 3 нажатия") -> InlineKeyboardButton:
    return InlineKeyboardButton(
        text=text, style=ButtonStyle.PRIMARY, callback_data=WizCb(step="start", value="-").pack()
    )


def _wiz(step: str, value: str) -> str:
    return WizCb(step=step, value=value).pack()


def wizard_mode() -> tuple[str, InlineKeyboardMarkup]:
    text = (
        "🔔 <b>Что мне присылать?</b>\n\n"
        "🤫 <b>Только важное</b> — пишу, когда нужно что-то сделать: дедлайн по заданию, "
        "которое вы ещё не сдали. Расписание — по запросу: /schedule\n\n"
        "📋 <b>Важное + сводка</b> — плюс одно сообщение в день: пары и дедлайны.\n\n"
        "📣 <b>Всё</b> — плюс напоминание перед каждой парой: аудитория или ссылка.\n\n"
        "<i>Поменять можно когда угодно: /notify</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🤫 Только важное",
                    style=ButtonStyle.PRIMARY,
                    callback_data=_wiz("mode", "quiet"),
                )
            ],
            [InlineKeyboardButton(text="📋 Важное + сводка", callback_data=_wiz("mode", "digest"))],
            [InlineKeyboardButton(text="📣 Всё", callback_data=_wiz("mode", "all"))],
        ]
    )
    return text, kb


def wizard_time() -> tuple[str, InlineKeyboardMarkup]:
    text = "📋 <b>Когда присылать сводку?</b>\n\nУтром — пары на сегодня, вечером — на завтра."
    labels = {"0730": "☀️ 07:30", "2000": "🌙 20:00", "2100": "🌙 21:00"}
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=labels[t], callback_data=_wiz("time", t))
                for t in np.DIGEST_TIMES
            ]
        ]
    )
    return text, kb


def wizard_remind() -> tuple[str, InlineKeyboardMarkup]:
    text = "📍 <b>За сколько минут до пары напоминать?</b>"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text=f"За {m} минут", callback_data=_wiz("remind", str(m)))
                for m in cr.MINUTES_CHOICES
            ]
        ]
    )
    return text, kb


def wizard_quiet() -> tuple[str, InlineKeyboardMarkup]:
    text = "🌙 <b>Тихие часы</b>\n\nВ это время не пишу ничего, даже про дедлайны."
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="23:00–8:00",
                    style=ButtonStyle.PRIMARY,
                    callback_data=_wiz("quiet", "23-8"),
                ),
                InlineKeyboardButton(text="0:00–9:00", callback_data=_wiz("quiet", "0-9")),
            ],
            [InlineKeyboardButton(text="Не нужно", callback_data=_wiz("quiet", "off"))],
        ]
    )
    return text, kb


def summary(p: Prefs) -> str:
    lines = []
    if p.on(T.DEADLINE):
        lines.append("⏰ Дедлайны — за сутки и за 3 часа, только по несданным")
    if p.on(T.DIGEST):
        day = "на сегодня" if p.digest_time in np.MORNING_TIMES else "на завтра"
        lines.append(f"📋 Сводка в {np.format_digest_time(p.digest_time)} — пары {day}")
    if p.on(T.CLASS_REMINDER):
        lines.append(f"📍 Перед парой — за {p.minutes} минут")
    if not lines:
        lines.append("🔕 Ничего не присылаю")
    lines.append(f"🌙 Тихие часы — {np.format_quiet(p.quiet)}")
    return "\n".join(lines)


def wizard_done(p: Prefs) -> tuple[str, InlineKeyboardMarkup]:
    text = f"✅ <b>Готово</b>\n\n{summary(p)}\n\nПод каждым уведомлением есть кнопка, чтобы выключить такие."
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="⚙️ Тонкая настройка", callback_data=_set("open", "-"))]
        ]
    )
    return text, kb


@router.callback_query(WizCb.filter())
async def on_wizard(callback: CallbackQuery, callback_data: WizCb) -> None:
    tg_id = callback.from_user.id
    step, value = callback_data.step, callback_data.value
    view: tuple[str, InlineKeyboardMarkup]

    if step == "start":
        if await load_prefs(tg_id) is None:
            await callback.answer("Сначала войдите через /start", show_alert=True)
            return
        view = wizard_mode()
    elif step == "mode" and value in np.PRESETS:
        await save_prefs(tg_id, np.PRESETS[value])
        view = wizard_quiet() if value == "quiet" else wizard_time()
    elif step == "time" and value in np.DIGEST_TIMES:
        await save_prefs(tg_id, digest_time=value)
        p = await load_prefs(tg_id)
        view = wizard_remind() if p and p.on(T.CLASS_REMINDER) else wizard_quiet()
    elif step == "remind" and value.isdigit():
        await save_prefs(tg_id, minutes=int(value))
        view = wizard_quiet()
    elif step == "quiet" and value in np.QUIET_CHOICES:
        await save_prefs(tg_id, quiet=value, setup=True)
        p = await load_prefs(tg_id)
        if p is None:
            await callback.answer()
            return
        view = wizard_done(p)
    else:
        await callback.answer()
        return

    await callback.answer()
    await _show(callback, *view)


# ─── Экран /notify ───


def _set(key: str, value: str) -> str:
    return SetCb(key=key, value=value).pack()


def _onoff(on: bool) -> str:
    return "вкл" if on else "выкл"


def settings_view(p: Prefs) -> tuple[str, InlineKeyboardMarkup]:
    text = (
        "🔔 <b>Уведомления</b>\n\n"
        f"{summary(p)}\n\n"
        "<i>Расписание в любой момент: /schedule. Дедлайны: /deadlines</i>"
    )
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text=f"⏰ Дедлайны: {_onoff(p.on(T.DEADLINE))}",
                callback_data=_set("deadline", str(int(not p.on(T.DEADLINE)))),
            )
        ],
        [
            InlineKeyboardButton(
                text=f"📋 Сводка раз в день: {_onoff(p.on(T.DIGEST))}",
                callback_data=_set("digest", str(int(not p.on(T.DIGEST)))),
            )
        ],
    ]
    if p.on(T.DIGEST):
        rows.append(
            [
                InlineKeyboardButton(
                    text=("✓ " if t == p.digest_time else "") + np.format_digest_time(t),
                    callback_data=_set("time", t),
                )
                for t in np.DIGEST_TIMES
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(
                text=f"📍 Перед парой: {_onoff(p.on(T.CLASS_REMINDER))}",
                callback_data=_set("remind", str(int(not p.on(T.CLASS_REMINDER)))),
            )
        ]
    )
    if p.on(T.CLASS_REMINDER):
        rows.append(
            [
                InlineKeyboardButton(
                    text=("✓ " if m == p.minutes else "") + f"за {m} мин",
                    callback_data=_set("minutes", str(m)),
                )
                for m in cr.MINUTES_CHOICES
            ]
        )
    nxt = np.QUIET_CHOICES[(np.QUIET_CHOICES.index(p.quiet) + 1) % len(np.QUIET_CHOICES)]
    rows += [
        [
            InlineKeyboardButton(
                text=f"🌙 Тихие часы: {np.format_quiet(p.quiet)}", callback_data=_set("quiet", nxt)
            )
        ],
        [wizard_button("🪄 Пройти мастер заново")],
        [InlineKeyboardButton(text="← Настройки", callback_data="settings:menu")],
    ]
    return text, InlineKeyboardMarkup(inline_keyboard=rows)


_TOGGLES = {"deadline": T.DEADLINE, "digest": T.DIGEST, "remind": T.CLASS_REMINDER}


@router.callback_query(SetCb.filter())
async def on_setting(callback: CallbackQuery, callback_data: SetCb) -> None:
    tg_id = callback.from_user.id
    key, value = callback_data.key, callback_data.value
    ok = True
    if key in _TOGGLES and value in ("0", "1"):
        ok = await save_prefs(tg_id, {_TOGGLES[key]: value == "1"})
    elif key == "time" and value in np.DIGEST_TIMES:
        ok = await save_prefs(tg_id, digest_time=value)
    elif key == "minutes" and value.isdigit():
        ok = await save_prefs(tg_id, minutes=int(value))
    elif key == "quiet" and value in np.QUIET_CHOICES:
        ok = await save_prefs(tg_id, quiet=value)
    elif key != "open":
        await callback.answer()
        return

    p = await load_prefs(tg_id) if ok else None
    if p is None:
        await callback.answer("Сначала войдите через /start", show_alert=True)
        return
    await callback.answer("Сохранено" if key != "open" else None)
    await _show(callback, *settings_view(p))


async def _open_settings(callback: CallbackQuery) -> None:
    p = await load_prefs(callback.from_user.id)
    if p is None:
        await callback.answer("Сначала войдите через /start", show_alert=True)
        return
    await callback.answer()
    await _show(callback, *settings_view(p))


# Старые кнопки «reminder:*» в уже отправленных сообщениях ведут на новый экран.
@router.callback_query(F.data == "settings:notifications")
@router.callback_query(F.data.startswith("reminder:"))
async def on_open_settings(callback: CallbackQuery) -> None:
    await _open_settings(callback)


@router.message(Command("notify"))
async def cmd_notify(message: Message) -> None:
    if not message.from_user:
        return
    p = await load_prefs(message.from_user.id)
    if p is None:
        await message.answer("Сначала войдите в Nexora: /start")
        return
    text, kb = settings_view(p) if np.is_setup_done(p.settings) else wizard_mode()
    await message.answer(text, reply_markup=kb)


# ─── Кнопки под уведомлениями ───


_MUTED = {
    T.DEADLINE.value: "Больше не напомню о дедлайнах.",
    T.DIGEST.value: "Сводку больше не присылаю.",
    T.CLASS_REMINDER.value: "Перед парами больше не напоминаю.",
}


@router.callback_query(MuteCb.filter())
async def on_mute(callback: CallbackQuery, callback_data: MuteCb) -> None:
    try:
        ntype = T(callback_data.type)
    except ValueError:
        await callback.answer()
        return
    if not await save_prefs(callback.from_user.id, {ntype: False}):
        await callback.answer("Сначала войдите через /start", show_alert=True)
        return
    await callback.answer(
        f"{_MUTED.get(ntype.value, 'Выключил.')} Вернуть — /notify", show_alert=True
    )
    if isinstance(callback.message, Message):
        await callback.message.edit_reply_markup(reply_markup=None)


@router.callback_query(DoneCb.filter())
async def on_done(callback: CallbackQuery, callback_data: DoneCb) -> None:
    from sqlalchemy import select

    from src.core.models.assignment import TaskState, TaskStatus
    from src.core.models.group import Student
    from src.core.repositories.user import UserRepository
    from src.core.services.assignment import AssignmentService
    from src.shared.exceptions import AppException

    try:
        assignment_id = uuid.UUID(hex=callback_data.assignment)
    except ValueError:
        await callback.answer()
        return
    try:
        async with get_session() as session:
            user = await UserRepository(session).get_by_identity(
                "telegram", str(callback.from_user.id)
            )
            if not user:
                await callback.answer("Сначала войдите через /start", show_alert=True)
                return
            # «Сдал» = на проверке; «Зачтено» ставят на сайте, его не трогаем
            current = await session.scalar(
                select(TaskStatus.state)
                .join(Student, Student.id == TaskStatus.student_id)
                .where(Student.user_id == user.id, TaskStatus.assignment_id == assignment_id)
            )
            if current != TaskState.DONE:
                await AssignmentService(session).update_task_status(
                    user.id, assignment_id, TaskState.REVIEW
                )
    except AppException:
        await callback.answer("Задание не найдено или вы уже не в группе", show_alert=True)
        return
    await callback.answer("Отметил: на проверке. Больше не напомню.")
    if isinstance(callback.message, Message) and callback.message.html_text:
        await callback.message.edit_text(
            f"{callback.message.html_text}\n\n✅ <b>Сдано</b>", reply_markup=None
        )


async def _show(callback: CallbackQuery, text: str, markup: InlineKeyboardMarkup) -> None:
    """Обновить сообщение на месте; если его уже нельзя править — прислать новое."""
    msg = callback.message
    if isinstance(msg, Message):
        try:
            await msg.edit_text(text, reply_markup=markup)
            return
        except TelegramBadRequest as e:
            if "not modified" in str(e):
                return
            logger.debug("edit_text failed, sending new message", exc_info=True)
    await callback.bot.send_message(callback.from_user.id, text, reply_markup=markup)  # type: ignore[union-attr]
