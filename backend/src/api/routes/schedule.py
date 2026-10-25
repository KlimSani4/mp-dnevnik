"""Schedule routes."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response

from src.api.deps import CurrentUser, CurrentUserOptional, DBSession, RedisClient
from src.api.rate_limit import user_rate_limit
from src.core.ics import build_ics, count_events
from src.core.schemas.schedule import (
    DayScheduleResponse,
    OverrideCreate,
    OverrideResponse,
    ScheduleEntryWithSubject,
)
from src.core.services.schedule import ScheduleService
from src.shared.exceptions import NotFoundError

router = APIRouter()

DEFAULT_EXPORT_WEEKS = 18  # примерно семестр
MAX_EXPORT_WEEKS = 26


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


@router.post(
    "/override",
    response_model=OverrideResponse,
    status_code=201,
    dependencies=[Depends(user_rate_limit("override_create", 30))],
)
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


@router.get("/overrides/my", response_model=list[OverrideResponse])
async def get_my_overrides(
    user: CurrentUser,
    db: DBSession,
) -> list[OverrideResponse]:
    """Get all overrides created by the current user."""
    schedule_service = ScheduleService(db)
    overrides = await schedule_service.get_user_overrides(user.id)
    return [OverrideResponse.model_validate(o) for o in overrides]


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


@router.get("/export", dependencies=[Depends(user_rate_limit("schedule_export", 6))])
async def export_ical(
    user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
    group_code: str = Query(..., description="Group code (e.g., 231-329)"),
    start_date: date | None = Query(
        None, description="Any date of the first exported week (defaults to current week)"
    ),
    weeks: int = Query(
        DEFAULT_EXPORT_WEEKS,
        ge=1,
        le=MAX_EXPORT_WEEKS,
        description="How many weeks to export",
    ),
) -> Response:
    """Export schedule as an iCalendar (.ics) file (one-off download, no subscription).

    Every lesson becomes a separate event on its real date, so week parity, date ranges,
    cancellations and the user's personal overrides are already applied.
    """
    schedule_service = ScheduleService(db, redis)
    days = await schedule_service.get_schedule_range(
        group_code,
        start_date,
        weeks,
        user_id=user.id,
    )
    if count_events(days) == 0:
        raise NotFoundError("В расписании группы пока нет занятий для экспорта")

    return Response(
        content=build_ics(group_code, days),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="schedule-{group_code}.ics"',
        },
    )
