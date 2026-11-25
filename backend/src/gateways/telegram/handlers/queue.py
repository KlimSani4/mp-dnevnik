"""Очередь на сдачу лабораторных в боте (#62).

/queue — очереди группы. Всё остальное — inline-кнопки под карточкой очереди.

callback_data (лимит Telegram — 64 байта, поэтому id в hex без дефисов):
  q:l                    — список очередей группы
  q:v:<queue>            — карточка очереди (и «Обновить»)
  q:p:<queue>:<mask>     — выбор номеров ЛР, mask — битовая маска выбранных
  q:d:<queue>:<mask>     — «Готово»: записаться или поменять ЛР
  q:s:<queue> / q:e:<queue> / q:x:<queue> — пропустить ход / в конец / выйти
  q:w:<queue>            — с кем поменяться (люди впереди)
  q:ws:<entry>           — попросить поменяться с этим человеком
  q:n                    — ведущий: выбрать пару сегодня
  q:nl:<schedule_entry>  — ведущий: выбрать режим
  q:nm:<schedule_entry>:<mode> — ведущий: открыть очередь
  q:st:<queue> / q:cl:<queue> — ведущий: начать сдачу / закрыть
  q:m:<p|f|a>:<entry>    — ведущий: сдал / не сдал / нет на месте
  qs:a:<swap> / qs:d:<swap> — ответ на просьбу поменяться
"""

from __future__ import annotations

import contextlib
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from html import escape

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.group import Group
from src.core.models.queue import LabQueueEntry, QueueMode
from src.core.models.user import User
from src.core.schemas.queue import QueueCreate, QueueDetail
from src.core.services.queue import LabQueueService
from src.gateways.telegram.deps import get_session
from src.shared.exceptions import AppException

logger = logging.getLogger(__name__)
router = Router(name="queue")


class NoAccountError(AppException):
    """У Telegram-аккаунта нет пользователя Nexora."""

    detail = "Сначала войдите в Nexora: /start"


MOSCOW_TZ = timezone(timedelta(hours=3))
MAX_LAB_BUTTON = 12
MAX_LINES = 25

MODE_CODES = {
    "f": QueueMode.FIRST_COME,
    "r": QueueMode.RANDOM,
    "l": QueueMode.LAB_NUMBER,
    "d": QueueMode.DEBTORS,
}
MODE_TITLES = {
    QueueMode.FIRST_COME: "кто раньше записался",
    QueueMode.RANDOM: "случайно при старте",
    QueueMode.LAB_NUMBER: "сначала младшие ЛР",
    QueueMode.DEBTORS: "сначала должники",
}
STATUS_TITLES = {
    "open": "📝 идёт запись",
    "started": "▶️ идёт сдача",
    "closed": "🔒 закрыта",
}

# Сообщения сервиса — на английском для API; в боте показываем по-русски
ERRORS_RU = {
    "Only the group head or assistant can manage the queue": (
        "Управлять очередью может только староста, заместитель или помощник."
    ),
    "Only approved group members can use the queue": (
        "Очередь доступна подтверждённым участникам группы."
    ),
    "Queue not found": "Очередь не найдена.",
    "Queue is closed": "Очередь уже закрыта.",
    "Queue is already closed": "Очередь уже закрыта.",
    "Queue has not started": "Сдача ещё не началась.",
    "Queue has already started or is closed": "Сдача уже идёт или очередь закрыта.",
    "Queue for this lesson is already open": "На эту пару очередь уже открыта.",
    "Lesson not found in this group": "Пара не найдена.",
    "You are already in this queue": "Вы уже в очереди.",
    "You are not in this queue": "Вы не в очереди.",
    "You are already last": "Вы и так последний.",
    "Nobody to let ahead": "Пропускать некого — за вами никого.",
    "This student is not at the desk now": "Этот студент сейчас не сдаёт.",
    "You can only ask someone ahead of you who is still waiting": (
        "Поменяться можно только с тем, кто стоит впереди и ещё ждёт."
    ),
    "You already have a pending swap request": "Вы уже ждёте ответа на другую просьбу.",
    "This request is not addressed to you": "Эта просьба не вам.",
    "Swap request is no longer active": "Просьба уже неактуальна.",
    "Swap request not found": "Просьба не найдена.",
}


def _today() -> datetime:
    return datetime.now(MOSCOW_TZ)


