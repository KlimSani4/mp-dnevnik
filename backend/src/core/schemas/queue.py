"""Схемы очереди на сдачу лабораторных (#62)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from src.core.models.queue import QueueMode

MAX_LAB_NUMBER = 30


def _clean_labs(v: list[int]) -> list[int]:
    labs = sorted(set(v))
    if not labs:
        raise ValueError("Choose at least one lab")
    if labs[0] < 1 or labs[-1] > MAX_LAB_NUMBER:
        raise ValueError(f"Lab number must be between 1 and {MAX_LAB_NUMBER}")
    return labs


class QueueCreate(BaseModel):
    group_code: str = Field(min_length=1, max_length=32)
    entry_id: uuid.UUID
    lesson_date: date
    mode: QueueMode = QueueMode.FIRST_COME
    max_labs: int = Field(default=3, ge=1, le=5)


class QueueJoin(BaseModel):
    labs: list[int] = Field(min_length=1, max_length=5)

    _labs = field_validator("labs")(_clean_labs)


class QueueSkip(BaseModel):
    to_end: bool = False


class QueueResult(BaseModel):
    result: Literal["passed", "failed", "absent"]


class SwapCreate(BaseModel):
    target_entry_id: uuid.UUID


class QueueEntryView(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    labs: list[int]
    position: int
    status: str
    skips: int
    is_me: bool = False
    joined_at: datetime
    finished_at: datetime | None = None


class SwapView(BaseModel):
    id: uuid.UUID
    from_entry_id: uuid.UUID
    to_entry_id: uuid.UUID
    from_name: str
    to_name: str
    status: str
    created_at: datetime


class QueueSummary(BaseModel):
    id: uuid.UUID
    group_code: str
    title: str
    lesson_date: date
    start_time: time | None
    mode: str
    status: str
    max_labs: int
    waiting: int
    done: int
    my_position: int | None = None
    my_status: str | None = None


class QueueDetail(QueueSummary):
    is_host: bool
    entries: list[QueueEntryView]
    finished: list[QueueEntryView]
    me: QueueEntryView | None = None
    incoming_swaps: list[SwapView] = []
    outgoing_swap: SwapView | None = None


class LessonOption(BaseModel):
    """Пара сегодня, на которую можно открыть очередь."""

    entry_id: uuid.UUID
    title: str
    lesson_type: str | None
    start_time: time
    end_time: time
    room: str | None
    queue_id: uuid.UUID | None = None
