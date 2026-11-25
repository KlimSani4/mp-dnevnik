"""Очередь на сдачу лабораторных (#62).

Кто что может:
- открыть, начать, закрыть очередь и отмечать результат — староста, заместитель,
  помощник старосты группы и модератор платформы («ведущий»);
- записаться, поменять ЛР, пропустить ход, выйти, попросить поменяться местами —
  подтверждённый участник группы.

Все изменения очереди идут под SELECT … FOR UPDATE её строки: две кнопки, нажатые
одновременно в боте и на сайте, не перепутают порядок.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, timedelta, timezone
from html import escape
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core import queue_order
from src.core.models.group import Group, Student, StudentRole
from src.core.models.queue import (
    LabQueue,
    LabQueueEntry,
    LabQueueSwap,
    QueueEntryStatus,
    QueueMode,
    QueueStatus,
    SwapStatus,
)
from src.core.models.schedule import ScheduleEntry
from src.core.models.semester import Semester, SubjectSemester
from src.core.models.user import User
from src.core.schemas.queue import (
    LessonOption,
    QueueCreate,
    QueueDetail,
    QueueEntryView,
    QueueSummary,
    SwapView,
)
from src.shared.exceptions import AuthorizationError, ConflictError, NotFoundError, ValidationError

MOSCOW_TZ = timezone(timedelta(hours=3))


def moscow_today() -> date:
    """Сегодня по Москве: пары и очереди живут по московскому времени."""
    return datetime.now(MOSCOW_TZ).date()


logger = logging.getLogger(__name__)

HOST_ROLES = (StudentRole.STAROSTA, StudentRole.DEPUTY, StudentRole.ASSISTANT)
ACTIVE = (QueueStatus.OPEN, QueueStatus.STARTED)
IN_LINE = (QueueEntryStatus.WAITING, QueueEntryStatus.CURRENT)

# Отправка сообщения пользователю: (user_id, html-текст, кнопки [(текст, callback_data)])
Notify = Callable[[uuid.UUID, str, list[tuple[str, str]]], Awaitable[None]]


def _now() -> datetime:
    return datetime.now(tz=UTC)


async def telegram_notify(
    session: AsyncSession, user_id: uuid.UUID, text: str, buttons: list[tuple[str, str]]
) -> None:
    """Сообщение в Telegram с кнопками. Ошибки отправки не ломают действие."""
    try:
        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

        from src.core.repositories.user import IdentityRepository
        from src.gateways.telegram.bot import get_bot

        identity = await IdentityRepository(session).get_user_telegram_identity(user_id)
        if not identity or not identity.external_id:
            return
        markup = (
            InlineKeyboardMarkup(
                inline_keyboard=[
                    [InlineKeyboardButton(text=t, callback_data=d) for t, d in buttons]
                ]
            )
            if buttons
            else None
        )
        bot = await get_bot()
        await bot.send_message(
            int(identity.external_id), text, parse_mode="HTML", reply_markup=markup
        )
    except Exception:  # noqa: BLE001
        logger.warning("Queue notification failed", extra={"user_id": str(user_id)}, exc_info=True)


class LabQueueService:
    def __init__(self, session: AsyncSession, notify: Notify | None = None) -> None:
        self.session = session
        self._notify = notify or (
            lambda uid, text, buttons: telegram_notify(session, uid, text, buttons)
        )

    # ─── Доступ ───

    async def _group(self, code: str) -> Group:
        group = (
            await self.session.execute(select(Group).where(Group.code == code))
        ).scalar_one_or_none()
        if not group:
            raise NotFoundError(f"Group {code} not found")
        return group

    async def _student(self, group_id: uuid.UUID, user_id: uuid.UUID) -> Student | None:
        stmt = select(Student).where(Student.group_id == group_id, Student.user_id == user_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def is_host(self, group_id: uuid.UUID, user: User) -> bool:
        if user.is_moderator:
            return True
        student = await self._student(group_id, user.id)
        return bool(student and student.verified and student.role in HOST_ROLES)

    async def require_host(self, group_id: uuid.UUID, user: User) -> None:
        if not await self.is_host(group_id, user):
            raise AuthorizationError("Only the group head or assistant can manage the queue")

    async def _require_member(self, group_id: uuid.UUID, user: User) -> Student:
        student = await self._student(group_id, user.id)
        if not student or not student.verified:
            raise AuthorizationError("Only approved group members can use the queue")
        return student

    async def _load(self, queue_id: uuid.UUID, *, lock: bool = False) -> LabQueue:
        stmt = (
            select(LabQueue)
            .where(LabQueue.id == queue_id)
            .options(selectinload(LabQueue.entries).selectinload(LabQueueEntry.user))
        )
        if lock:
            stmt = stmt.with_for_update(of=LabQueue)
        queue = (await self.session.execute(stmt)).scalar_one_or_none()
        if not queue:
            raise NotFoundError("Queue not found")
        return queue

    # ─── Порядок ───

    @staticmethod
    def _waiting(queue: LabQueue) -> list[LabQueueEntry]:
        return sorted(
            (e for e in queue.entries if e.status == QueueEntryStatus.WAITING),
            key=lambda e: (e.position, e.created_at),
        )

    @staticmethod
    def _current(queue: LabQueue) -> LabQueueEntry | None:
        return next((e for e in queue.entries if e.status == QueueEntryStatus.CURRENT), None)

    @staticmethod
    def _renumber(entries: list[LabQueueEntry]) -> None:
        for i, e in enumerate(entries, start=1):
            e.position = i

    @staticmethod
    def _item(e: LabQueueEntry) -> queue_order.OrderItem:
        return queue_order.OrderItem(
            key=e.id, user_id=e.user_id, joined_at=e.created_at, labs=e.labs
        )

    async def _debts(self, queue: LabQueue, user_ids: list[uuid.UUID]) -> dict[object, int]:
        """Сколько лаб уже сдано по предмету в текущем семестре — для режима «должники»."""
        if queue.mode != QueueMode.DEBTORS or not queue.subject_id or not user_ids:
            return {}
        stmt = (
            select(Student.user_id, func.coalesce(SubjectSemester.done_labs, 0))
            .join(SubjectSemester, SubjectSemester.student_id == Student.id)
            .join(Semester, Semester.id == SubjectSemester.semester_id)
            .where(
                Semester.is_current.is_(True),
                SubjectSemester.subject_id == queue.subject_id,
                Student.user_id.in_(user_ids),
                Student.group_id == queue.group_id,
            )
        )
        return {uid: int(n) for uid, n in (await self.session.execute(stmt)).all()}

    def _promote_next(self, queue: LabQueue) -> LabQueueEntry | None:
        """Если никто не сдаёт — первого ожидающего вызвать к преподавателю."""
        if queue.status != QueueStatus.STARTED or self._current(queue):
            return None
        waiting = self._waiting(queue)
        if not waiting:
            return None
        nxt = waiting[0]
        nxt.status = QueueEntryStatus.CURRENT
        self._renumber(waiting[1:])
        nxt.position = 0
        return nxt

    async def _cancel_swaps(self, queue_id: uuid.UUID, entry_ids: list[uuid.UUID]) -> None:
        stmt = select(LabQueueSwap).where(
            LabQueueSwap.queue_id == queue_id,
            LabQueueSwap.status == SwapStatus.PENDING,
            (LabQueueSwap.from_entry_id.in_(entry_ids)) | (LabQueueSwap.to_entry_id.in_(entry_ids)),
        )
        for swap in (await self.session.execute(stmt)).scalars():
            swap.status = SwapStatus.CANCELLED
            swap.resolved_at = _now()

    # ─── Представление ───

    def _entry_view(self, e: LabQueueEntry, me: uuid.UUID) -> QueueEntryView:
        return QueueEntryView(
            id=e.id,
            user_id=e.user_id,
            name=(e.user.display_name if e.user else None) or "Студент",
            labs=list(e.labs or []),
            position=e.position,
            status=e.status,
            skips=e.skips,
            is_me=e.user_id == me,
            joined_at=e.created_at,
            finished_at=e.finished_at,
        )

    def _summary(self, queue: LabQueue, group_code: str, me: uuid.UUID) -> QueueSummary:
        mine = next((e for e in queue.entries if e.user_id == me), None)
        return QueueSummary(
            id=queue.id,
            group_code=group_code,
            title=queue.title,
            lesson_date=queue.lesson_date,
            start_time=queue.start_time,
            mode=queue.mode,
            status=queue.status,
            max_labs=queue.max_labs,
            waiting=sum(e.status in IN_LINE for e in queue.entries),
            done=sum(
                e.status in (QueueEntryStatus.PASSED, QueueEntryStatus.FAILED)
                for e in queue.entries
            ),
            my_position=mine.position if mine and mine.status in IN_LINE else None,
            my_status=mine.status if mine else None,
        )

    async def detail(self, queue_id: uuid.UUID, user: User) -> QueueDetail:
        queue = await self._load(queue_id)
        group = await self.session.get(Group, queue.group_id)
        assert group is not None
        is_host = await self.is_host(group.id, user)
        if not is_host:
            await self._require_member(group.id, user)

        current = self._current(queue)
        line = ([current] if current else []) + self._waiting(queue)
        finished = sorted(
            (
                e
                for e in queue.entries
                if e.status in (QueueEntryStatus.PASSED, QueueEntryStatus.FAILED)
            ),
            key=lambda e: e.finished_at or e.updated_at,
            reverse=True,
        )
        names = {
            e.id: (e.user.display_name if e.user else None) or "Студент" for e in queue.entries
        }
        mine = next((e for e in queue.entries if e.user_id == user.id), None)

        incoming: list[SwapView] = []
        outgoing: SwapView | None = None
        if mine:
            stmt = select(LabQueueSwap).where(
                LabQueueSwap.queue_id == queue.id,
                LabQueueSwap.status == SwapStatus.PENDING,
                (LabQueueSwap.from_entry_id == mine.id) | (LabQueueSwap.to_entry_id == mine.id),
            )
            for s in (await self.session.execute(stmt)).scalars():
                view = SwapView(
                    id=s.id,
                    from_entry_id=s.from_entry_id,
                    to_entry_id=s.to_entry_id,
                    from_name=names.get(s.from_entry_id, "—"),
                    to_name=names.get(s.to_entry_id, "—"),
                    status=s.status,
                    created_at=s.created_at,
                )
                if s.to_entry_id == mine.id:
                    incoming.append(view)
                else:
                    outgoing = view

        return QueueDetail(
            **self._summary(queue, group.code, user.id).model_dump(),
            is_host=is_host,
            entries=[self._entry_view(e, user.id) for e in line],
            finished=[self._entry_view(e, user.id) for e in finished],
            me=self._entry_view(mine, user.id) if mine else None,
            incoming_swaps=incoming,
            outgoing_swap=outgoing,
        )

    async def list_for_group(self, group_code: str, user: User) -> list[QueueSummary]:
        """Незакрытые очереди группы и закрытые сегодня — новые сверху."""
        group = await self._group(group_code)
        if not await self.is_host(group.id, user):
            await self._require_member(group.id, user)
        today = moscow_today()
        stmt = (
            select(LabQueue)
            .where(
                LabQueue.group_id == group.id,
                (LabQueue.status.in_(list(ACTIVE))) | (LabQueue.lesson_date >= today),
            )
            .options(selectinload(LabQueue.entries))
            .order_by(LabQueue.lesson_date.desc(), LabQueue.start_time.desc().nulls_last())
            .limit(20)
        )
        queues = (await self.session.execute(stmt)).scalars().all()
        return [self._summary(q, group.code, user.id) for q in queues]

    async def lessons_for_day(self, group_code: str, day: date, user: User) -> list[LessonOption]:
        """Пары дня, на которые староста может открыть очередь (лабораторные — первыми)."""
        from src.core.services.schedule import ScheduleService

        group = await self._group(group_code)
        await self.require_host(group.id, user)
        schedule = await ScheduleService(self.session).get_day_schedule(
            group.code, day, auto_import=False
        )
        existing = {
            q.entry_id: q.id
            for q in (
                await self.session.execute(
                    select(LabQueue).where(
                        LabQueue.group_id == group.id,
                        LabQueue.lesson_date == day,
                        LabQueue.status.in_(list(ACTIVE)),
                    )
                )
            ).scalars()
        }
        options = [
            LessonOption(
                entry_id=e.id,
                title=e.subject.name if e.subject else "Пара",
                lesson_type=e.lesson_type,
                start_time=e.start_time,
                end_time=e.end_time,
                room=e.room or e.location,
                queue_id=existing.get(e.id),
            )
            for e in schedule.entries
        ]
        return sorted(
            options, key=lambda o: ("лаб" not in (o.lesson_type or "").lower(), o.start_time)
        )

    # ─── Ведущий ───

    async def open(self, data: QueueCreate, user: User) -> QueueDetail:
        group = await self._group(data.group_code)
        await self.require_host(group.id, user)
        entry = await self.session.get(ScheduleEntry, data.entry_id)
        if not entry or entry.group_id != group.id:
            raise NotFoundError("Lesson not found in this group")
        existing = (
            await self.session.execute(
                select(LabQueue.id).where(
                    LabQueue.entry_id == entry.id,
                    LabQueue.lesson_date == data.lesson_date,
                    LabQueue.status.in_(list(ACTIVE)),
                )
            )
        ).scalar_one_or_none()
        if existing:
            raise ConflictError("Queue for this lesson is already open")
        subject = entry.subject if "subject" in entry.__dict__ else None
        if subject is None:
            from src.core.models.schedule import Subject

            subject = await self.session.get(Subject, entry.subject_id)
        queue = LabQueue(
            group_id=group.id,
            subject_id=entry.subject_id,
            entry_id=entry.id,
            lesson_date=data.lesson_date,
            start_time=entry.start_time,
            title=(subject.name if subject else "Пара")[:256],
            mode=data.mode,
            status=QueueStatus.OPEN,
            max_labs=data.max_labs,
            created_by=user.id,
        )
        self.session.add(queue)
        await self.session.commit()
        return await self.detail(queue.id, user)

    async def start(self, queue_id: uuid.UUID, user: User) -> QueueDetail:
        queue = await self._load(queue_id, lock=True)
        await self.require_host(queue.group_id, user)
        if queue.status != QueueStatus.OPEN:
            raise ConflictError("Queue has already started or is closed")
        waiting = self._waiting(queue)
        debts = await self._debts(queue, [e.user_id for e in waiting])
        by_id: dict[object, LabQueueEntry] = {e.id: e for e in waiting}
        ordered = [
            by_id[i.key]
            for i in queue_order.order_at_start([self._item(e) for e in waiting], queue.mode, debts)
        ]
        self._renumber(ordered)
        queue.status = QueueStatus.STARTED
        queue.started_at = _now()
        self._promote_next(queue)
        await self.session.commit()
        return await self.detail(queue.id, user)

    async def close(self, queue_id: uuid.UUID, user: User) -> QueueDetail:
        queue = await self._load(queue_id, lock=True)
        await self.require_host(queue.group_id, user)
        if queue.status == QueueStatus.CLOSED:
            raise ConflictError("Queue is already closed")
        queue.status = QueueStatus.CLOSED
        queue.closed_at = _now()
        await self._cancel_swaps(queue.id, [e.id for e in queue.entries])
        await self.session.commit()
        return await self.detail(queue.id, user)

    async def mark(
        self, queue_id: uuid.UUID, entry_id: uuid.UUID, result: str, user: User
    ) -> QueueDetail:
        """Результат того, кто сдаёт: passed / failed / absent (нет на месте → в конец)."""
        queue = await self._load(queue_id, lock=True)
        await self.require_host(queue.group_id, user)
        if queue.status != QueueStatus.STARTED:
            raise ConflictError("Queue has not started")
        entry = next((e for e in queue.entries if e.id == entry_id), None)
        if not entry or entry.status != QueueEntryStatus.CURRENT:
            raise ConflictError("This student is not at the desk now")

        if result == "absent":
            waiting = self._waiting(queue)
            entry.status = QueueEntryStatus.WAITING
            entry.skips += 1
            self._renumber([*waiting, entry])
        else:
            entry.status = (
                QueueEntryStatus.PASSED if result == "passed" else QueueEntryStatus.FAILED
            )
            entry.finished_at = _now()
            entry.position = 0
            if result == "passed":
                await self._count_passed(queue, entry)
        await self._cancel_swaps(queue.id, [entry.id])
        self._promote_next(queue)
        await self.session.commit()
        return await self.detail(queue.id, user)

    async def _count_passed(self, queue: LabQueue, entry: LabQueueEntry) -> None:
        """«Сдал» прибавляет сданные лабы в «Предметах» за текущий семестр."""
        if not queue.subject_id:
            return
        semester = (
            await self.session.execute(select(Semester).where(Semester.is_current.is_(True)))
        ).scalar_one_or_none()
        if not semester:
            return
        stmt = select(SubjectSemester).where(
            SubjectSemester.subject_id == queue.subject_id,
            SubjectSemester.semester_id == semester.id,
            SubjectSemester.student_id == entry.student_id,
        )
        progress = (await self.session.execute(stmt)).scalar_one_or_none()
        if progress is None:
            progress = SubjectSemester(
                subject_id=queue.subject_id, semester_id=semester.id, student_id=entry.student_id
            )
            self.session.add(progress)
            progress.done_labs = 0
        progress.done_labs = (progress.done_labs or 0) + len(entry.labs or [])
        if progress.total_labs:
            progress.done_labs = min(progress.done_labs, progress.total_labs)

    # ─── Участник ───

    def _require_active(self, queue: LabQueue) -> None:
        if queue.status not in ACTIVE:
            raise ConflictError("Queue is closed")

    def _mine(self, queue: LabQueue, user: User) -> LabQueueEntry:
        mine = next((e for e in queue.entries if e.user_id == user.id), None)
        if not mine or mine.status not in IN_LINE:
            raise NotFoundError("You are not in this queue")
        return mine

    async def join(self, queue_id: uuid.UUID, labs: list[int], user: User) -> QueueDetail:
        queue = await self._load(queue_id, lock=True)
        self._require_active(queue)
        student = await self._require_member(queue.group_id, user)
        if len(labs) > queue.max_labs:
            raise ValidationError(f"At most {queue.max_labs} labs per turn")

        mine = next((e for e in queue.entries if e.user_id == user.id), None)
        if mine and mine.status in IN_LINE:
            raise ConflictError("You are already in this queue")

        waiting = self._waiting(queue)
        if mine:  # снова встаёт после выхода или сдачи — в конец, как новый
            entry = mine
            entry.labs = labs
            entry.status = QueueEntryStatus.WAITING
            entry.finished_at = None
            entry.skips = 0
            entry.created_at = _now()
        else:
            entry = LabQueueEntry(
                queue_id=queue.id,
                user_id=user.id,
                student_id=student.id,
                labs=labs,
                status=QueueEntryStatus.WAITING,
                position=len(waiting) + 1,
                created_at=_now(),
            )
            entry.user = user
            queue.entries.append(entry)

        if queue.status == QueueStatus.STARTED:
            debts = await self._debts(queue, [e.user_id for e in [*waiting, entry]])
            idx = queue_order.insert_index(
                [self._item(e) for e in waiting], self._item(entry), queue.mode, debts
            )
            waiting.insert(idx, entry)
        else:
            waiting.append(entry)
        self._renumber(waiting)
        self._promote_next(queue)
        await self.session.commit()
        return await self.detail(queue.id, user)

    async def update_labs(self, queue_id: uuid.UUID, labs: list[int], user: User) -> QueueDetail:
        queue = await self._load(queue_id, lock=True)
        self._require_active(queue)
        if len(labs) > queue.max_labs:
            raise ValidationError(f"At most {queue.max_labs} labs per turn")
        self._mine(queue, user).labs = labs
        await self.session.commit()
        return await self.detail(queue.id, user)

    async def leave(self, queue_id: uuid.UUID, user: User) -> QueueDetail:
        queue = await self._load(queue_id, lock=True)
        self._require_active(queue)
        mine = self._mine(queue, user)
        mine.status = QueueEntryStatus.LEFT
        mine.position = 0
        await self._cancel_swaps(queue.id, [mine.id])
        self._renumber(self._waiting(queue))
        self._promote_next(queue)
        await self.session.commit()
        return await self.detail(queue.id, user)

    async def skip(self, queue_id: uuid.UUID, to_end: bool, user: User) -> QueueDetail:
        """Пропустить ход: на одно место назад или в конец. Сдающий тоже может уступить."""
        queue = await self._load(queue_id, lock=True)
        self._require_active(queue)
        mine = self._mine(queue, user)
        waiting = self._waiting(queue)
        if mine.status == QueueEntryStatus.CURRENT:
            if not waiting:
                raise ConflictError("Nobody to let ahead")
            mine.status = QueueEntryStatus.WAITING
            new_order = [waiting[0], mine, *waiting[1:]] if not to_end else [*waiting, mine]
        else:
            idx = waiting.index(mine)
            if idx == len(waiting) - 1:
                raise ConflictError("You are already last")
            rest = [e for e in waiting if e is not mine]
            new_order = [*rest, mine] if to_end else [*rest[: idx + 1], mine, *rest[idx + 1 :]]
        mine.skips += 1
        self._renumber(new_order)
        await self._cancel_swaps(queue.id, [mine.id])
        self._promote_next(queue)
        await self.session.commit()
        return await self.detail(queue.id, user)

    # ─── Обмен местами ───

    async def request_swap(
        self, queue_id: uuid.UUID, target_entry_id: uuid.UUID, user: User
    ) -> QueueDetail:
        queue = await self._load(queue_id, lock=True)
        self._require_active(queue)
        mine = self._mine(queue, user)
        target = next((e for e in queue.entries if e.id == target_entry_id), None)
        if (
            not target
            or mine.status != QueueEntryStatus.WAITING
            or target.status != QueueEntryStatus.WAITING
            or target.position >= mine.position
        ):
            raise ConflictError("You can only ask someone ahead of you who is still waiting")
        pending = (
            await self.session.execute(
                select(LabQueueSwap.id).where(
                    LabQueueSwap.from_entry_id == mine.id, LabQueueSwap.status == SwapStatus.PENDING
                )
            )
        ).first()
        if pending:
            raise ConflictError("You already have a pending swap request")
        swap = LabQueueSwap(
            queue_id=queue.id,
            from_entry_id=mine.id,
            to_entry_id=target.id,
            status=SwapStatus.PENDING,
        )
        self.session.add(swap)
        await self.session.commit()

        name = escape(user.display_name or "Одногруппник")
        await self._notify(
            target.user_id,
            f"🔁 <b>{name}</b> просит поменяться местами в очереди «{escape(queue.title)}».\n"
            f"Вы сейчас {target.position}-й, {name} — {mine.position}-й.",
            [("✅ Поменяться", f"qs:a:{swap.id.hex}"), ("❌ Нет", f"qs:d:{swap.id.hex}")],
        )
        return await self.detail(queue.id, user)

    async def respond_swap(self, swap_id: uuid.UUID, accept: bool, user: User) -> QueueDetail:
        swap = await self.session.get(LabQueueSwap, swap_id)
        if not swap:
            raise NotFoundError("Swap request not found")
        queue = await self._load(swap.queue_id, lock=True)
        entries = {e.id: e for e in queue.entries}
        to_e, from_e = entries.get(swap.to_entry_id), entries.get(swap.from_entry_id)
        if not to_e or to_e.user_id != user.id:
            raise AuthorizationError("This request is not addressed to you")
        if swap.status != SwapStatus.PENDING:
            raise ConflictError("Swap request is no longer active")

        swap.resolved_at = _now()
        ok = (
            accept
            and queue.status in ACTIVE
            and from_e is not None
            and to_e.status == QueueEntryStatus.WAITING
            and from_e.status == QueueEntryStatus.WAITING
        )
        if ok:
            assert from_e is not None
            from_e.position, to_e.position = to_e.position, from_e.position
            swap.status = SwapStatus.ACCEPTED
        else:
            swap.status = SwapStatus.DECLINED if not accept else SwapStatus.CANCELLED
        await self.session.commit()

        if from_e is not None:
            who = escape(user.display_name or "Одногруппник")
            text: Any = (
                f"✅ {who} согласился поменяться. Вы теперь {from_e.position}-й в очереди «{escape(queue.title)}»."
                if swap.status == SwapStatus.ACCEPTED
                else f"{who} не может поменяться местами в очереди «{escape(queue.title)}»."
            )
            await self._notify(from_e.user_id, text, [])
        return await self.detail(queue.id, user)
