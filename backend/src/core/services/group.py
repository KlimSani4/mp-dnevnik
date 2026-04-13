"""Group service."""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.group import StudentRole
from src.core.repositories.group import GroupChatRepository, GroupRepository, StudentRepository
from src.core.repositories.schedule import SubjectRepository
from src.core.repositories.user import AuditLogRepository, UserRepository
from src.core.schemas.group import (
    GroupCreate,
    GroupResponse,
    GroupUpdate,
    StudentResponse,
    StudentWithGroup,
)
from src.core.schemas.schedule import SubjectResponse
from src.shared.exceptions import AuthorizationError, ConflictError, NotFoundError

logger = logging.getLogger(__name__)


class GroupService:
    """Group management service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.group_repo = GroupRepository(session)
        self.chat_repo = GroupChatRepository(session)
        self.student_repo = StudentRepository(session)
        self.subject_repo = SubjectRepository(session)
        self.user_repo = UserRepository(session)
        self.audit_repo = AuditLogRepository(session)

    async def create_group(
        self,
        data: GroupCreate,
        owner_id: uuid.UUID,
    ) -> GroupResponse:
        """Create new group."""
        # Check if group code already exists
        existing = await self.group_repo.get_by_code(data.code)
        if existing:
            raise ConflictError(f"Group {data.code} already exists")

        group = await self.group_repo.create(
            code=data.code,
            name=data.name,
            owner_id=owner_id,
        )

        # Creator becomes starosta
        await self.student_repo.create(
            user_id=owner_id,
            group_id=group.id,
            role=StudentRole.STAROSTA,
            verified=True,
        )

        await self.audit_repo.log(
            action="group_created",
            user_id=owner_id,
            resource="group",
            resource_id=str(group.id),
        )
        await self.session.commit()

        logger.info(
            "Group created",
            extra={"group_id": str(group.id), "code": data.code},
        )

        return GroupResponse.model_validate(group)

    async def get_group(self, group_code: str) -> GroupResponse:
        """Get group by code."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")
        return GroupResponse.model_validate(group)

    async def list_groups(
        self,
        *,
        search: str | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> list[GroupResponse]:
        """List groups with optional search."""
        if search:
            groups = await self.group_repo.search_by_code(search, limit=limit)
        else:
            groups = await self.group_repo.list(offset=offset, limit=limit)
        return [GroupResponse.model_validate(g) for g in groups]

    async def update_group(
        self,
        group_code: str,
        data: GroupUpdate,
        user_id: uuid.UUID,
    ) -> GroupResponse:
        """Update group settings."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        # Only owner or starosta can update
        if group.owner_id != user_id:
            student = await self.student_repo.get_by_user_and_group(user_id, group.id)
            if not student or student.role not in (StudentRole.STAROSTA, StudentRole.DEPUTY):
                raise AuthorizationError("Cannot update this group")

        update_data = data.model_dump(exclude_unset=True)
        group = await self.group_repo.update(group, **update_data)
        await self.session.commit()

        return GroupResponse.model_validate(group)

    async def join_group(
        self,
        group_code: str,
        user_id: uuid.UUID,
    ) -> StudentResponse:
        """Join a group."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            # Auto-create group on first join
            group = await self.group_repo.create(code=group_code, name=group_code, owner_id=user_id)

        # Check if already member
        existing = await self.student_repo.get_by_user_and_group(user_id, group.id)
        if existing:
            raise ConflictError("Already a member of this group")

        student = await self.student_repo.create(
            user_id=user_id,
            group_id=group.id,
            role=StudentRole.STUDENT,
            verified=False,
        )

        await self.audit_repo.log(
            action="group_joined",
            user_id=user_id,
            resource="group",
            resource_id=str(group.id),
        )
        await self.session.commit()

        return StudentResponse.model_validate(student)

    async def verify_student(
        self,
        group_code: str,
        target_user_id: uuid.UUID,
        verifier_id: uuid.UUID,
    ) -> StudentResponse:
        """Verify student membership."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        # Check verifier is starosta
        verifier = await self.student_repo.get_by_user_and_group(verifier_id, group.id)
        if not verifier or verifier.role not in (StudentRole.STAROSTA, StudentRole.DEPUTY):
            raise AuthorizationError("Only starosta can verify students")

        # Get target student
        student = await self.student_repo.get_by_user_and_group(target_user_id, group.id)
        if not student:
            raise NotFoundError("Student not found in this group")

        student = await self.student_repo.verify_student(student)

        await self.audit_repo.log(
            action="student_verified",
            user_id=verifier_id,
            resource="student",
            resource_id=str(student.id),
        )
        await self.session.commit()

        return StudentResponse.model_validate(student)

    async def get_user_groups(self, user_id: uuid.UUID) -> list[StudentWithGroup]:
        """Get all groups user is member of."""
        students = await self.student_repo.get_user_students(user_id)
        return [StudentWithGroup.model_validate(s) for s in students]

    async def get_group_subjects(self, group_code: str) -> list[SubjectResponse]:
        """Get all subjects for a group."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")
        subjects = await self.subject_repo.get_group_subjects(group.id)
        return [SubjectResponse.model_validate(s) for s in subjects]

    async def join_group_by_telegram(
        self,
        telegram_id: str,
        group_code: str,
    ) -> StudentResponse:
        """Join group by Telegram ID. Creates group if not exists."""
        from src.core.repositories.user import IdentityRepository
        from src.core.services.schedule import ScheduleService
        from src.integrations.rasp_parser import fetch_group_schedule

        identity_repo = IdentityRepository(self.session)

        # Find user by telegram identity
        identity = await identity_repo.get_by_external("telegram", telegram_id)
        if not identity:
            raise NotFoundError("User not registered. Use /start first.")

        # Get or create group
        group = await self.group_repo.get_by_code(group_code)
        need_import = False

        if not group:
            # Create group with this user as owner
            group = await self.group_repo.create(
                code=group_code,
                name=None,
                owner_id=identity.user_id,
            )
            # Creator becomes starosta
            student = await self.student_repo.create(
                user_id=identity.user_id,
                group_id=group.id,
                role=StudentRole.STAROSTA,
                verified=True,
            )
            need_import = True
            logger.info(
                "Group created via Telegram",
                extra={"group_code": group_code, "telegram_id": telegram_id},
            )
        else:
            # Check if already member
            existing = await self.student_repo.get_by_user_and_group(
                identity.user_id, group.id
            )
            if existing:
                return StudentResponse.model_validate(existing)

            # Join as student
            student = await self.student_repo.create(
                user_id=identity.user_id,
                group_id=group.id,
                role=StudentRole.STUDENT,
                verified=False,
            )
            logger.info(
                "User joined group via Telegram",
                extra={"group_code": group_code, "telegram_id": telegram_id},
            )

        # Import schedule for new group
        if need_import:
            try:
                schedule_data = await fetch_group_schedule(group_code)
                if schedule_data:
                    schedule_service = ScheduleService(self.session)
                    count = await schedule_service.import_schedule(group_code, schedule_data)
                    logger.info(
                        "Schedule imported",
                        extra={"group_code": group_code, "entries": count},
                    )
            except Exception as e:
                logger.warning(
                    "Failed to import schedule",
                    extra={"group_code": group_code, "error": str(e)},
                )

        return StudentResponse.model_validate(student)

    async def set_student_role(
        self,
        group_code: str,
        target_user_id: uuid.UUID,
        role: StudentRole,
        admin_id: uuid.UUID,
    ) -> StudentResponse:
        """Set student role (by starosta or owner)."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        # Check permissions
        if group.owner_id != admin_id:
            admin_student = await self.student_repo.get_by_user_and_group(admin_id, group.id)
            if not admin_student or admin_student.role != StudentRole.STAROSTA:
                raise AuthorizationError("Only owner or starosta can change roles")

        student = await self.student_repo.get_by_user_and_group(target_user_id, group.id)
        if not student:
            raise NotFoundError("Student not found in this group")

        student = await self.student_repo.set_role(student, role)

        await self.audit_repo.log(
            action="role_changed",
            user_id=admin_id,
            resource="student",
            resource_id=str(student.id),
        )
        await self.session.commit()

        return StudentResponse.model_validate(student)
