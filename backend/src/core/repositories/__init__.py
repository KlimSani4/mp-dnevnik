"""Repository layer for database operations."""

from src.core.repositories.assignment import (
    AssignmentRepository,
    AssignmentVoteRepository,
    TaskStatusRepository,
)
from src.core.repositories.base import BaseRepository
from src.core.repositories.group import GroupChatRepository, GroupRepository, StudentRepository
from src.core.repositories.schedule import (
    ScheduleEntryRepository,
    ScheduleOverrideRepository,
    SubjectRepository,
)
from src.core.repositories.user import (
    AuditLogRepository,
    ConsentRepository,
    IdentityRepository,
    UserRepository,
)

__all__ = [
    "BaseRepository",
    # User
    "UserRepository",
    "IdentityRepository",
    "AuditLogRepository",
    "ConsentRepository",
    # Group
    "GroupRepository",
    "GroupChatRepository",
    "StudentRepository",
    # Schedule
    "SubjectRepository",
    "ScheduleEntryRepository",
    "ScheduleOverrideRepository",
    # Assignment
    "AssignmentRepository",
    "AssignmentVoteRepository",
    "TaskStatusRepository",
]
