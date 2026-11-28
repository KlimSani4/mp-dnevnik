"""Схемы раздела «Предметы» (#165)."""

import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from src.core.models.subject_content import MaterialKind, WorkKind


class SemesterOption(BaseModel):
    number: int
    course: int
    autumn: bool
    is_current: bool
    subjects: int


class DeadlineView(BaseModel):
    title: str
    date: date
    kind: str  # work / assignment
    work_id: uuid.UUID | None = None
    assignment_id: uuid.UUID | None = None


class SubjectSummary(BaseModel):
    """Карточка предмета в списке."""

    id: uuid.UUID
    name: str
    is_custom: bool
    teachers: list[str]
    lesson_types: list[str]
    first_semester: int | None
    last_semester: int | None
    works_total: int
    works_passed: int
    points: float
    max_points: float
    required: int | None
    materials: int
    pending: int
    next_deadline: DeadlineView | None


class SubjectList(BaseModel):
    group_code: str
    current_semester: int | None
    selected_semester: int | None
    semesters: list[SemesterOption]
    subjects: list[SubjectSummary]


def _clean_url(v: str | None) -> str | None:
    if v is None or not v.strip():
        return None
    HttpUrl(v.strip())  # только http(s)-ссылки, без javascript: и прочего
    return v.strip()


class WorkIn(BaseModel):
    kind: WorkKind = WorkKind.LAB
    number: int | None = Field(None, ge=0, le=999)
    title: str = Field(min_length=1, max_length=255)
    max_points: float | None = Field(None, ge=0, le=1000)
    deadline: date | None = None
    description: str | None = Field(None, max_length=4000)
    url: str | None = Field(None, max_length=1024)
    semester: int | None = Field(None, ge=1, le=12)

    _url = field_validator("url")(_clean_url)


class WorkPatch(BaseModel):
    kind: WorkKind | None = None
    number: int | None = Field(None, ge=0, le=999)
    title: str | None = Field(None, min_length=1, max_length=255)
    max_points: float | None = Field(None, ge=0, le=1000)
    deadline: date | None = None
    description: str | None = Field(None, max_length=4000)
    url: str | None = Field(None, max_length=1024)

    _url = field_validator("url")(_clean_url)


class MaterialIn(BaseModel):
    kind: MaterialKind = MaterialKind.THEORY
    title: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1, max_length=1024)
    lecture_date: date | None = None
    semester: int | None = Field(None, ge=1, le=12)

    _url = field_validator("url")(_clean_url)


class MaterialPatch(BaseModel):
    kind: MaterialKind | None = None
    title: str | None = Field(None, min_length=1, max_length=255)
    url: str | None = Field(None, max_length=1024)
    lecture_date: date | None = None

    _url = field_validator("url")(_clean_url)


class ProgressIn(BaseModel):
    passed: bool
    points: float | None = Field(None, ge=0, le=1000)


class WorkView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    number: int | None
    title: str
    max_points: float | None
    deadline: date | None
    description: str | None
    url: str | None
    semester: int | None
    status: str
    author_name: str | None
    is_mine: bool
    passed: bool
    points: float | None


class MaterialView(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    url: str | None
    lecture_date: date | None
    semester: int | None
    status: str
    author_name: str | None
    is_mine: bool


class ScheduleSlot(BaseModel):
    weekday: int
    pair_number: int
    start_time: time
    end_time: time
    lesson_type: str | None
    room: str | None
    location: str | None
    teacher: str | None
    link: str | None


class LectureLink(BaseModel):
    title: str
    url: str
    source: str  # schedule / material
    lecture_date: date | None = None


class SubjectDetail(SubjectSummary):
    group_code: str | None
    can_moderate: bool
    schedule: list[ScheduleSlot]
    works: list[WorkView]
    materials_list: list[MaterialView]
    lectures: list[LectureLink]
    deadlines: list[DeadlineView]
    required_left: int | None
