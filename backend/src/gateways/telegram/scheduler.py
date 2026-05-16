"""APScheduler tasks for Nexora bot notifications."""

import logging
from datetime import date, datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Europe/Moscow")

MOSCOW_TZ = timezone(timedelta(hours=3))


async def send_upcoming_class_notifications() -> None:
    """Send notifications to students about classes starting in 15 minutes."""
    from src.core.repositories.group import GroupRepository, StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.core.services.schedule import ScheduleService
    from src.gateways.telegram.bot import get_bot
    from src.gateways.telegram.deps import get_session

    now = datetime.now(tz=timezone(timedelta(hours=3)))  # Moscow time
    target_time = now + timedelta(minutes=15)
    target_hhmm = target_time.strftime("%H:%M")

    async with get_session() as session:
        group_repo = GroupRepository(session)
        student_repo = StudentRepository(session)
        identity_repo = IdentityRepository(session)
        schedule_service = ScheduleService(session)

        groups = await group_repo.get_all_groups()

        bot = await get_bot()

        for group in groups:
            try:
                today_moscow = datetime.now(tz=timezone(timedelta(hours=3))).date()
                day_schedule = await schedule_service.get_day_schedule(
                    group.code, today_moscow
                )
                for entry in day_schedule.entries:
                    if abs_diff_minutes(entry.start_time, target_hhmm) <= 1:
                        students = await student_repo.get_group_students(group.id)
                        for student in students:
                            identity = await identity_repo.get_user_telegram_identity(
                                student.user_id
                            )
                            if identity and identity.external_id:
                                subject_name = (
                                    entry.subject.name if entry.subject else "Пара"
                                )
                                location = entry.location or "—"
                                text = (
                                    f"🔔 <b>Через 15 минут начинается пара</b>\n\n"
                                    f"📚 {subject_name}\n"
                                    f"🕐 {entry.start_time}\n"
                                    f"📍 {location}"
                                )
                                try:
                                    await bot.send_message(
                                        chat_id=int(identity.external_id),
                                        text=text,
                                        parse_mode="HTML",
                                    )
                                except Exception as e:
                                    logger.warning(
                                        "Failed to send notification",
                                        extra={
                                            "user": identity.external_id,
                                            "error": str(e),
                                        },
                                    )
            except Exception as e:
                logger.warning(
                    "Failed to process group schedule",
                    extra={"group": group.code, "error": str(e)},
                )


async def send_evening_digest() -> None:
    """Send evening digest at 20:00 Moscow with tomorrow's schedule and upcoming deadlines."""
    from src.core.repositories.group import GroupRepository, StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.core.services.assignment import AssignmentService
    from src.core.services.schedule import ScheduleService
    from src.gateways.telegram.bot import get_bot
    from src.gateways.telegram.deps import get_session

    tomorrow = (datetime.now(tz=MOSCOW_TZ) + timedelta(days=1)).date()

    async with get_session() as session:
        group_repo = GroupRepository(session)
        student_repo = StudentRepository(session)
        identity_repo = IdentityRepository(session)
        schedule_service = ScheduleService(session)
        assignment_service = AssignmentService(session)

        groups = await group_repo.get_all_groups()
        bot = await get_bot()

        for group in groups:
            try:
                students = await student_repo.get_group_students(group.id)
                if not students:
                    continue

                day_schedule = await schedule_service.get_day_schedule(group.code, tomorrow)
                deadlines = await assignment_service.get_upcoming_deadlines(group.id, days=7)

                if day_schedule.entries:
                    first = day_schedule.entries[0]
                    first_subject = first.subject.name if first.subject else "Пара"
                    first_room = first.location or "—"
                    first_time = str(first.start_time)[:5]
                    schedule_part = (
                        f"📅 Завтра {len(day_schedule.entries)} пар"
                        f" с {first_time}\n"
                        f"Первая — {first_subject} в {first_room}"
                    )
                else:
                    schedule_part = "Завтра пар нет. Выспись 😴"

                if deadlines:
                    deadline_lines = []
                    for a in deadlines:
                        subject_name = a.subject.name if a.subject else "Предмет"
                        dl_str = a.deadline.strftime("%d.%m") if a.deadline else "?"
                        deadline_lines.append(f"• {subject_name} — {a.title} (до {dl_str})")
                    deadlines_part = "⏰ Горящие дедлайны:\n" + "\n".join(deadline_lines)
                    text = f"🌙 Дайджест на завтра\n\n{schedule_part}\n\n{deadlines_part}"
                else:
                    text = f"🌙 Дайджест на завтра\n\n{schedule_part}"

                for student in students:
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if identity and identity.external_id:
                        try:
                            await bot.send_message(
                                chat_id=int(identity.external_id),
                                text=text,
                                parse_mode="HTML",
                            )
                        except Exception as e:
                            logger.warning(
                                "Failed to send evening digest",
                                extra={"user": identity.external_id, "error": str(e)},
                            )
            except Exception as e:
                logger.warning(
                    "Failed to process evening digest for group",
                    extra={"group": group.code, "error": str(e)},
                )


