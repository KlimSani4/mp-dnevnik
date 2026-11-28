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
    queues,
    schedule,
    semesters,
    subjects,
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
    "queues",
    "subjects",
    "internal",
    "moderation",
    "support",
]
