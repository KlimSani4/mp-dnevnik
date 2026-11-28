"""Раздел «Предметы» (#165): список с фильтром по семестру, страница предмета,
работы, материалы и личный учёт."""

import uuid

from fastapi import APIRouter, Query

from src.api.deps import CurrentUser, DBSession
from src.core.schemas.subject import (
    MaterialIn,
    MaterialPatch,
    ProgressIn,
    SubjectDetail,
    SubjectList,
    WorkIn,
    WorkPatch,
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


@router.post("/{subject_id}/works", response_model=SubjectDetail, status_code=201)
async def add_work(
    subject_id: uuid.UUID, data: WorkIn, user: CurrentUser, db: DBSession
) -> SubjectDetail:
    """Добавить работу. От ведущего — сразу, от участника — на проверку."""
    return await SubjectService(db).add_work(subject_id, data, user)


@router.patch("/works/{work_id}", response_model=SubjectDetail)
async def update_work(
    work_id: uuid.UUID, data: WorkPatch, user: CurrentUser, db: DBSession
) -> SubjectDetail:
    return await SubjectService(db).update_work(work_id, data, user)


@router.delete("/works/{work_id}", response_model=SubjectDetail)
async def delete_work(work_id: uuid.UUID, user: CurrentUser, db: DBSession) -> SubjectDetail:
    return await SubjectService(db).delete_work(work_id, user)


@router.post("/works/{work_id}/approve", response_model=SubjectDetail)
async def approve_work(work_id: uuid.UUID, user: CurrentUser, db: DBSession) -> SubjectDetail:
    return await SubjectService(db).approve_work(work_id, user)


@router.put("/works/{work_id}/progress", response_model=SubjectDetail)
async def set_progress(
    work_id: uuid.UUID, data: ProgressIn, user: CurrentUser, db: DBSession
) -> SubjectDetail:
    """Личная отметка: сдал и сколько баллов получил."""
    return await SubjectService(db).set_progress(work_id, data, user)


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