async def send_morning_schedule() -> None:
    """Send morning schedule at 07:30 Moscow with today's classes."""
    from src.core.repositories.group import GroupRepository, StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.core.services.schedule import ScheduleService
    from src.gateways.telegram.bot import get_bot
    from src.gateways.telegram.deps import get_session

    today = datetime.now(tz=MOSCOW_TZ).date()

    async with get_session() as session:
        group_repo = GroupRepository(session)
        student_repo = StudentRepository(session)
        identity_repo = IdentityRepository(session)
        schedule_service = ScheduleService(session)

        groups = await group_repo.get_all_groups()
        bot = await get_bot()

        for group in groups:
            try:
                students = await student_repo.get_group_students(group.id)
                if not students:
                    continue

                day_schedule = await schedule_service.get_day_schedule(group.code, today)

                if day_schedule.entries:
                    first = day_schedule.entries[0]
                    first_subject = first.subject.name if first.subject else "Пара"
                    first_room = first.location or "—"
                    first_time = str(first.start_time)[:5]
                    text = (
                        f"☀️ Доброе утро!\n\n"
                        f"Сегодня {len(day_schedule.entries)} пар"
                        f" с {first_time}\n"
                        f"Первая — {first_subject} в {first_room}"
                    )
                else:
                    text = "☀️ Доброе утро!\n\nСегодня пар нет"

                for student in students:
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if identity and identity.external_id:
                        try:
                            await bot.send_message(
                                chat_id=int(identity.external_id),
                                text=text,
                                parse_mode="HTML",
                            )
                        except Exception as e:
                            logger.warning(
                                "Failed to send morning schedule",
                                extra={"user": identity.external_id, "error": str(e)},
                            )
            except Exception as e:
                logger.warning(
                    "Failed to process morning schedule for group",
                    extra={"group": group.code, "error": str(e)},
                )


async def send_deadline_reminders() -> None:
    """Hourly job: remind students about deadlines in ~24h or ~3h."""
    from src.core.repositories.group import GroupRepository, StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.core.services.assignment import AssignmentService
    from src.gateways.telegram.bot import get_bot
    from src.gateways.telegram.deps import get_session

    now = datetime.now(tz=MOSCOW_TZ)

    async with get_session() as session:
        group_repo = GroupRepository(session)
        student_repo = StudentRepository(session)
        identity_repo = IdentityRepository(session)
        assignment_service = AssignmentService(session)

        groups = await group_repo.get_all_groups()
        bot = await get_bot()

        for group in groups:
            try:
                students = await student_repo.get_group_students(group.id)
                if not students:
                    continue

                # Fetch assignments due within the next 25 hours to cover both windows
                deadlines = await assignment_service.get_upcoming_deadlines(group.id, days=2, limit=50)

                reminders: list[tuple[object, str]] = []
                for a in deadlines:
                    if not a.deadline:
                        continue
                    dl = a.deadline
                    if dl.tzinfo is None:
                        dl = dl.replace(tzinfo=timezone.utc)
                    hours_left = (dl - now).total_seconds() / 3600
                    subject_name = a.subject.name if a.subject else "Предмет"

                    if abs(hours_left - 24) <= 0.5:
                        msg = f"⏰ Завтра дедлайн: {a.title} ({subject_name})"
                        reminders.append((a, msg))
                    elif abs(hours_left - 3) <= 0.5:
                        msg = f"🔥 Через 3 часа дедлайн: {a.title} ({subject_name})"
                        reminders.append((a, msg))

                if not reminders:
                    continue

                for student in students:
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if identity and identity.external_id:
                        for _assignment, text in reminders:
                            try:
                                await bot.send_message(
                                    chat_id=int(identity.external_id),
                                    text=text,
                                )
                            except Exception as e:
                                logger.warning(
                                    "Failed to send deadline reminder",
                                    extra={"user": identity.external_id, "error": str(e)},
                                )
            except Exception as e:
                logger.warning(
                    "Failed to process deadline reminders for group",
                    extra={"group": group.code, "error": str(e)},
                )


async def sync_all_schedules() -> None:
    """Sync schedules for all groups from rasp.dmami.ru every 15 minutes."""
    from src.core.repositories.group import GroupRepository
    from src.core.services.schedule import ScheduleService
    from src.integrations.rasp_parser import fetch_group_schedule
    from src.gateways.telegram.deps import get_session

    async with get_session() as session:
        group_repo = GroupRepository(session)
        schedule_service = ScheduleService(session)

        groups = await group_repo.get_all_groups()

        for group in groups:
            try:
                schedule_data = await fetch_group_schedule(group.code)
                if schedule_data:
                    await schedule_service.import_schedule(group.code, schedule_data)
            except Exception as e:
                logger.warning(
                    "Failed to sync schedule for group",
                    extra={"group": group.code, "error": str(e)},
                )


def abs_diff_minutes(time_str: object, target_hhmm: str) -> int:
    """Calculate absolute difference in minutes between two HH:MM strings."""
    try:
        h1, m1 = map(int, str(time_str)[:5].split(":"))
        h2, m2 = map(int, target_hhmm.split(":"))
        return abs((h1 * 60 + m1) - (h2 * 60 + m2))
    except Exception:
        return 999


def start_scheduler() -> None:
    """Start the background scheduler."""
    scheduler.add_job(
        send_upcoming_class_notifications,
        CronTrigger(minute="*"),
        id="upcoming_class_notifications",
        replace_existing=True,
        misfire_grace_time=30,
    )
    scheduler.add_job(
        send_evening_digest,
        CronTrigger(hour=20, minute=0, timezone="Europe/Moscow"),
        id="evening_digest",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        send_morning_schedule,
        CronTrigger(hour=7, minute=30, timezone="Europe/Moscow"),
        id="morning_schedule",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        send_deadline_reminders,
        CronTrigger(minute=0, timezone="Europe/Moscow"),
        id="deadline_reminders",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        sync_all_schedules,
        CronTrigger(minute="*/15"),
        id="sync_all_schedules",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    """Stop the background scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
