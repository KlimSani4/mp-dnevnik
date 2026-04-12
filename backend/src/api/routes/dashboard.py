"""Dashboard routes."""

import uuid
from datetime import date

from fastapi import APIRouter, Query

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.dashboard import DashboardResponse
from src.core.services.assignment import AssignmentService
from src.core.services.schedule import ScheduleService

router = APIRouter()


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    user: CurrentUser,
    db: DBSession,
    group_id: uuid.UUID = Query(..., description="Group ID"),
    group_code: str = Query(..., description="Group code for schedule"),
) -> DashboardResponse:
    """Get aggregated dashboard data."""
    schedule_service = ScheduleService(db)
    assignment_service = AssignmentService(db)

    today = date.today()
    today_schedule = await schedule_service.get_day_schedule(
        group_code, today, user_id=user.id
    )
    burning_tasks = await assignment_service.get_upcoming_deadlines(group_id, days=7)
    progress = await assignment_service.get_task_progress(user.id, group_id)

    return DashboardResponse(
        today_schedule=today_schedule,
        burning_tasks=burning_tasks,
        progress=progress,
    )
