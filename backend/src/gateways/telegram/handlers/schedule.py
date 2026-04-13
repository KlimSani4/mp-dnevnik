"""Schedule command handlers."""

import re
from datetime import date, datetime, timezone, timedelta
from typing import Any

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

router = Router(name="schedule")

MOSCOW_TZ = timezone(timedelta(hours=3))

WEEKDAY_NAMES = {
    1: "Понедельник", 2: "Вторник", 3: "Среда",
    4: "Четверг", 5: "Пятница", 6: "Суббота", 7: "Воскресенье",
}


def today_moscow() -> date:
    return datetime.now(MOSCOW_TZ).date()


def extract_link(raw_data: Any) -> str | None:
    """Extract online class link from raw rasp.dmami.ru data."""
    if not isinstance(raw_data, dict):
        return None
    auditories = raw_data.get("auditories", [])
    for aud in auditories:
        title = aud.get("title", "")
        match = re.search(r'href="([^"]+)"', title)
        if match:
            return match.group(1)
    return None


def format_entry_full(entry: dict[str, Any]) -> str:
    """Format one schedule entry — rich format with link."""
    subject = entry.get("subject") or {}
    name = subject.get("name", "—") if isinstance(subject, dict) else str(subject)
    lesson_type = entry.get("lesson_type") or ""
    start = str(entry.get("start_time", ""))[:5]
    end = str(entry.get("end_time", ""))[:5]
    teacher = entry.get("teacher") or ""
    location = entry.get("location") or ""
    room = entry.get("room") or ""
    raw = entry.get("raw_data")
    link = extract_link(raw)

    lines = [f"🕑 <b>{start}–{end}</b>"]
    lines.append(f"📖 {name}" + (f" ({lesson_type})" if lesson_type else ""))
    if teacher:
        lines.append(f"👨‍🏫 Преподаватель: {teacher}")
    if room and location:
        lines.append(f"🏫 Аудитория: {room} ({location})")
    elif location:
        lines.append(f"📍 {location}")
    if link:
        lines.append(f"💻 Онлайн: {link}")

    return "\n".join(lines)


def format_day_full(target_date: date, entries: list[dict[str, Any]], group_code: str) -> str:
    """Format full day schedule — matches competitor style."""
    date_str = target_date.strftime("%d.%m.%Y")
    weekday_name = WEEKDAY_NAMES.get(target_date.isoweekday(), "")
    header = f"📅 <b>{date_str} ({weekday_name})</b>\nГруппа: {group_code}\n"

    if not entries:
        return header + "\nПар нет! 🎉"

    blocks = [format_entry_full(e) for e in entries]
    return header + "\n" + "\n\n".join(blocks)


def schedule_keyboard(target_date: date) -> InlineKeyboardMarkup:
    """Build navigation keyboard for schedule."""
    today = today_moscow()
    prev_date = target_date - timedelta(days=1)
    next_date = target_date + timedelta(days=1)

    prev_label = WEEKDAY_NAMES.get(prev_date.isoweekday(), "")[:2] + f" {prev_date.strftime('%d.%m')}"
    next_label = WEEKDAY_NAMES.get(next_date.isoweekday(), "")[:2] + f" {next_date.strftime('%d.%m')}"

    row1 = [
        InlineKeyboardButton(text=f"◀ {prev_label}", callback_data=f"sched:{prev_date.isoformat()}"),
        InlineKeyboardButton(text=f"{next_label} ▶", callback_data=f"sched:{next_date.isoformat()}"),
    ]

    row2 = []
    if target_date != today:
        row2.append(InlineKeyboardButton(text="📅 Сегодня", callback_data=f"sched:{today.isoformat()}"))

    tomorrow = today + timedelta(days=1)
    if target_date != tomorrow:
        row2.append(InlineKeyboardButton(text="➡️ Завтра", callback_data=f"sched:{tomorrow.isoformat()}"))

    rows = [row1]
    if row2:
        rows.append(row2)

    return InlineKeyboardMarkup(inline_keyboard=rows)


async def _get_user_group(session: Any, tg_id: str) -> tuple[Any, Any] | tuple[None, None]:
    """Return (identity, group) or (None, None)."""
    from src.core.repositories.group import StudentRepository
    from src.core.repositories.user import IdentityRepository

    identity_repo = IdentityRepository(session)
    identity = await identity_repo.get_by_external("telegram", tg_id)
    if not identity:
        return None, None

    student_repo = StudentRepository(session)
    students = await student_repo.get_user_students(identity.user_id)
    if not students:
        return identity, None

    return identity, students[0].group


