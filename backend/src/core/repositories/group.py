"""Group and Student repositories."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.models.group import Group, GroupChat, Student, StudentRole
from src.core.repositories.base import BaseRepository


class GroupRepository(BaseRepository[Group]):
    """Group repository."""

    model = Group

    async def get_by_code(self, code: str) -> Group | None:
        """Get group by code (e.g., '231-329')."""
        stmt = select(Group).where(Group.code == code)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_with_students(self, group_id: uuid.UUID) -> Group | None:
        """Get group with students loaded."""
        stmt = select(Group).where(Group.id == group_id).options(selectinload(Group.students))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_groups(self) -> list[Group]:
        """Get all groups."""
        result = await self.session.execute(select(Group))
        return list(result.scalars().all())

    async def search_by_code(self, code_prefix: str, limit: int = 10) -> list[Group]:
        """Search groups by code prefix."""
        stmt = select(Group).where(Group.code.ilike(f"{code_prefix}%")).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class GroupChatRepository(BaseRepository[GroupChat]):
    """Group chat repository."""

    model = GroupChat

    async def get_by_chat(self, provider: str, chat_id: str) -> GroupChat | None:
        """Get group chat by provider and chat ID."""
        stmt = select(GroupChat).where(
            GroupChat.provider == provider,
            GroupChat.chat_id == chat_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_group_chats(self, group_id: uuid.UUID) -> list[GroupChat]:
        """Get all chats for a group."""
        stmt = select(GroupChat).where(GroupChat.group_id == group_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class StudentRepository(BaseRepository[Student]):
    """Student repository."""

    model = Student

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_user_and_group(
        self, user_id: uuid.UUID, group_id: uuid.UUID
    ) -> Student | None:
        """Get student by user and group."""
        stmt = select(Student).where(
            Student.user_id == user_id,
            Student.group_id == group_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_students(self, user_id: uuid.UUID) -> list[Student]:
        """Get all student records for a user (multi-group support)."""
        stmt = (
            select(Student).where(Student.user_id == user_id).options(selectinload(Student.group))
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_group_students(
        self,
        group_id: uuid.UUID,
        *,
        verified_only: bool = False,
    ) -> list[Student]:
        """Get all students in a group."""
        stmt = select(Student).where(Student.group_id == group_id)
        if verified_only:
            stmt = stmt.where(Student.verified.is_(True))
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_starostas(self, group_id: uuid.UUID) -> list[Student]:
        """Get starostas and deputies for a group."""
        stmt = select(Student).where(
            Student.group_id == group_id,
            Student.role.in_([StudentRole.STAROSTA, StudentRole.DEPUTY]),
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def verify_student(self, student: Student) -> Student:
        """Verify student membership."""
        student.verified = True
        await self.session.flush()
        return student

    async def set_role(self, student: Student, role: StudentRole) -> Student:
        """Set student role."""
        student.role = role
        await self.session.flush()
        return student
