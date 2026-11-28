"""APScheduler tasks for Nexora bot notifications."""

import functools
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from src.core.models.notification import NotificationType
from src.core.services import notify_prefs as np

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Europe/Moscow")

MOSCOW_TZ = timezone(timedelta(hours=3))

Job = Callable[[], Awaitable[None]]

# Сколько хранится отметка «уже отправлено» (#135). Должно быть больше окна, в котором
# задача может снова выбрать то же уведомление.
_DEDUP_TTL = 30 * 60  # напоминание о паре: окно в минуту, запас на рестарт
_DAILY_DEDUP_TTL = 26 * 3600  # дайджест, утреннее расписание, дедлайны

# Блокировка запуска задачи: при нескольких экземплярах бэкенда задачу в этот слот
# выполняет только один из них. Живёт меньше интервала самой частой задачи (минута).
_JOB_LOCK_TTL = 55


async def _is_duplicate(
    user_id: str, notif_type: str, identifier: str, ttl: int = _DEDUP_TTL
) -> bool:
    """True, если это уведомление уже отправлено (или отправляется) другим запуском.

    Одна атомарная команда SET NX EX: из нескольких параллельных запусков ключ создаёт
    только один, остальные получают True и сообщение не шлют (#135). Раньше проверка
    шла в два шага (EXISTS, затем SETEX), и два пода успевали отправить оба.
    """
    from src.shared.redis import get_redis

    redis = await get_redis()
    key = f"notification:{user_id}:{notif_type}:{identifier}"
    created = await redis.set(key, "1", nx=True, ex=ttl)
    return not created


def _single_instance(job_id: str) -> Callable[[Job], Job]:
    """Выполнять задачу в одном экземпляре бэкенда на каждый запуск по расписанию (#135).

    Планировщик работает в каждом поде, поэтому без блокировки каждая задача выполнялась
    столько раз, сколько подов. Слот — минута запуска, округлённая до ближайшей (APScheduler
    срабатывает в начале минуты, а у подов могут быть миллисекунды разницы): в этот слот
    задачу берёт тот, кто первым поставил ключ. Если Redis недоступен, задачу пропускаем: без Redis не работает и
    защита от повторной отправки.
    """

    def decorator(func: Job) -> Job:
        @functools.wraps(func)
        async def wrapper() -> None:
            from src.shared.redis import get_redis

            slot = (datetime.now(tz=UTC) + timedelta(seconds=30)).strftime("%Y%m%d%H%M")
            try:
                redis = await get_redis()
                acquired = await redis.set(
                    f"scheduler:lock:{job_id}:{slot}", "1", nx=True, ex=_JOB_LOCK_TTL
                )
            except Exception as e:
                logger.warning(
                    "Scheduler lock unavailable, job skipped",
                    extra={"job": job_id, "error": str(e)},
                )
                return
            if not acquired:
                logger.debug("Job already running in another instance", extra={"job": job_id})
                return
            await func()

        return wrapper

    return decorator


def in_window(hours_left: float, target: float) -> bool:
    """Попадает ли дедлайн в окно напоминания: [target - 0.5; target + 0.5).

    Задача запускается раз в час, а окно полуоткрытое и шириной ровно час, поэтому
    каждый дедлайн попадает в него ровно один раз. Раньше границы были закрыты с обеих
    сторон, и дедлайн в hh:30 срабатывал в двух запусках подряд (#135).
    """
    return target - 0.5 <= hours_left < target + 0.5


