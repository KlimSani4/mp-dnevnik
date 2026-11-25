"""Очередь на сдачу лабораторных (#62).

Основной канал — Telegram-бот (/queue), сайт работает с теми же данными.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Query

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.queue import (
    LessonOption,
    QueueCreate,
    QueueDetail,
    QueueJoin,
    QueueResult,
    QueueSkip,
    QueueSummary,
    SwapCreate,
)
from src.core.services.queue import LabQueueService

router = APIRouter()

MOSCOW_TZ = timezone(timedelta(hours=3))


def _svc(db: DBSession) -> LabQueueService:
    return LabQueueService(db)


@router.get("", response_model=list[QueueSummary])
async def list_queues(
    user: CurrentUser, db: DBSession, group: str = Query(min_length=1, max_length=32)
) -> list[QueueSummary]:
    """Открытые очереди группы и закрытые сегодня."""
    return await _svc(db).list_for_group(group, user)


@router.get("/lessons", response_model=list[LessonOption])
async def lessons_for_day(
    user: CurrentUser,
    db: DBSession,
    group: str = Query(min_length=1, max_length=32),
    day: date | None = Query(default=None, alias="date"),
) -> list[LessonOption]:
    """Пары дня, на которые ведущий может открыть очередь."""
    return await _svc(db).lessons_for_day(group, day or datetime.now(MOSCOW_TZ).date(), user)


@router.post("", response_model=QueueDetail, status_code=201)
async def open_queue(data: QueueCreate, user: CurrentUser, db: DBSession) -> QueueDetail:
    return await _svc(db).open(data, user)


@router.get("/{queue_id}", response_model=QueueDetail)
async def get_queue(queue_id: uuid.UUID, user: CurrentUser, db: DBSession) -> QueueDetail:
    return await _svc(db).detail(queue_id, user)


@router.post("/{queue_id}/start", response_model=QueueDetail)
async def start_queue(queue_id: uuid.UUID, user: CurrentUser, db: DBSession) -> QueueDetail:
    return await _svc(db).start(queue_id, user)


@router.post("/{queue_id}/close", response_model=QueueDetail)
async def close_queue(queue_id: uuid.UUID, user: CurrentUser, db: DBSession) -> QueueDetail:
    return await _svc(db).close(queue_id, user)


@router.post("/{queue_id}/join", response_model=QueueDetail)
async def join_queue(
    queue_id: uuid.UUID, data: QueueJoin, user: CurrentUser, db: DBSession
) -> QueueDetail:
    return await _svc(db).join(queue_id, data.labs, user)


@router.patch("/{queue_id}/me", response_model=QueueDetail)
async def update_my_labs(
    queue_id: uuid.UUID, data: QueueJoin, user: CurrentUser, db: DBSession
) -> QueueDetail:
    return await _svc(db).update_labs(queue_id, data.labs, user)


@router.delete("/{queue_id}/me", response_model=QueueDetail)
async def leave_queue(queue_id: uuid.UUID, user: CurrentUser, db: DBSession) -> QueueDetail:
    return await _svc(db).leave(queue_id, user)


@router.post("/{queue_id}/skip", response_model=QueueDetail)
async def skip_turn(
    queue_id: uuid.UUID, data: QueueSkip, user: CurrentUser, db: DBSession
) -> QueueDetail:
    """Пропустить одного вперёд (to_end=false) или уйти в конец очереди."""
    return await _svc(db).skip(queue_id, data.to_end, user)


@router.post("/{queue_id}/entries/{entry_id}/result", response_model=QueueDetail)
async def mark_result(
    queue_id: uuid.UUID, entry_id: uuid.UUID, data: QueueResult, user: CurrentUser, db: DBSession
) -> QueueDetail:
    return await _svc(db).mark(queue_id, entry_id, data.result, user)


@router.post("/{queue_id}/swaps", response_model=QueueDetail, status_code=201)
async def request_swap(
    queue_id: uuid.UUID, data: SwapCreate, user: CurrentUser, db: DBSession
) -> QueueDetail:
    return await _svc(db).request_swap(queue_id, data.target_entry_id, user)


@router.post("/swaps/{swap_id}/accept", response_model=QueueDetail)
async def accept_swap(swap_id: uuid.UUID, user: CurrentUser, db: DBSession) -> QueueDetail:
    return await _svc(db).respond_swap(swap_id, True, user)


@router.post("/swaps/{swap_id}/decline", response_model=QueueDetail)
async def decline_swap(swap_id: uuid.UUID, user: CurrentUser, db: DBSession) -> QueueDetail:
    return await _svc(db).respond_swap(swap_id, False, user)
