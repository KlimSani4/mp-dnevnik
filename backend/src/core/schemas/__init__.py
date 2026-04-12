"""Pydantic schemas for API validation and serialization."""

from src.core.schemas.assignment import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    AssignmentWithSubject,
    BulkTaskUpdate,
    BulkTaskUpdateItem,
    TaskStatusResponse,
    TaskStatusUpdate,
    TaskWithAssignment,
    VoteCreate,
    VoteResponse,
)
from src.core.schemas.dashboard import DashboardResponse, TaskProgress
from src.core.schemas.auth import (
    AuthenticatedUser,
    ExternalIdentity,
    RefreshTokenRequest,
    TelegramAuthRequest,
    TokenResponse,
)
from src.core.schemas.group import (
    GroupChatCreate,
    GroupChatResponse,
    GroupCreate,
    GroupResponse,
    GroupUpdate,
    StudentCreate,
    StudentResponse,
    StudentUpdate,
    StudentWithGroup,
)
from src.core.schemas.notification import (
    NotificationListResponse,
    NotificationPreferenceResponse,
    NotificationPreferencesResponse,
    NotificationPreferenceUpdate,
    NotificationResponse,
    NotificationSettingsUpdate,
)
from src.core.schemas.schedule import (
    DayScheduleResponse,
    OverrideCreate,
    OverrideResponse,
    ScheduleEntryCreate,
    ScheduleEntryResponse,
    ScheduleEntryUpdate,
    ScheduleEntryWithSubject,
    SubjectCreate,
    SubjectResponse,
)
from src.core.schemas.semester import (
    SemesterResponse,
    SubjectProgressResponse,
    SubjectSemesterResponse,
    SubjectSemesterUpdate,
)
from src.core.schemas.user import (
    AuditLogResponse,
    ConsentCreate,
    ConsentResponse,
    IdentityCreate,
    IdentityResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
    UserWithIdentities,
)

__all__ = [
    # Auth
    "TelegramAuthRequest",
    "TokenResponse",
    "RefreshTokenRequest",
    "AuthenticatedUser",
    "ExternalIdentity",
    # User
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserWithIdentities",
    "IdentityCreate",
    "IdentityResponse",
    "ConsentCreate",
    "ConsentResponse",
    "AuditLogResponse",
    # Group
    "GroupCreate",
    "GroupUpdate",
    "GroupResponse",
    "GroupChatCreate",
    "GroupChatResponse",
    "StudentCreate",
    "StudentUpdate",
    "StudentResponse",
    "StudentWithGroup",
    # Schedule
    "SubjectCreate",
    "SubjectResponse",
    "ScheduleEntryCreate",
    "ScheduleEntryUpdate",
    "ScheduleEntryResponse",
    "ScheduleEntryWithSubject",
    "OverrideCreate",
    "OverrideResponse",
    "DayScheduleResponse",
    # Assignment
    "AssignmentCreate",
    "AssignmentUpdate",
    "AssignmentResponse",
    "AssignmentWithSubject",
    "VoteCreate",
    "VoteResponse",
    "TaskStatusUpdate",
    "TaskStatusResponse",
    "TaskWithAssignment",
    "BulkTaskUpdate",
    "BulkTaskUpdateItem",
    # Dashboard
    "DashboardResponse",
    "TaskProgress",
    # Semester
    "SemesterResponse",
    "SubjectSemesterResponse",
    "SubjectSemesterUpdate",
    "SubjectProgressResponse",
    # Notification
    "NotificationResponse",
    "NotificationListResponse",
    "NotificationPreferenceResponse",
    "NotificationPreferencesResponse",
    "NotificationPreferenceUpdate",
    "NotificationSettingsUpdate",
]
