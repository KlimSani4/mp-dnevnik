"""Database models."""

from src.core.models.assignment import Assignment, AssignmentVote, TaskState, TaskStatus
from src.core.models.base import Base, TimestampMixin, UUIDMixin
from src.core.models.group import Group, GroupChat, Student, StudentRole
from src.core.models.schedule import (
    OverrideScope,
    OverrideType,
    ScheduleEntry,
    ScheduleOverride,
    Subject,
)
from src.core.models.user import AuditLog, ConsentRecord, Identity, User

__all__ = [
    # Base
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    # User
    "User",
    "Identity",
    "AuditLog",
    "ConsentRecord",
    # Group
    "Group",
    "GroupChat",
    "Student",
    "StudentRole",
    # Schedule
    "Subject",
    "ScheduleEntry",
    "ScheduleOverride",
    "OverrideScope",
    "OverrideType",
    # Assignment
    "Assignment",
    "AssignmentVote",
    "TaskStatus",
    "TaskState",
]
