"""Schedule command handlers."""

from datetime import date
from typing import Any

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

router = Router(name="schedule")


def format_schedule_entry(entry: dict[str, Any]) -> str:
    """Format single schedule entry for display."""
    subject = entry.get("subject", {})
    subject_name = subject.get("name", "Неизвестно") if isinstance(subject, dict) else str(subject)

    time_str = f"{entry.get('start_time', '?')}-{entry.get('end_time', '?')}"
    location = entry.get("location") or entry.get("room") or ""
    teacher = entry.get("teacher") or ""

    lines = [f"<b>{entry.get('pair_number', '?')}.</b> {subject_name}"]
    lines.append(f"   🕐 {time_str}")

    if location:
        lines.append(f"   📍 {location}")
    if teacher:
        lines.append(f"   👤 {teacher}")

    return "\n".join(lines)


def format_day_schedule(schedule: dict[str, Any]) -> str:
    """Format full day schedule."""
    weekday_names = {
        1: "Понедельник",
        2: "Вторник",
        3: "Среда",
        4: "Четверг",
        5: "Пятница",
        6: "Суббота",
    }

    weekday = schedule.get("weekday", 1)
    target_date = schedule.get("schedule_date", date.today().isoformat())
    entries = schedule.get("entries", [])

    header = f"📅 <b>{weekday_names.get(weekday, 'День')} {target_date}</b>\n"

    if not entries:
        return header + "\nПар нет! 🎉"

    formatted_entries = [format_schedule_entry(e) for e in entries]
    return header + "\n" + "\n\n".join(formatted_entries)


@router.message(Command("schedule"))
async def cmd_schedule(message: Message) -> None:
    """Handle /schedule command - show today's schedule."""
    from src.core.repositories.group import StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.core.services.schedule import ScheduleService
    from src.gateways.telegram.deps import get_session

    tg_user = message.from_user
    if not tg_user:
        return

    async with get_session() as session:
        # Find user's group
        identity_repo = IdentityRepository(session)
        identity = await identity_repo.get_by_external("telegram", str(tg_user.id))

        if not identity:
            await message.answer(
                "📅 <b>Расписание</b>\n\n"
                "Сначала зарегистрируйся: /start"
            )
            return

        student_repo = StudentRepository(session)
        students = await student_repo.get_user_students(identity.user_id)

        if not students:
            await message.answer(
                "📅 <b>Расписание</b>\n\n"
                "Чтобы видеть расписание, укажи группу в /settings."
            )
            return

        # Get first group's schedule
        student = students[0]
        group = student.group

        schedule_service = ScheduleService(session)
        try:
            day_schedule = await schedule_service.get_day_schedule(
                group.code, date.today(), user_id=identity.user_id
            )
            schedule_dict = day_schedule.model_dump()
            text = format_day_schedule(schedule_dict)
        except Exception:
            # No schedule imported yet
            text = (
                f"📅 <b>Расписание для {group.code}</b>\n\n"
                "Расписание ещё не загружено.\n"
                "Староста может импортировать его через Mini App."
            )

    await message.answer(text)


def format_deadline(assignment: Any) -> str:
    """Format single deadline for display."""
    subject_name = assignment.subject.name if assignment.subject else "Неизвестно"
    deadline_str = assignment.deadline.strftime("%d.%m %H:%M") if assignment.deadline else "—"

    lines = [f"📌 <b>{assignment.title}</b>"]
    lines.append(f"   📚 {subject_name}")
    lines.append(f"   ⏰ {deadline_str}")

    if assignment.description:
        desc = assignment.description[:100] + "..." if len(assignment.description) > 100 else assignment.description
        lines.append(f"   {desc}")

    return "\n".join(lines)


@router.message(Command("deadlines"))
async def cmd_deadlines(message: Message) -> None:
    """Handle /deadlines command - show upcoming deadlines."""
    from src.core.repositories.assignment import AssignmentRepository
    from src.core.repositories.group import StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.gateways.telegram.deps import get_session

    tg_user = message.from_user
    if not tg_user:
        return

    async with get_session() as session:
        # Find user's group
        identity_repo = IdentityRepository(session)
        identity = await identity_repo.get_by_external("telegram", str(tg_user.id))

        if not identity:
            await message.answer(
                "⏰ <b>Дедлайны</b>\n\n"
                "Сначала зарегистрируйся: /start"
            )
            return

        student_repo = StudentRepository(session)
        students = await student_repo.get_user_students(identity.user_id)

        if not students:
            await message.answer(
                "⏰ <b>Дедлайны</b>\n\n"
                "Чтобы видеть дедлайны, укажи группу в /settings."
            )
            return

        # Get first group's deadlines
        student = students[0]
        group = student.group

        assignment_repo = AssignmentRepository(session)
        deadlines = await assignment_repo.get_upcoming_deadlines(group.id, days=14, limit=10)

        if not deadlines:
            await message.answer(
                f"⏰ <b>Дедлайны для {group.code}</b>\n\n"
                "Ближайших дедлайнов нет! 🎉\n\n"
                "Добавить задание можно через Mini App."
            )
            return

        formatted = [format_deadline(d) for d in deadlines]
        text = f"⏰ <b>Дедлайны для {group.code}</b>\n\n" + "\n\n".join(formatted)

    await message.answer(text)
