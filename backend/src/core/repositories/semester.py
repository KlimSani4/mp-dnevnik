"""Semester and subject progress repositories."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.models.semester import Semester, SubjectSemester
from src.core.repositories.base import BaseRepository


class SemesterRepository(BaseRepository[Semester]):
    """Semester repository."""

    model = Semester

    async def get_current(self) -> Semester | None:
        """Получить текущий семестр."""
        stmt = select(Semester).where(Semester.is_current.is_(True))
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_all(self) -> list[Semester]:
        """Получить все семестры, отсортированные по дате начала."""
        stmt = select(Semester).order_by(Semester.start_date.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class SubjectSemesterRepository(BaseRepository[SubjectSemester]):
    """Subject-semester progress repository."""

    model = SubjectSemester

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_student_semester_subjects(
        self,
        student_id: uuid.UUID,
        semester_id: uuid.UUID,
    ) -> list[SubjectSemester]:
        """Получить все предметы студента в семестре с загруженными subject."""
        stmt = (
            select(SubjectSemester)
            .where(
                SubjectSemester.student_id == student_id,
                SubjectSemester.semester_id == semester_id,
            )
            .options(selectinload(SubjectSemester.subject))
            .order_by(SubjectSemester.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_subject_and_student(
        self,
        subject_id: uuid.UUID,
        semester_id: uuid.UUID,
        student_id: uuid.UUID,
    ) -> SubjectSemester | None:
        """Получить запись прогресса по предмету для конкретного студента."""
        stmt = select(SubjectSemester).where(
            SubjectSemester.subject_id == subject_id,
            SubjectSemester.semester_id == semester_id,
            SubjectSemester.student_id == student_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
