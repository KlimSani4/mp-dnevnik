"""Semester routes."""

import uuid

from fastapi import APIRouter, Query

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.semester import SubjectProgressResponse
from src.core.services.semester import SemesterService

router = APIRouter()


@router.get("/semester", response_model=list[SubjectProgressResponse])
async def get_semester_subjects(
    user: CurrentUser,
    db: DBSession,
    group_id: uuid.UUID = Query(..., description="Group ID"),
) -> list[SubjectProgressResponse]:
    """Получить предметы текущего семестра с прогрессом и допуском."""
    semester_service = SemesterService(db)
    return await semester_service.get_current_semester_subjects(user.id, group_id)
