"""API routes."""

from src.api.routes import assignments, auth, groups, health, schedule, tasks, users

__all__ = [
    "health",
    "auth",
    "users",
    "groups",
    "schedule",
    "assignments",
    "tasks",
]
