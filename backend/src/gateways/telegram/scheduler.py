"""APScheduler tasks for Nexora bot notifications."""

import logging
from datetime import UTC, datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Europe/Moscow")

MOSCOW_TZ = timezone(timedelta(hours=3))

_DEDUP_TTL = 30 * 60  # 30 minutes in seconds


async def _is_duplicate(user_id: str, notif_type: str, identifier: str) -> bool:
    """Return True if this notification was already sent recently (Redis dedup)."""
    from src.shared.redis import get_redis

    redis = await get_redis()
    key = f"notification:{user_id}:{notif_type}:{identifier}"
    exists = await redis.exists(key)
    if exists:
        return True
    await redis.setex(key, _DEDUP_TTL, "1")
    return False


async def send_upcoming_class_notifications() -> None:
    """Напоминание о паре за 10–15 минут (#26): аудитория или ссылка на вебинар.

    Учитывает личные и групповые переопределения (скрытые и отменённые пары не напоминаем,
    сменённую аудиторию и ссылку берём из переопределения), свои занятия (ADD),
    выключатель в настройках уведомлений и выбранное время — 10 или 15 минут.
    """
    from sqlalchemy import select

    from src.core.models.notification import NotificationPreference, NotificationType
    from src.core.models.schedule import OverrideType
    from src.core.models.user import User
    from src.core.repositories.group import GroupRepository, StudentRepository
    from src.core.repositories.schedule import (
        ScheduleEntryRepository,
        ScheduleOverrideRepository,
    )
    from src.core.repositories.user import IdentityRepository
    from src.core.services import class_reminder as cr
    from src.gateways.telegram.bot import get_bot
    from src.gateways.telegram.deps import get_session

    now = datetime.now(tz=MOSCOW_TZ)
    today = now.date()

    def soon(start: object) -> bool:
        # Предфильтр: пара начинается в ближайшие MAX_MINUTES минут
        return any(cr.is_due(start, now, m) for m in cr.MINUTES_CHOICES)  # type: ignore[arg-type]

    async with get_session() as session:
        group_repo = GroupRepository(session)
        student_repo = StudentRepository(session)
        identity_repo = IdentityRepository(session)
        entry_repo = ScheduleEntryRepository(session)
        override_repo = ScheduleOverrideRepository(session)

        groups = await group_repo.get_all_groups()
        bot = None

        for group in groups:
            try:
                entries = [
                    e
                    for e in await entry_repo.get_day_schedule(group.id, today)
                    if soon(e.start_time)
                ]
                overrides = await override_repo.get_reminder_overrides(
                    group.id, [e.id for e in entries], today
                )
                adds = [
                    (o, lesson)
                    for o in overrides
                    if o.override_type == OverrideType.ADD
                    and (lesson := cr.lesson_from_add(o)) is not None
                    and soon(lesson.start)
                ]
                if not entries and not adds:
                    continue

                students = await student_repo.get_group_students(group.id)
                if not students:
                    continue
                user_ids = [s.user_id for s in students]
                users = {
                    u.id: u
                    for u in (
                        await session.execute(select(User).where(User.id.in_(user_ids)))
                    ).scalars()
                }
                disabled = set(
                    (
                        await session.execute(
                            select(NotificationPreference.user_id).where(
                                NotificationPreference.user_id.in_(user_ids),
                                NotificationPreference.type == NotificationType.CLASS_REMINDER,
                                NotificationPreference.enabled.is_(False),
                            )
                        )
                    ).scalars()
                )

                for student in students:
                    if student.user_id in disabled:
                        continue
                    user = users.get(student.user_id)
                    minutes = cr.reminder_minutes(user.settings if user else None)

                    lessons = [
                        lesson
                        for e in entries
                        if cr.is_due(e.start_time, now, minutes)
                        and (
                            lesson := cr.lesson_from_entry(
                                e, overrides, student_id=student.id, user_id=student.user_id
                            )
                        )
                        is not None
                    ]
                    lessons += [
                        lesson
                        for o, lesson in adds
                        if cr.is_due(lesson.start, now, minutes)
                        and cr.visible_to(o, student_id=student.id, user_id=student.user_id)
                    ]
                    if not lessons:
                        continue

                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if not identity or not identity.external_id:
                        continue
                    for lesson in lessons:
                        dedup_id = f"{lesson.key}:{today.isoformat()}"
                        if await _is_duplicate(str(student.user_id), "class_reminder", dedup_id):
                            continue
                        bot = bot or await get_bot()
                        try:
                            await bot.send_message(
                                chat_id=int(identity.external_id),
                                text=cr.format_reminder(lesson, minutes),
                                parse_mode="HTML",
                                disable_web_page_preview=True,
                            )
                        except Exception as e:
                            logger.warning(
                                "Failed to send class reminder",
                                extra={"user": identity.external_id, "error": str(e)},
                            )
            except Exception as e:
                logger.warning(
                    "Failed to process class reminders for group",
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

                dedup_id = tomorrow.isoformat()
                for student in students:
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if identity and identity.external_id:
                        if await _is_duplicate(str(student.user_id), "evening_digest", dedup_id):
                            continue
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

                dedup_id = today.isoformat()
                for student in students:
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if identity and identity.external_id:
                        if await _is_duplicate(str(student.user_id), "morning_schedule", dedup_id):
                            continue
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
    from src.core.schemas.assignment import AssignmentWithSubject
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
                deadlines = await assignment_service.get_upcoming_deadlines(
                    group.id, days=2, limit=50
                )

                reminders: list[tuple[AssignmentWithSubject, str, str]] = []
                for a in deadlines:
                    if not a.deadline:
                        continue
                    dl = a.deadline
                    if dl.tzinfo is None:
                        dl = dl.replace(tzinfo=UTC)
                    hours_left = (dl - now).total_seconds() / 3600
                    subject_name = a.subject.name if a.subject else "Предмет"

                    if abs(hours_left - 24) <= 0.5:
                        msg = f"⏰ Завтра дедлайн: {a.title} ({subject_name})"
                        reminders.append((a, msg, "deadline_24h"))
                    elif abs(hours_left - 3) <= 0.5:
                        msg = f"🔥 Через 3 часа дедлайн: {a.title} ({subject_name})"
                        reminders.append((a, msg, "deadline_3h"))

                if not reminders:
                    continue

                for student in students:
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if identity and identity.external_id:
                        for assignment, text, notif_type in reminders:
                            dedup_id = str(assignment.id)
                            if await _is_duplicate(str(student.user_id), notif_type, dedup_id):
                                continue
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
    from src.gateways.telegram.deps import get_session
    from src.integrations.rasp_parser import fetch_group_schedule

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
