"""API routes."""

from src.api.routes import (
    assignments,
    auth,
    dashboard,
    groups,
    health,
    internal,
    notifications,
    schedule,
    semesters,
    tasks,
    users,
)

__all__ = [
    "health",
    "auth",
    "users",
    "groups",
    "schedule",
    "assignments",
    "tasks",
    "dashboard",
    "semesters",
    "notifications",
    "internal",
]