async def _render_schedule(
    session: Any,
    identity: Any,
    group: Any,
    target_date: date,
) -> tuple[str, InlineKeyboardMarkup]:
    """Fetch and format schedule for given date. Returns (text, keyboard)."""
    from src.core.services.schedule import ScheduleService

    try:
        schedule_service = ScheduleService(session)
        day = await schedule_service.get_day_schedule(group.code, target_date, user_id=identity.user_id)
        entries = [e.model_dump() for e in day.entries] if day.entries else []
        text = format_day_full(target_date, entries, group.code)
    except Exception as exc:
        text = (
            f"📅 <b>Расписание для {group.code}</b>\n\n"
            f"Не удалось загрузить расписание. Попробуй позже.\n"
            f"<code>{exc}</code>"
        )

    return text, schedule_keyboard(target_date)


@router.message(Command("schedule"))
async def cmd_schedule(message: Message) -> None:
    """Handle /schedule — today's schedule."""
    from src.gateways.telegram.deps import get_session

    tg_user = message.from_user
    if not tg_user:
        return

    async with get_session() as session:
        identity, group = await _get_user_group(session, str(tg_user.id))

        if not identity:
            await message.answer("📅 <b>Расписание</b>\n\nСначала зарегистрируйся: /start", parse_mode="HTML")
            return
        if not group:
            await message.answer("📅 <b>Расписание</b>\n\nУкажи группу в /settings.", parse_mode="HTML")
            return

        text, keyboard = await _render_schedule(session, identity, group, today_moscow())

    await message.answer(text, parse_mode="HTML", disable_web_page_preview=True, reply_markup=keyboard)


@router.callback_query(F.data.startswith("sched:"))
async def cb_schedule(callback: CallbackQuery) -> None:
    """Handle schedule day navigation."""
    from src.gateways.telegram.deps import get_session

    tg_user = callback.from_user
    if not tg_user or not callback.message:
        await callback.answer()
        return

    date_str = callback.data.split(":", 1)[1]  # type: ignore[union-attr]
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        await callback.answer("Неверная дата")
        return

    async with get_session() as session:
        identity, group = await _get_user_group(session, str(tg_user.id))

        if not identity or not group:
            await callback.answer("Сначала зарегистрируйся: /start")
            return

        text, keyboard = await _render_schedule(session, identity, group, target_date)

    await callback.message.edit_text(  # type: ignore[union-attr]
        text,
        parse_mode="HTML",
        disable_web_page_preview=True,
        reply_markup=keyboard,
    )
    await callback.answer()


def format_deadline(assignment: Any) -> str:
    subject_name = assignment.subject.name if assignment.subject else "Неизвестно"
    deadline_str = assignment.deadline.strftime("%d.%m %H:%M") if assignment.deadline else "—"
    priority_icons = {"urgent": "🔴", "high": "🟠", "normal": "🟡", "low": "🟢"}
    icon = priority_icons.get(getattr(assignment, "priority", "normal"), "📌")

    lines = [f"{icon} <b>{assignment.title}</b>"]
    lines.append(f"   📚 {subject_name}  ⏰ {deadline_str}")
    if assignment.description:
        desc = assignment.description[:120]
        if len(assignment.description) > 120:
            desc += "…"
        lines.append(f"   {desc}")
    return "\n".join(lines)


@router.message(Command("deadlines"))
async def cmd_deadlines(message: Message) -> None:
    """Handle /deadlines — upcoming deadlines."""
    from src.core.repositories.assignment import AssignmentRepository
    from src.gateways.telegram.deps import get_session

    tg_user = message.from_user
    if not tg_user:
        return

    async with get_session() as session:
        identity, group = await _get_user_group(session, str(tg_user.id))

        if not identity:
            await message.answer("⏰ <b>Дедлайны</b>\n\nСначала зарегистрируйся: /start", parse_mode="HTML")
            return
        if not group:
            await message.answer("⏰ <b>Дедлайны</b>\n\nУкажи группу в /settings.", parse_mode="HTML")
            return

        assignment_repo = AssignmentRepository(session)
        deadlines = await assignment_repo.get_upcoming_deadlines(group.id, days=14, limit=10)

        if not deadlines:
            await message.answer(
                f"⏰ <b>Дедлайны для {group.code}</b>\n\n"
                "Ближайших дедлайнов нет! 🎉\n\n"
                "Добавить можно через <a href='https://nexora.digitaldrugs.tech'>Nexora</a>.",
                parse_mode="HTML",
            )
            return

        formatted = [format_deadline(d) for d in deadlines]
        text = f"⏰ <b>Дедлайны для {group.code}</b>\n\n" + "\n\n".join(formatted)

    await message.answer(text, parse_mode="HTML")
