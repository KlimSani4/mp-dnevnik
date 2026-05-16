"""Schedule routes."""

import uuid
from datetime import UTC, date, datetime, timedelta

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

_WEEKDAY_TO_BYDAY = {1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA", 7: "SU"}


def _build_ical(group_code: str, entries: list[ScheduleEntryWithSubject]) -> str:
    """Build RFC 5545 iCalendar string for a list of schedule entries."""
    now_stamp = datetime.now(tz=UTC).strftime("%Y%m%dT%H%M%SZ")

    # Find the next occurrence of each weekday starting from the coming Monday
    today = date.today()
    # Monday of the current week
    monday = today - timedelta(days=today.weekday())

    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Nexora//Schedule Export//RU",
        f"X-WR-CALNAME:Расписание {group_code}",
        "X-WR-TIMEZONE:Europe/Moscow",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]

    for entry in entries:
        # Compute the date for the first occurrence of this weekday
        days_ahead = (entry.weekday - 1) - monday.weekday()
        if days_ahead < 0:
            days_ahead += 7
        first_date = monday + timedelta(days=days_ahead)

        dtstart = datetime(
            first_date.year,
            first_date.month,
            first_date.day,
            entry.start_time.hour,
            entry.start_time.minute,
            entry.start_time.second,
        )
        dtend = datetime(
            first_date.year,
            first_date.month,
            first_date.day,
            entry.end_time.hour,
            entry.end_time.minute,
            entry.end_time.second,
        )

        dt_fmt = "%Y%m%dT%H%M%S"
        byday = _WEEKDAY_TO_BYDAY.get(entry.weekday, "MO")

        description_parts = []
        if entry.teacher:
            description_parts.append(f"Преподаватель: {entry.teacher}")
        if entry.lesson_type:
            description_parts.append(f"Тип: {entry.lesson_type}")
        description = "\\n".join(description_parts)

        location = entry.room or entry.location or ""

        uid = f"{entry.id}@nexora.prdx.so"

        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{now_stamp}",
            f"DTSTART;TZID=Europe/Moscow:{dtstart.strftime(dt_fmt)}",
            f"DTEND;TZID=Europe/Moscow:{dtend.strftime(dt_fmt)}",
            f"RRULE:FREQ=WEEKLY;BYDAY={byday}",
            f"SUMMARY:{entry.subject.name}",
            f"LOCATION:{location}",
            f"DESCRIPTION:{description}",
            "END:VEVENT",
        ]

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


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


@router.get("/export")
async def export_ical(
    _user: CurrentUser,
    db: DBSession,
    redis: RedisClient,
    group_code: str = Query(..., description="Group code (e.g., 231-329)"),
) -> Response:
    """Export group schedule as iCalendar (.ics) file."""
    schedule_service = ScheduleService(db, redis)
    entries = await schedule_service.get_group_schedule(group_code)
    ical_content = _build_ical(group_code, entries)
    return Response(
        content=ical_content,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="schedule-{group_code}.ics"',
        },
    )
