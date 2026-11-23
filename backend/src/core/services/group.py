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
    StudentWithContact,
    StudentWithGroup,
)
from src.core.schemas.schedule import SubjectCreate, SubjectRequirementsUpdate, SubjectResponse
from src.core.telegram_contact import telegram_contact
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
            joined_via="site",
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

    async def reject_student(
        self,
        group_code: str,
        target_user_id: uuid.UUID,
        reviewer_id: uuid.UUID,
    ) -> None:
        """Отклонить заявку в группу: удалить неподтверждённого участника (#148)."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        reviewer = await self.student_repo.get_by_user_and_group(reviewer_id, group.id)
        if not reviewer or reviewer.role not in (StudentRole.STAROSTA, StudentRole.DEPUTY):
            raise AuthorizationError("Only starosta can reject students")

        student = await self.student_repo.get_by_user_and_group(target_user_id, group.id)
        if not student:
            raise NotFoundError("Student not found in this group")
        if student.verified:
            raise ConflictError("Student is already verified")

        await self.student_repo.delete(student)
        await self.audit_repo.log(
            action="student_rejected",
            user_id=reviewer_id,
            resource="student",
            resource_id=str(student.id),
        )
        await self.session.commit()

    async def get_group_students_with_users(self, group_code: str) -> list[StudentWithContact]:
        """Участники и заявки группы с контактом Telegram — для старосты (#148).

        Сначала неподтверждённые заявки, затем участники, по дате вступления.
        """
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")
        students = await self.student_repo.get_group_students_with_users(group.id)
        out: list[StudentWithContact] = []
        for s in students:
            item = StudentWithContact.model_validate(s)
            item.telegram = telegram_contact(s.user.identities)
            out.append(item)
        return out

    async def get_user_groups(self, user_id: uuid.UUID) -> list[StudentWithGroup]:
        """Get all groups user is member of."""
        students = await self.student_repo.get_user_students(user_id)
        return [StudentWithGroup.model_validate(s) for s in students]

    async def get_group_subjects(
        self, group_code: str, viewer_id: uuid.UUID | None = None
    ) -> list[SubjectResponse]:
        """Предметы группы; личные предметы — только их владельцу (#101)."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")
        subjects = await self.subject_repo.get_group_subjects(group.id, viewer_id)
        return [SubjectResponse.model_validate(s) for s in subjects]

    async def create_custom_subject(
        self,
        group_code: str,
        data: SubjectCreate,
        user_id: uuid.UUID,
    ) -> SubjectResponse:
        """Личный предмет пользователя в группе: виден только ему (#101)."""
        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        # User must be a member
        student = await self.student_repo.get_by_user_and_group(user_id, group.id)
        if not student:
            raise AuthorizationError("Not a member of this group")

        subject = await self.subject_repo.create(
            name=data.name,
            group_id=group.id,
            is_custom=True,
            owner_id=user_id,
        )
        await self.session.commit()

        logger.info(
            "Custom subject created",
            extra={"subject_id": str(subject.id), "group_code": group_code},
        )

        return SubjectResponse.model_validate(subject)

    async def update_subject_requirements(
        self,
        group_code: str,
        subject_id: uuid.UUID,
        data: SubjectRequirementsUpdate,
        _user_id: uuid.UUID,
    ) -> "GroupResponse":
        """Update assignment requirements for a subject in group settings JSON."""
        from src.core.schemas.group import GroupResponse

        group = await self.group_repo.get_by_code(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        settings = dict(group.settings or {})
        requirements = dict(settings.get("subject_requirements", {}))

        subject_key = str(subject_id)
        entry = dict(requirements.get(subject_key, {}))

        if data.total is not None:
            entry["total"] = data.total
        if data.type_breakdown is not None:
            entry["type_breakdown"] = data.type_breakdown

        requirements[subject_key] = entry
        settings["subject_requirements"] = requirements

        group = await self.group_repo.update(group, settings=settings)
        await self.session.commit()

        return GroupResponse.model_validate(group)

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
            existing = await self.student_repo.get_by_user_and_group(identity.user_id, group.id)
            if existing:
                return StudentResponse.model_validate(existing)

            # Join as student
            student = await self.student_repo.create(
                user_id=identity.user_id,
                group_id=group.id,
                role=StudentRole.STUDENT,
                verified=False,
                joined_via="bot",
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
