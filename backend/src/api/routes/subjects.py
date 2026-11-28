"""Раздел «Предметы» (#165): список с фильтром по семестру, страница предмета,
работы, материалы и личный учёт."""

import uuid

from fastapi import APIRouter, Query

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.subject import (
    GradesUrlIn,
    MaterialIn,
    MaterialPatch,
    SubjectDetail,
    SubjectList,
    TagsIn,
)
from src.core.services.subject import SubjectService

router = APIRouter()


@router.get("", response_model=SubjectList)
async def list_subjects(
    user: CurrentUser,
    db: DBSession,
    group: str = Query(min_length=1, max_length=32),
    semester: int | None = Query(None, ge=1, le=12, description="По умолчанию — текущий"),
    all: bool = Query(False, description="Все семестры"),
) -> SubjectList:
    return await SubjectService(db).list_subjects(group, user, semester, all_semesters=all)


@router.get("/{subject_id}", response_model=SubjectDetail)
async def get_subject(
    subject_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
    semester: int | None = Query(None, ge=1, le=12),
) -> SubjectDetail:
    return await SubjectService(db).detail(subject_id, user, semester)


@router.post("/{subject_id}/tags", response_model=SubjectDetail)
async def add_tags(
    subject_id: uuid.UUID,
    data: TagsIn,
    user: CurrentUser,
    db: DBSession,
    semester: int | None = Query(None, ge=1, le=12),
) -> SubjectDetail:
    """Поставить теги («прога», «ИБ»…): любой подтверждённый участник."""
    return await SubjectService(db).add_tags(subject_id, data.tags, user, semester)


@router.delete("/{subject_id}/tags/{key}", response_model=SubjectDetail)
async def remove_tag(
    subject_id: uuid.UUID,
    key: str,
    user: CurrentUser,
    db: DBSession,
    semester: int | None = Query(None, ge=1, le=12),
) -> SubjectDetail:
    """Убрать тег: поставивший или ведущий."""
    return await SubjectService(db).remove_tag(subject_id, key, user, semester)


@router.put("/{subject_id}/grades-url", response_model=SubjectDetail)
async def set_grades_url(
    subject_id: uuid.UUID,
    data: GradesUrlIn,
    user: CurrentUser,
    db: DBSession,
    semester: int | None = Query(None, ge=1, le=12),
) -> SubjectDetail:
    """Ссылка на таблицу с оценками: ставит ведущий группы."""
    return await SubjectService(db).set_grades_url(subject_id, data.url, user, semester)


@router.post("/{subject_id}/materials", response_model=SubjectDetail, status_code=201)
async def add_material(
    subject_id: uuid.UUID, data: MaterialIn, user: CurrentUser, db: DBSession
) -> SubjectDetail:
    return await SubjectService(db).add_material(subject_id, data, user)


@router.patch("/materials/{material_id}", response_model=SubjectDetail)
async def update_material(
    material_id: uuid.UUID, data: MaterialPatch, user: CurrentUser, db: DBSession
) -> SubjectDetail:
    return await SubjectService(db).update_material(material_id, data, user)


@router.delete("/materials/{material_id}", response_model=SubjectDetail)
async def delete_material(
    material_id: uuid.UUID, user: CurrentUser, db: DBSession
) -> SubjectDetail:
    return await SubjectService(db).delete_material(material_id, user)


@router.post("/materials/{material_id}/approve", response_model=SubjectDetail)
async def approve_material(
    material_id: uuid.UUID, user: CurrentUser, db: DBSession
) -> SubjectDetail:
    return await SubjectService(db).approve_material(material_id, user)
