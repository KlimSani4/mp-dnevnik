"""APScheduler tasks for Nexora bot notifications."""

import logging
from datetime import date, datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Europe/Moscow")


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
    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    """Stop the background scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
