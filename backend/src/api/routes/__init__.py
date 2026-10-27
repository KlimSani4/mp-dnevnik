"""API routes."""

from src.api.routes import (
    assignments,
    auth,
    dashboard,
    groups,
    health,
    internal,
    moderation,
    notifications,
    schedule,
    semesters,
    support,
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
    "moderation",
    "support",
]
