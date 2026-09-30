"""Dashboard schemas."""

from pydantic import BaseModel

from src.core.schemas.assignment import AssignmentWithSubject
from src.core.schemas.schedule import DayScheduleResponse


class TaskProgress(BaseModel):
    """Task progress counters."""

    total: int
    done: int
    doing: int
    review: int
    todo: int


class DashboardResponse(BaseModel):
    """Aggregated dashboard response."""

    today_schedule: DayScheduleResponse
    burning_tasks: list[AssignmentWithSubject]
    progress: TaskProgress
