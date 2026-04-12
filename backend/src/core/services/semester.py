"""Semester service."""

import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.repositories.group import StudentRepository
from src.core.repositories.schedule import ScheduleEntryRepository, SubjectRepository
from src.core.repositories.semester import SemesterRepository, SubjectSemesterRepository
from src.core.schemas.semester import SubjectProgressResponse
from src.shared.exceptions import NotFoundError

logger = logging.getLogger(__name__)


class SemesterService:
    """Semester and subject progress management service."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.semester_repo = SemesterRepository(session)
        self.subject_semester_repo = SubjectSemesterRepository(session)
        self.student_repo = StudentRepository(session)
        self.subject_repo = SubjectRepository(session)
        self.entry_repo = ScheduleEntryRepository(session)

    async def get_current_semester_subjects(
        self,
        user_id: uuid.UUID,
        group_id: uuid.UUID,
    ) -> list[SubjectProgressResponse]:
        """Получить предметы текущего семестра с прогрессом для студента."""
        # Найти текущий семестр
        semester = await self.semester_repo.get_current()
        if not semester:
            raise NotFoundError("Текущий семестр не найден")

        # Найти студента в группе
        student = await self.student_repo.get_by_user_and_group(user_id, group_id)
        if not student:
            raise NotFoundError("Студент не найден в группе")

        # Получить привязки предметов к семестру для данного студента
        subject_semesters = await self.subject_semester_repo.get_student_semester_subjects(
            student.id, semester.id
        )

        # Собрать информацию о преподавателях из расписания
        entries = await self.entry_repo.get_group_schedule(
            group_id, with_subject=True
        )
        # Маппинг subject_id -> teacher (берём первого встреченного преподавателя)
        teacher_map: dict[uuid.UUID, str | None] = {}
        for entry in entries:
            if entry.subject_id not in teacher_map and entry.teacher:
                teacher_map[entry.subject_id] = entry.teacher

        result = []
        for ss in subject_semesters:
            subject = ss.subject
            result.append(
                SubjectProgressResponse(
                    subject_id=subject.id,
                    subject_name=subject.name,
                    short_name=subject.short_name,
                    teacher=teacher_map.get(subject.id),
                    total_labs=ss.total_labs,
                    done_labs=ss.done_labs,
                    total_pz=ss.total_pz,
                    done_pz=ss.done_pz,
                    control_type=ss.control_type,
                )
            )

        return result