def _err(e: AppException) -> str:
    if isinstance(e, NoAccountError):
        return e.detail
    if e.detail.startswith("At most "):
        return f"За один подход можно сдать не больше {e.detail.split()[2]} ЛР."
    return ERRORS_RU.get(e.detail, "Не получилось. Попробуйте ещё раз.")


def _hex(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(hex=value)
    except ValueError:
        return None


def _kb(rows: list[list[tuple[str, str]]]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=t, callback_data=d) for t, d in row] for row in rows if row
        ]
    )


async def _whoami(session: AsyncSession, tg_id: int) -> tuple[User, Group] | tuple[User, None]:
    """Пользователь бота и его группа. Нет аккаунта — ошибка с подсказкой."""
    from src.core.repositories.group import StudentRepository
    from src.core.repositories.user import UserRepository

    user = await UserRepository(session).get_by_identity("telegram", str(tg_id))
    if not user:
        raise NoAccountError()
    students = await StudentRepository(session).get_user_students(user.id)
    verified = [s for s in students if s.verified] or students
    if not verified:
        return user, None
    group = await session.get(Group, verified[0].group_id)
    return user, group


# ─── Отрисовка ───


def _labs(labs: list[int]) -> str:
    return ", ".join(str(n) for n in labs)


def render_card(q: QueueDetail) -> str:
    when = q.lesson_date.strftime("%d.%m")
    if q.start_time:
        when += f" {q.start_time.strftime('%H:%M')}"
    lines = [
        f"📋 <b>{escape(q.title)}</b> · {when}",
        f"{STATUS_TITLES.get(q.status, q.status)} · порядок: {MODE_TITLES.get(QueueMode(q.mode), q.mode)}",
        f"За подход — до {q.max_labs} ЛР",
        "",
    ]
    if not q.entries:
        lines.append("<i>В очереди пока никого.</i>")
    for e in q.entries[:MAX_LINES]:
        name = "<b>Вы</b>" if e.is_me else escape(e.name)
        tail = f" — ЛР {_labs(e.labs)}"
        if e.status == "current":
            lines.append(f"▶️ Сдаёт: {name}{tail}")
        else:
            lines.append(f"{e.position}. {name}{tail}")
    if len(q.entries) > MAX_LINES:
        lines.append(f"… и ещё {len(q.entries) - MAX_LINES}")

    passed = sum(e.status == "passed" for e in q.finished)
    failed = len(q.finished) - passed
    if q.finished:
        lines += ["", f"✅ Сдали: {passed} · ❌ не сдали: {failed}"]

    me = q.me
    if me and me.status == "current":
        lines += ["", "🔔 <b>Ваша очередь сдавать!</b>"]
    elif me and me.status == "waiting":
        ahead = me.position - 1 + (1 if any(e.status == "current" for e in q.entries) else 0)
        lines += ["", f"Вы {me.position}-й в очереди, впереди {ahead}."]
    for s in q.incoming_swaps:
        lines += ["", f"🔁 {escape(s.from_name)} просит поменяться с вами местами."]
    if q.outgoing_swap:
        lines += ["", f"⏳ Ждём ответа от {escape(q.outgoing_swap.to_name)} на обмен местами."]
    return "\n".join(lines)


def card_keyboard(q: QueueDetail) -> InlineKeyboardMarkup:
    qid = q.id.hex
    rows: list[list[tuple[str, str]]] = []
    active = q.status in ("open", "started")
    me = q.me
    in_line = me is not None and me.status in ("waiting", "current")

    for s in q.incoming_swaps:
        rows.append([("✅ Поменяться", f"qs:a:{s.id.hex}"), ("❌ Нет", f"qs:d:{s.id.hex}")])

    if active and not in_line:
        rows.append([("✋ Записаться", f"q:p:{qid}:0")])
    if active and in_line and me:
        mask = sum(1 << (n - 1) for n in me.labs if n <= MAX_LAB_BUTTON)
        rows.append([("🔢 Мои ЛР", f"q:p:{qid}:{mask:x}"), ("🚪 Выйти", f"q:x:{qid}")])
        rows.append([("⏭ Пропустить ход", f"q:s:{qid}"), ("⤵️ В конец", f"q:e:{qid}")])
        if me.status == "waiting" and me.position > 1 and not q.outgoing_swap:
            rows.append([("🔁 Поменяться местами", f"q:w:{qid}")])

    if q.is_host and active:
        current = next((e for e in q.entries if e.status == "current"), None)
        if current:
            eid = current.id.hex
            rows.append([("✅ Сдал", f"q:m:p:{eid}"), ("❌ Не сдал", f"q:m:f:{eid}")])
            rows.append([("🚶 Нет на месте", f"q:m:a:{eid}")])
        if q.status == "open":
            rows.append([("▶️ Начать сдачу", f"q:st:{qid}"), ("🔒 Закрыть", f"q:cl:{qid}")])
        else:
            rows.append([("🔒 Закрыть очередь", f"q:cl:{qid}")])

    rows.append([("🔄 Обновить", f"q:v:{qid}"), ("📋 Все очереди", "q:l")])
    return _kb(rows)