@_single_instance("upcoming_class_notifications")
async def send_upcoming_class_notifications() -> None:
    """Напоминание о паре за 10–15 минут (#26): аудитория или ссылка на вебинар.

    Учитывает личные и групповые переопределения (скрытые и отменённые пары не напоминаем,
    сменённую аудиторию и ссылку берём из переопределения), свои занятия (ADD),
    выключатель в настройках уведомлений и выбранное время — 10 или 15 минут.
    """
    from sqlalchemy import select

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
                enabled = np.enabled_users(
                    user_ids,
                    await _saved_prefs(session, user_ids, NotificationType.CLASS_REMINDER),
                    NotificationType.CLASS_REMINDER,
                )

                for student in students:
                    if student.user_id not in enabled:
                        continue
                    user = users.get(student.user_id)
                    if np.in_quiet_hours(user.settings if user else None, now):
                        continue
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
                    for lesson in cr.unique(lessons):
                        dedup_id = cr.dedup_id(lesson, today)
                        if await _is_duplicate(str(student.user_id), "class_reminder", dedup_id):
                            continue
                        bot = bot or await get_bot()
                        try:
                            await bot.send_message(
                                chat_id=int(identity.external_id),
                                text=cr.format_reminder(lesson, minutes),
                                parse_mode="HTML",
                                disable_web_page_preview=True,
                                reply_markup=mute_keyboard(NotificationType.CLASS_REMINDER),
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


async def _saved_prefs(
    session: Any, user_ids: list[uuid.UUID], ntype: NotificationType
) -> list[tuple[uuid.UUID, bool]]:
    """(user_id, enabled) из notification_preferences для этих пользователей и типа."""
    from sqlalchemy import select

    from src.core.models.notification import NotificationPreference

    rows = await session.execute(
        select(NotificationPreference.user_id, NotificationPreference.enabled).where(
            NotificationPreference.user_id.in_(user_ids),
            NotificationPreference.type == ntype,
        )
    )
    return [(r.user_id, r.enabled) for r in rows.all()]


def mute_keyboard(ntype: NotificationType, *extra: InlineKeyboardButton) -> InlineKeyboardMarkup:
    """Под каждым уведомлением: выключить такие в одно нажатие (#32)."""
    from src.gateways.telegram.handlers.notify import MuteCb

    return InlineKeyboardMarkup(
        inline_keyboard=[
            *([[b] for b in extra]),
            [
                InlineKeyboardButton(
                    text="🔕 Больше не присылать такие",
                    callback_data=MuteCb(type=ntype.value).pack(),
                )
            ],
        ]
    )


async def _send_daily_digest(slot: str) -> None:
    """Сводка раз в день в выбранное время (#32). Только тем, кто её включил.

    Утром (07:30) — пары на сегодня, вечером — на завтра. Дедлайны у каждого свои:
    чужие личные и уже сданные не показываем.
    """
    from sqlalchemy import select

    from src.core.models.user import User
    from src.core.repositories.group import GroupRepository, StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.core.services import daily_digest as dd
    from src.core.services.assignment import AssignmentService
    from src.core.services.schedule import ScheduleService
    from src.gateways.telegram.bot import get_bot
    from src.gateways.telegram.deps import get_session

    today = datetime.now(tz=MOSCOW_TZ).date()
    morning = slot in np.MORNING_TIMES
    day = today if morning else today + timedelta(days=1)
    fmt = dd.format_morning if morning else dd.format_evening

    async with get_session() as session:
        group_repo = GroupRepository(session)
        student_repo = StudentRepository(session)
        identity_repo = IdentityRepository(session)
        schedule_service = ScheduleService(session)
        assignment_service = AssignmentService(session)

        groups = await group_repo.get_all_groups()
        bot = None

        for group in groups:
            try:
                students = await student_repo.get_group_students(group.id)
                if not students:
                    continue
                user_ids = [s.user_id for s in students]
                enabled = np.enabled_users(
                    user_ids,
                    await _saved_prefs(session, user_ids, NotificationType.DIGEST),
                    NotificationType.DIGEST,
                )
                if not enabled:
                    continue
                users = {
                    u.id: u
                    for u in (
                        await session.execute(select(User).where(User.id.in_(list(enabled))))
                    ).scalars()
                }
                recipients = [
                    s
                    for s in students
                    if s.user_id in users and np.digest_time(users[s.user_id].settings) == slot
                ]
                if not recipients:
                    continue

                day_schedule = await schedule_service.get_day_schedule(group.code, day)
                lessons = [
                    dd.DigestLesson(
                        subject=e.subject.name if e.subject else "Пара",
                        start=e.start_time,
                        end=e.end_time,
                        lesson_type=e.lesson_type if e.lesson_type != "custom" else None,
                        place=e.room or e.location,
                    )
                    for e in day_schedule.entries
                ]

                horizon = datetime.combine(
                    today + timedelta(days=dd.DEADLINE_DAYS), datetime.min.time(), MOSCOW_TZ
                )
                group_deadlines = [
                    a
                    for a in await assignment_service.get_upcoming_deadlines(
                        group.id, days=dd.DEADLINE_DAYS, limit=50
                    )
                    if a.deadline
                    and (a.deadline if a.deadline.tzinfo else a.deadline.replace(tzinfo=UTC))
                    < horizon
                ]
                done = await _done_pairs(
                    session, [s.id for s in recipients], [a.id for a in group_deadlines]
                )

                dedup_id = f"{day.isoformat()}:{slot}"
                for student in recipients:
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if not identity or not identity.external_id:
                        continue
                    deadlines = [
                        dd.DigestDeadline(
                            title=a.title,
                            subject=a.subject.name if a.subject else "Предмет",
                            deadline=a.deadline,
                        )
                        for a in group_deadlines
                        if a.deadline
                        and (not a.is_personal or a.author_id == student.user_id)
                        and (student.id, a.id) not in done
                    ]
                    if await _is_duplicate(
                        str(student.user_id), "daily_digest", dedup_id, _DAILY_DEDUP_TTL
                    ):
                        continue
                    bot = bot or await get_bot()
                    try:
                        await bot.send_message(
                            chat_id=int(identity.external_id),
                            text=fmt(lessons, deadlines, today),
                            parse_mode="HTML",
                            disable_web_page_preview=True,
                            reply_markup=mute_keyboard(NotificationType.DIGEST),
                        )
                    except Exception as e:
                        logger.warning(
                            "Failed to send daily digest",
                            extra={"user": identity.external_id, "error": str(e)},
                        )
            except Exception as e:
                logger.warning(
                    "Failed to process daily digest for group",
                    extra={"group": group.code, "error": str(e)},
                )


async def _done_pairs(
    session: Any, student_ids: list[uuid.UUID], assignment_ids: list[uuid.UUID]
) -> set[tuple[uuid.UUID, uuid.UUID]]:
    """(student_id, assignment_id) сданных или зачтённых заданий: о них не напоминаем."""
    if not student_ids or not assignment_ids:
        return set()
    from sqlalchemy import select

    from src.core.models.assignment import TaskState, TaskStatus

    rows = await session.execute(
        select(TaskStatus.student_id, TaskStatus.assignment_id).where(
            TaskStatus.student_id.in_(student_ids),
            TaskStatus.assignment_id.in_(assignment_ids),
            TaskStatus.state.in_([TaskState.REVIEW, TaskState.DONE]),
        )
    )
    return {(r.student_id, r.assignment_id) for r in rows.all()}


def _digest_job(slot: str) -> Job:
    @_single_instance(f"daily_digest_{slot}")
    async def job() -> None:
        await _send_daily_digest(slot)

    job.__name__ = f"send_daily_digest_{slot}"
    return job


DIGEST_JOBS: dict[str, Job] = {slot: _digest_job(slot) for slot in np.DIGEST_TIMES}


@_single_instance("deadline_reminders")
async def send_deadline_reminders() -> None:
    """Раз в час: дедлайн через ~24 ч и ~3 ч (#32).

    Только тем, у кого задание не сдано, без чужих личных заданий и не в тихие часы.
    Под сообщением — «Уже сдал» и «Больше не присылать».
    """
    from html import escape

    from sqlalchemy import select

    from src.core.models.user import User
    from src.core.repositories.group import GroupRepository, StudentRepository
    from src.core.repositories.user import IdentityRepository
    from src.core.schemas.assignment import AssignmentWithSubject
    from src.core.services.assignment import AssignmentService
    from src.gateways.telegram.bot import get_bot
    from src.gateways.telegram.deps import get_session
    from src.gateways.telegram.handlers.notify import DoneCb

    now = datetime.now(tz=MOSCOW_TZ)

    async with get_session() as session:
        group_repo = GroupRepository(session)
        student_repo = StudentRepository(session)
        identity_repo = IdentityRepository(session)
        assignment_service = AssignmentService(session)

        groups = await group_repo.get_all_groups()
        bot = None

        for group in groups:
            try:
                deadlines = await assignment_service.get_upcoming_deadlines(
                    group.id, days=2, limit=50
                )

                reminders: list[tuple[AssignmentWithSubject, str, str]] = []
                for a in deadlines:
                    if not a.deadline:
                        continue
                    dl = a.deadline if a.deadline.tzinfo else a.deadline.replace(tzinfo=UTC)
                    hours_left = (dl - now).total_seconds() / 3600
                    title = escape(a.title)
                    subject = escape(a.subject.name if a.subject else "Предмет")
                    when = dl.astimezone(MOSCOW_TZ).strftime("%H:%M")
                    if in_window(hours_left, 24):
                        text = f"⏰ <b>Завтра до {when}</b> — {title}\n<i>{subject}</i>"
                        reminders.append((a, text, "deadline_24h"))
                    elif in_window(hours_left, 3):
                        text = f"🔥 <b>Через 3 часа</b> — {title}\n<i>{subject}</i>"
                        reminders.append((a, text, "deadline_3h"))
                if not reminders:
                    continue

                students = await student_repo.get_group_students(group.id)
                if not students:
                    continue
                user_ids = [s.user_id for s in students]
                enabled = np.enabled_users(
                    user_ids,
                    await _saved_prefs(session, user_ids, NotificationType.DEADLINE),
                    NotificationType.DEADLINE,
                )
                users = {
                    u.id: u
                    for u in (
                        await session.execute(select(User).where(User.id.in_(list(enabled))))
                    ).scalars()
                }
                done = await _done_pairs(
                    session, [s.id for s in students], [a.id for a, _, _ in reminders]
                )

                for student in students:
                    user = users.get(student.user_id)
                    if user is None or np.in_quiet_hours(user.settings, now):
                        continue
                    mine = [
                        r
                        for r in reminders
                        if (not r[0].is_personal or r[0].author_id == student.user_id)
                        and (student.id, r[0].id) not in done
                    ]
                    if not mine:
                        continue
                    identity = await identity_repo.get_user_telegram_identity(student.user_id)
                    if not identity or not identity.external_id:
                        continue
                    for assignment, text, notif_type in mine:
                        if await _is_duplicate(
                            str(student.user_id), notif_type, str(assignment.id), _DAILY_DEDUP_TTL
                        ):
                            continue
                        bot = bot or await get_bot()
                        try:
                            await bot.send_message(
                                chat_id=int(identity.external_id),
                                text=text,
                                parse_mode="HTML",
                                reply_markup=mute_keyboard(
                                    NotificationType.DEADLINE,
                                    InlineKeyboardButton(
                                        text="Уже сдал",
                                        style="success",
                                        callback_data=DoneCb(assignment=assignment.id.hex).pack(),
                                    ),
                                ),
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


@_single_instance("sync_all_schedules")
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
    for slot, job in DIGEST_JOBS.items():
        scheduler.add_job(
            job,
            CronTrigger(hour=int(slot[:2]), minute=int(slot[2:]), timezone="Europe/Moscow"),
            id=f"daily_digest_{slot}",
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
