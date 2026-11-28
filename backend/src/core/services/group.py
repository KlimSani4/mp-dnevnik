"""Group service."""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.group import Group, Student, StudentRole
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
from src.integrations.rasp_groups import resolve_group_code
from src.shared.exceptions import (
    AuthorizationError,
    ConflictError,
    ExternalServiceError,
    NotFoundError,
)

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

    async def _authorize(
        self,
        group: Group,
        user_id: uuid.UUID,
        roles: tuple[StudentRole, ...],
        message: str,
        *,
        allow_owner: bool = False,
    ) -> bool:
        """Проверить, что пользователь может управлять группой.

        Возвращает True, если право есть только как у модератора платформы: модератор
        действует в любой группе как староста, чтобы проверять и тестировать (#150).
        Такие действия пишутся в журнал с суффиксом _by_moderator.
        """
        student = await self.student_repo.get_by_user_and_group(user_id, group.id)
        # Владелец считается, только пока он в группе: после выхода (#157) он чужой
        if allow_owner and student and group.owner_id == user_id:
            return False
        if student and student.role in roles:
            return False
        user = await self.user_repo.get(user_id)
        if user and user.is_moderator:
            return True
        raise AuthorizationError(message)

    @staticmethod
    def _audit_action(action: str, by_moderator: bool) -> str:
        return f"{action}_by_moderator" if by_moderator else action

    async def _find_group(self, group_code: str) -> Group | None:
        """Группа по коду; «24a-431» находит «24А-431» через список rasp (#146)."""
        code = group_code.strip()
        group = await self.group_repo.get_by_code(code) or await self.group_repo.get_by_code(
            code.upper()
        )
        if group:
            return group
        try:
            canonical = await resolve_group_code(code)
        except ExternalServiceError:
            return None
        return await self.group_repo.get_by_code(canonical) if canonical else None

    async def _create_group(
        self,
        group_code: str,
        name: str | None,
        owner_id: uuid.UUID,
        joined_via: str,
        *,
        switch: bool = False,
    ) -> Group:
        """Создать группу с кодом из расписания rasp; создатель — подтверждённый староста.

        Код проверяется по списку групп rasp.dmami.ru: занять чужой или несуществующий
        код нельзя (#112, #146). Расписание подтягивается сразу; если rasp не ответил,
        оно подтянется автоматически при первом открытии.
        """
        code = await resolve_group_code(group_code)
        if not code:
            raise NotFoundError(f"Group {group_code.strip()} is not in the university schedule")
        if await self.group_repo.get_by_code(code):
            raise ConflictError(f"Group {code} already exists")
        await self._make_room(owner_id, None, switch=switch)

        group = await self.group_repo.create(code=code, name=name or code, owner_id=owner_id)
        await self.student_repo.create(
            user_id=owner_id,
            group_id=group.id,
            role=StudentRole.STAROSTA,
            verified=True,
            joined_via=joined_via,
        )
        await self.audit_repo.log(
            action="group_created",
            user_id=owner_id,
            resource="group",
            resource_id=str(group.id),
        )
        await self.session.commit()
        logger.info("Group created", extra={"group_id": str(group.id), "code": code})

        try:
            from src.core.services.schedule import ScheduleService
            from src.integrations.rasp_parser import fetch_group_schedule

            schedule_data = await fetch_group_schedule(code)
            if schedule_data:
                count = await ScheduleService(self.session).import_schedule(code, schedule_data)
                logger.info("Schedule imported", extra={"group_code": code, "entries": count})
        except Exception as e:  # noqa: BLE001 — группа уже создана, расписание догрузится
            await self.session.rollback()
            logger.warning("Failed to import schedule", extra={"group_code": code, "error": str(e)})
        if await self._adopt_personal_events(owner_id, group.id):
            await self.session.commit()
        return group

    async def create_group(
        self,
        data: GroupCreate,
        owner_id: uuid.UUID,
        *,
        switch: bool = False,
    ) -> GroupResponse:
        """Создать группу на сайте (#146). Создатель — староста.

        Человек состоит максимум в одной группе (#162): если он уже в группе, нужен
        switch=True — тогда он сначала выходит из неё.
        """
        group = await self._create_group(data.code, data.name, owner_id, "site", switch=switch)
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

        # Владелец, староста, заместитель или модератор платформы
        await self._authorize(
            group,
            user_id,
            (StudentRole.STAROSTA, StudentRole.DEPUTY),
            "Cannot update this group",
            allow_owner=True,
        )

        update_data = data.model_dump(exclude_unset=True)
        group = await self.group_repo.update(group, **update_data)
        await self.session.commit()

        return GroupResponse.model_validate(group)

    async def join_group(
        self,
        group_code: str,
        user_id: uuid.UUID,
        *,
        switch: bool = False,
    ) -> StudentResponse:
        """Вступить в существующую группу: заявка ждёт старосту.

        Группу больше не создаёт молча (#146): для этого есть create_group. Если человек
        уже в другой группе — 409 ALREADY_IN_GROUP, а с switch=True он из неё выходит (#162).
        """
        group = await self._find_group(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")

        await self._make_room(user_id, group.id, switch=switch)
        existing = await self.student_repo.get_by_user_and_group(user_id, group.id)
        if existing:
            raise ConflictError("Already a member of this group", code="ALREADY_MEMBER")

        student = await self.student_repo.create(
            user_id=user_id,
            group_id=group.id,
            role=StudentRole.STUDENT,
            verified=False,
            joined_via="site",
        )
        await self._adopt_personal_events(user_id, group.id, student)

        await self.audit_repo.log(
            action="group_joined",
            user_id=user_id,
            resource="group",
            resource_id=str(group.id),
        )
        await self.session.commit()
        # updated_at обновляет база: без refresh pydantic лезет за ним лениво и
        # падает на MissingGreenlet — «Подтвердить» отвечал 500 (#150)
        await self.session.refresh(student)

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

        by_moderator = await self._authorize(
            group,
            verifier_id,
            (StudentRole.STAROSTA, StudentRole.DEPUTY),
            "Only starosta can verify students",
        )

        # Get target student
        student = await self.student_repo.get_by_user_and_group(target_user_id, group.id)
        if not student:
            raise NotFoundError("Student not found in this group")

        student = await self.student_repo.verify_student(student)

        await self.audit_repo.log(
            action=self._audit_action("student_verified", by_moderator),
            user_id=verifier_id,
            resource="student",
            resource_id=str(student.id),
        )
        await self.session.commit()
        # updated_at обновляет база: без refresh pydantic лезет за ним лениво и
        # падает на MissingGreenlet — «Подтвердить» отвечал 500 (#150)
        await self.session.refresh(student)

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

        by_moderator = await self._authorize(
            group,
            reviewer_id,
            (StudentRole.STAROSTA, StudentRole.DEPUTY),
            "Only starosta can reject students",
        )

        student = await self.student_repo.get_by_user_and_group(target_user_id, group.id)
        if not student:
            raise NotFoundError("Student not found in this group")
        if student.verified:
            raise ConflictError("Student is already verified")

        await self.student_repo.delete(student)
        await self.audit_repo.log(
            action=self._audit_action("student_rejected", by_moderator),
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
        *,
        switch: bool = False,
    ) -> StudentResponse:
        """Вступить в группу из бота; если группы ещё нет — создать её (создатель — староста).

        Создать можно только группу из расписания rasp (#146). Повторный ввод своей
        группы ничего не меняет.
        """
        from src.core.repositories.user import IdentityRepository

        identity = await IdentityRepository(self.session).get_by_external("telegram", telegram_id)
        if not identity:
            raise NotFoundError("User not registered. Use /start first.")

        group = await self._find_group(group_code)
        if not group:
            group = await self._create_group(
                group_code, None, identity.user_id, "bot", switch=switch
            )
            student = await self.student_repo.get_by_user_and_group(identity.user_id, group.id)
            assert student is not None
            await self.session.refresh(student)
            return StudentResponse.model_validate(student)

        existing = await self.student_repo.get_by_user_and_group(identity.user_id, group.id)
        if existing:
            return StudentResponse.model_validate(existing)

        await self._make_room(identity.user_id, group.id, switch=switch)
        student = await self.student_repo.create(
            user_id=identity.user_id,
            group_id=group.id,
            role=StudentRole.STUDENT,
            verified=False,
            joined_via="bot",
        )
        await self._adopt_personal_events(identity.user_id, group.id, student)
        await self.audit_repo.log(
            action="group_joined",
            user_id=identity.user_id,
            resource="group",
            resource_id=str(group.id),
        )
        await self.session.commit()
        await self.session.refresh(student)
        logger.info("User joined group via Telegram", extra={"group_code": group.code})
        return StudentResponse.model_validate(student)

    async def leave_group(self, group_code: str, user_id: uuid.UUID) -> None:
        """Выйти из группы (#157).

        Удаляются данные участника в этой группе: статусы заданий и прогресс по
        предметам (каскадом), правки пар этой группы. Личные события («встретить маму»)
        остаются — они принадлежат человеку, а не группе (#162). Если уходит последний
        староста, старостой становится заместитель (самый давний); если заместителя нет,
        группа остаётся без старосты — назначить его может модератор (#159).
        """
        group = await self._find_group(group_code)
        if not group:
            raise NotFoundError(f"Group {group_code} not found")
        await self._lock_user(user_id)
        student = await self.student_repo.get_by_user_and_group(user_id, group.id)
        if not student:
            raise NotFoundError("You are not a member of this group")
        await self._leave(student, group, user_id)
        await self.session.commit()

    async def _lock_user(self, user_id: uuid.UUID) -> None:
        """Строка пользователя под FOR UPDATE: два одновременных вступления не дадут
        оказаться сразу в двух группах (#162)."""
        from sqlalchemy import select

        from src.core.models.user import User

        await self.session.execute(select(User.id).where(User.id == user_id).with_for_update())

    async def _make_room(
        self, user_id: uuid.UUID, target_group_id: uuid.UUID | None, *, switch: bool
    ) -> None:
        """Одна группа на человека (#162).

        Если человек уже в другой группе: без switch — 409 ALREADY_IN_GROUP с кодом
        текущей группы, со switch — выход из неё (как leave_group, без commit).
        """
        await self._lock_user(user_id)
        others = [
            s
            for s in await self.student_repo.get_user_students(user_id)
            if s.group_id != target_group_id
        ]
        if not others:
            return
        if not switch:
            raise ConflictError(
                f"Already in group {others[0].group.code}",
                code="ALREADY_IN_GROUP",
                current_group=others[0].group.code,
            )
        for student in others:
            await self._leave(student, student.group, user_id)

    async def _leave(self, student: Student, group: Group, user_id: uuid.UUID) -> None:
        from sqlalchemy import delete, select, update

        from src.core.models.group import Student
        from src.core.models.schedule import OverrideScope, OverrideType, ScheduleOverride

        was_starosta = student.role == StudentRole.STAROSTA
        # Личные события остаются у человека: отвязываем от участника группы.
        await self.session.execute(
            update(ScheduleOverride)
            .where(
                ScheduleOverride.student_id == student.id,
                ScheduleOverride.scope == OverrideScope.PERSONAL,
                ScheduleOverride.override_type == OverrideType.ADD,
            )
            .values(student_id=None)
        )
        # Правки пар этой группы (скрыть пару, заметка к паре) к другой группе не относятся
        await self.session.execute(
            delete(ScheduleOverride).where(ScheduleOverride.student_id == student.id)
        )
        await self.student_repo.delete(student)

        successor: Student | None = None
        if was_starosta:
            others = (
                (
                    await self.session.execute(
                        select(Student)
                        .where(Student.group_id == group.id, Student.verified.is_(True))
                        .order_by(Student.created_at)
                    )
                )
                .scalars()
                .all()
            )
            if not any(o.role == StudentRole.STAROSTA for o in others):
                successor = next((o for o in others if o.role == StudentRole.DEPUTY), None)
                if successor:
                    successor.role = StudentRole.STAROSTA
        if group.owner_id == user_id and successor:
            group.owner_id = successor.user_id

        await self.audit_repo.log(
            action="group_left",
            user_id=user_id,
            resource="group",
            resource_id=str(group.id),
        )
        logger.info(
            "User left group",
            extra={"group_code": group.code, "new_starosta": bool(successor)},
        )

    async def _adopt_personal_events(
        self, user_id: uuid.UUID, group_id: uuid.UUID, student: Student | None = None
    ) -> int:
        """Перенести личные события человека в новую группу (#162).

        Личное событие хранится как ADD-переопределение, привязанное к какой-нибудь паре
        группы (entry_id обязателен). При смене группы перевязываем его на пару новой
        группы — иначе оно пропадёт, когда старая группа обновит расписание, и не попадёт
        в напоминания. Если у новой группы ещё нет пар, события видны и так (их читают по
        автору), а перевяжутся при следующей смене.
        """
        from sqlalchemy import select, update

        from src.core.models.schedule import (
            OverrideScope,
            OverrideType,
            ScheduleEntry,
            ScheduleOverride,
        )

        anchor = (
            await self.session.execute(
                select(ScheduleEntry.id)
                .where(ScheduleEntry.group_id == group_id)
                .order_by(ScheduleEntry.weekday, ScheduleEntry.pair_number)
                .limit(1)
            )
        ).scalar_one_or_none()
        if student is None:
            student = await self.student_repo.get_by_user_and_group(user_id, group_id)
        values: dict[str, object] = {"student_id": student.id if student else None}
        if anchor:
            values["entry_id"] = anchor
        result = await self.session.execute(
            update(ScheduleOverride)
            .where(
                ScheduleOverride.author_id == user_id,
                ScheduleOverride.scope == OverrideScope.PERSONAL,
                ScheduleOverride.override_type == OverrideType.ADD,
            )
            .values(**values)
        )
        return int(getattr(result, "rowcount", 0) or 0)

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

        by_moderator = await self._authorize(
            group,
            admin_id,
            (StudentRole.STAROSTA,),
            "Only owner or starosta can change roles",
            allow_owner=True,
        )

        student = await self.student_repo.get_by_user_and_group(target_user_id, group.id)
        if not student:
            raise NotFoundError("Student not found in this group")

        if role == StudentRole.STAROSTA:
            # Старосту назначает только модератор платформы (#159). Староста в группе
            # один: прежний становится заместителем. Неподтверждённый — подтверждается.
            admin = await self.user_repo.get(admin_id)
            if not (admin and admin.is_moderator):
                raise AuthorizationError("Only a platform moderator can appoint a starosta")
            by_moderator = True
            for other in await self.student_repo.get_group_students_with_users(group.id):
                if other.id != student.id and other.role == StudentRole.STAROSTA:
                    other.role = StudentRole.DEPUTY
            student.verified = True
            # Владелец без членства в группе (вышел, #157) передаёт права новому старосте
            if not await self.student_repo.get_by_user_and_group(group.owner_id, group.id):
                group.owner_id = student.user_id
        elif not student.verified:
            raise ConflictError("Verify the student before changing the role")

        student = await self.student_repo.set_role(student, role)

        await self.audit_repo.log(
            action=self._audit_action("role_changed", by_moderator),
            user_id=admin_id,
            resource="student",
            resource_id=str(student.id),
        )
        await self.session.commit()
        # updated_at обновляет база: без refresh pydantic лезет за ним лениво и
        # падает на MissingGreenlet — «Подтвердить» отвечал 500 (#150)
        await self.session.refresh(student)

        return StudentResponse.model_validate(student)