def labs_keyboard(qid: str, mask: int, max_labs: int, joined: bool) -> InlineKeyboardMarkup:
    buttons = [
        (f"{'✅' if mask >> (n - 1) & 1 else '▫️'} {n}", f"q:p:{qid}:{mask ^ (1 << (n - 1)):x}")
        for n in range(1, MAX_LAB_BUTTON + 1)
    ]
    rows = [buttons[i : i + 4] for i in range(0, len(buttons), 4)]
    chosen = bin(mask).count("1")
    if 0 < chosen <= max_labs:
        rows.append([("💾 Сохранить" if joined else "✋ Встать в очередь", f"q:d:{qid}:{mask:x}")])
    rows.append([("← Назад", f"q:v:{qid}")])
    return _kb(rows)


# ─── Общий раннер ───


Action = Callable[
    [LabQueueService, User, Group | None], Awaitable[tuple[str, InlineKeyboardMarkup]]
]


async def _run(callback: CallbackQuery, action: Action, toast: str | None = None) -> None:
    if not callback.from_user:
        return
    try:
        async with get_session() as session:
            user, group = await _whoami(session, callback.from_user.id)
            text, markup = await action(LabQueueService(session), user, group)
    except AppException as e:
        await callback.answer(_err(e), show_alert=True)
        return
    except Exception:
        logger.exception("Queue callback failed", extra={"data": callback.data})
        await callback.answer("Что-то пошло не так. Попробуйте ещё раз.", show_alert=True)
        return

    await callback.answer(toast or "")
    if isinstance(callback.message, Message):
        # «message is not modified» на «Обновить» без изменений — не ошибка
        with contextlib.suppress(TelegramBadRequest):
            await callback.message.edit_text(text, reply_markup=markup)


def _card(q: QueueDetail) -> tuple[str, InlineKeyboardMarkup]:
    return render_card(q), card_keyboard(q)


async def _list(
    svc: LabQueueService, user: User, group: Group | None
) -> tuple[str, InlineKeyboardMarkup]:
    if group is None:
        return (
            "У вас пока нет группы. Укажите её в /settings или на сайте.",
            _kb([]),
        )
    queues = await svc.list_for_group(group.code, user)
    is_host = await svc.is_host(group.id, user)
    lines = [f"📋 <b>Очереди группы {escape(group.code)}</b>", ""]
    rows: list[list[tuple[str, str]]] = []
    if not queues:
        lines.append("Сейчас открытых очередей нет.")
    for q in queues:
        mark = STATUS_TITLES.get(q.status, q.status).split()[0]
        mine = f" · вы {q.my_position}-й" if q.my_position else ""
        when = q.start_time.strftime("%H:%M") if q.start_time else q.lesson_date.strftime("%d.%m")
        label = f"{mark} {q.title[:28]} {when} ({q.waiting}){mine}"
        rows.append([(label, f"q:v:{q.id.hex}")])
    if is_host:
        rows.append([("➕ Открыть очередь", "q:n")])
    rows.append([("🔄 Обновить", "q:l")])
    return "\n".join(lines), _kb(rows)


# ─── Команда ───


@router.message(Command("queue"))
async def cmd_queue(message: Message) -> None:
    """/queue — очереди на сдачу лабораторных."""
    if not message.from_user:
        return
    try:
        async with get_session() as session:
            user, group = await _whoami(session, message.from_user.id)
            text, markup = await _list(LabQueueService(session), user, group)
    except AppException as e:
        await message.answer(_err(e))
        return
    await message.answer(text, reply_markup=markup)


# ─── Колбэки ───


@router.callback_query(F.data == "q:l")
async def cb_list(callback: CallbackQuery) -> None:
    await _run(callback, _list)


