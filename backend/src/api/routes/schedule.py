"""Schedule routes."""

import uuid
from datetime import date

from fastapi import APIRouter, Query, Response

from src.api.deps import CurrentUser, CurrentUserOptional, DBSession, RedisClient
from src.core.schemas.schedule import (
    DayScheduleResponse,
    OverrideCreate,
    OverrideResponse,
    ScheduleEntryWithSubject,
)
from src.core.services.schedule import ScheduleService

router = APIRouter()


@router.get("", response_model=list[DayScheduleResponse])
async def get_schedule(
    db: DBSession,
    redis: RedisClient,
    user: CurrentUserOptional,
    group: str = Query(..., description="Group code (e.g., 231-329)"),
    start_date: date | None = Query(None, description="Week start date (defaults to current week)"),
) -> list[DayScheduleResponse]:
    """Get week schedule for a group."""
    schedule_service = ScheduleService(db, redis)
    return await schedule_service.get_week_schedule(
        group,
        start_date,
        user_id=user.id if user else None,
    )


@router.get("/day/{target_date}", response_model=DayScheduleResponse)
async def get_day_schedule(
    target_date: date,
    db: DBSession,
    redis: RedisClient,
    user: CurrentUserOptional,
    group: str = Query(..., description="Group code"),
) -> DayScheduleResponse:
    """Get schedule for a specific day."""
    schedule_service = ScheduleService(db, redis)
    return await schedule_service.get_day_schedule(
        group,
        target_date,
        user_id=user.id if user else None,
    )


@router.get("/group/{code}", response_model=list[ScheduleEntryWithSubject])
async def get_group_full_schedule(
    code: str,
    db: DBSession,
    redis: RedisClient,
) -> list[ScheduleEntryWithSubject]:
    """Get full schedule for a group (all days)."""
    schedule_service = ScheduleService(db, redis)
    return await schedule_service.get_group_schedule(code)


@router.post("/override", response_model=OverrideResponse, status_code=201)
async def create_override(
    data: OverrideCreate,
    user: CurrentUser,
    db: DBSession,
) -> OverrideResponse:
    """Create schedule override (cancellation, online mode, etc.)."""
    schedule_service = ScheduleService(db)
    override = await schedule_service.create_override(
        data.entry_id,
        scope=data.scope,
        override_type=data.override_type,
        value=data.value,
        target_date=data.target_date,
        author_id=user.id,
    )
    return OverrideResponse.model_validate(override)


@router.delete("/override/{override_id}", status_code=204)
async def delete_override(
    override_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> Response:
    """Delete schedule override."""
    schedule_service = ScheduleService(db)
    await schedule_service.delete_override(override_id, user.id)
    return Response(status_code=204)