@router.callback_query(F.data.startswith("q:v:"))
async def cb_view(callback: CallbackQuery) -> None:
    qid = _hex((callback.data or "").split(":")[2])
    if not qid:
        return

    async def act(
        svc: LabQueueService, user: User, _g: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        return _card(await svc.detail(qid, user))

    await _run(callback, act)


@router.callback_query(F.data.startswith("q:p:"))
async def cb_pick_labs(callback: CallbackQuery) -> None:
    _, _, raw_qid, raw_mask = (callback.data or "").split(":")
    qid = _hex(raw_qid)
    if not qid:
        return
    mask = int(raw_mask, 16) & ((1 << MAX_LAB_BUTTON) - 1)

    async def act(
        svc: LabQueueService, user: User, _g: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        q = await svc.detail(qid, user)
        joined = q.me is not None and q.me.status in ("waiting", "current")
        chosen = [n for n in range(1, MAX_LAB_BUTTON + 1) if mask >> (n - 1) & 1]
        text = (
            f"📋 <b>{escape(q.title)}</b>\n\n"
            f"Какие ЛР сдаёте? Можно до {q.max_labs} за раз.\n"
            f"Выбрано: {_labs(chosen) if chosen else '—'}"
        )
        if len(chosen) > q.max_labs:
            text += f"\n\n⚠️ Слишком много — оставьте не больше {q.max_labs}."
        return text, labs_keyboard(qid.hex, mask, q.max_labs, joined)

    await _run(callback, act)


@router.callback_query(F.data.startswith("q:d:"))
async def cb_done_labs(callback: CallbackQuery) -> None:
    _, _, raw_qid, raw_mask = (callback.data or "").split(":")
    qid = _hex(raw_qid)
    if not qid:
        return
    mask = int(raw_mask, 16)
    labs = [n for n in range(1, MAX_LAB_BUTTON + 1) if mask >> (n - 1) & 1]

    async def act(
        svc: LabQueueService, user: User, _g: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        q = await svc.detail(qid, user)
        if q.me is not None and q.me.status in ("waiting", "current"):
            return _card(await svc.update_labs(qid, labs, user))
        return _card(await svc.join(qid, labs, user))

    await _run(callback, act, "Готово")


def _simple(prefix: str, method: str, toast: str) -> None:
    async def handler(callback: CallbackQuery) -> None:
        qid = _hex((callback.data or "").split(":")[2])
        if not qid:
            return

        async def act(
            svc: LabQueueService, user: User, _g: Group | None
        ) -> tuple[str, InlineKeyboardMarkup]:
            fn = {
                "skip": lambda: svc.skip(qid, False, user),
                "to_end": lambda: svc.skip(qid, True, user),
                "leave": lambda: svc.leave(qid, user),
                "start": lambda: svc.start(qid, user),
                "close": lambda: svc.close(qid, user),
            }[method]
            return _card(await fn())

        await _run(callback, act, toast)

    handler.__name__ = f"cb_{method}"
    router.callback_query(F.data.startswith(prefix))(handler)


_simple("q:s:", "skip", "Пропустили одного вперёд")
_simple("q:e:", "to_end", "Вы в конце очереди")
_simple("q:x:", "leave", "Вы вышли из очереди")
_simple("q:st:", "start", "Сдача началась")
_simple("q:cl:", "close", "Очередь закрыта")


@router.callback_query(F.data.startswith("q:w:"))
async def cb_swap_targets(callback: CallbackQuery) -> None:
    qid = _hex((callback.data or "").split(":")[2])
    if not qid:
        return

    async def act(
        svc: LabQueueService, user: User, _g: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        q = await svc.detail(qid, user)
        me = q.me
        ahead = [
            e
            for e in q.entries
            if e.status == "waiting" and me is not None and e.position < me.position
        ]
        rows = [[(f"{e.position}. {e.name[:40]}", f"q:ws:{e.id.hex}")] for e in ahead[-15:]]
        rows.append([("← Назад", f"q:v:{qid.hex}")])
        text = (
            "С кем поменяться? Человеку придёт просьба — он может согласиться или отказаться."
            if ahead
            else "Впереди нет никого, с кем можно поменяться."
        )
        return text, _kb(rows)

    await _run(callback, act)


async def _queue_of_entry(session: AsyncSession, raw: str) -> tuple[uuid.UUID, uuid.UUID]:
    from src.shared.exceptions import NotFoundError

    entry_id = _hex(raw)
    entry = await session.get(LabQueueEntry, entry_id) if entry_id else None
    if not entry or not entry_id:
        raise NotFoundError("Queue not found")
    return entry.queue_id, entry_id


@router.callback_query(F.data.startswith("q:ws:"))
async def cb_swap_request(callback: CallbackQuery) -> None:
    raw = (callback.data or "").split(":")[2]

    async def act(
        svc: LabQueueService, user: User, _g: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        qid, target = await _queue_of_entry(svc.session, raw)
        return _card(await svc.request_swap(qid, target, user))

    await _run(callback, act, "Просьба отправлена")


@router.callback_query(F.data.startswith("q:m:"))
async def cb_mark(callback: CallbackQuery) -> None:
    _, _, code, raw = (callback.data or "").split(":")
    result = {"p": "passed", "f": "failed", "a": "absent"}.get(code)
    if not result:
        return

    async def act(
        svc: LabQueueService, user: User, _g: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        qid, entry_id = await _queue_of_entry(svc.session, raw)
        return _card(await svc.mark(qid, entry_id, result, user))

    await _run(
        callback,
        act,
        {"passed": "Сдал ✅", "failed": "Не сдал", "absent": "В конец очереди"}[result],
    )


@router.callback_query(F.data.startswith("qs:"))
async def cb_swap_respond(callback: CallbackQuery) -> None:
    _, code, raw = (callback.data or "").split(":")
    swap_id = _hex(raw)
    if not swap_id or code not in ("a", "d"):
        return

    async def act(
        svc: LabQueueService, user: User, _g: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        return _card(await svc.respond_swap(swap_id, code == "a", user))

    await _run(callback, act, "Поменялись местами" if code == "a" else "Отказались")


# ─── Открыть очередь (ведущий) ───


@router.callback_query(F.data == "q:n")
async def cb_new_lessons(callback: CallbackQuery) -> None:
    async def act(
        svc: LabQueueService, user: User, group: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        if group is None:
            return "У вас нет группы.", _kb([])
        lessons = await svc.lessons_for_day(group.code, _today().date(), user)
        rows = [
            [
                (
                    f"{'✅ ' if o.queue_id else ''}{o.start_time.strftime('%H:%M')} "
                    f"{o.title[:30]}{' · ' + o.lesson_type[:12] if o.lesson_type else ''}",
                    f"q:v:{o.queue_id.hex}" if o.queue_id else f"q:nl:{o.entry_id.hex}",
                )
            ]
            for o in lessons
        ]
        rows.append([("← Назад", "q:l")])
        text = (
            "На какую пару открыть очередь? ✅ — очередь уже есть."
            if lessons
            else "Сегодня пар нет — открыть очередь не на что."
        )
        return text, _kb(rows)

    await _run(callback, act)


@router.callback_query(F.data.startswith("q:nl:"))
async def cb_new_mode(callback: CallbackQuery) -> None:
    raw = (callback.data or "").split(":")[2]
    if not _hex(raw):
        return

    async def act(
        svc: LabQueueService, user: User, group: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        if group is None:
            return "У вас нет группы.", _kb([])
        await svc.require_host(group.id, user)
        rows = [
            [(title.capitalize(), f"q:nm:{raw}:{code}")]
            for code, title in ((c, MODE_TITLES[m]) for c, m in MODE_CODES.items())
        ]
        rows.append([("← Назад", "q:n")])
        text = (
            "Как выстроить очередь?\n\n"
            "• <b>Кто раньше записался</b> — живая очередь.\n"
            "• <b>Случайно при старте</b> — все, кто успел записаться, перемешиваются, "
            "когда вы нажмёте «Начать сдачу».\n"
            "• <b>Сначала младшие ЛР</b> — вперёд те, кто сдаёт ЛР с меньшим номером.\n"
            "• <b>Сначала должники</b> — вперёд те, у кого по предмету сдано меньше.\n\n"
            "Опоздавшие могут попросить поменяться местами — с согласия того, кто впереди."
        )
        return text, _kb(rows)

    await _run(callback, act)


@router.callback_query(F.data.startswith("q:nm:"))
async def cb_new_open(callback: CallbackQuery) -> None:
    _, _, raw, code = (callback.data or "").split(":")
    entry_id = _hex(raw)
    mode = MODE_CODES.get(code)
    if not entry_id or not mode:
        return

    async def act(
        svc: LabQueueService, user: User, group: Group | None
    ) -> tuple[str, InlineKeyboardMarkup]:
        if group is None:
            return "У вас нет группы.", _kb([])
        data = QueueCreate(
            group_code=group.code, entry_id=entry_id, lesson_date=_today().date(), mode=mode
        )
        return _card(await svc.open(data, user))

    await _run(callback, act, "Очередь открыта")
