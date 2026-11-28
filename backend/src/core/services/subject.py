"""Раздел «Предметы» (#165): семестры, работы, материалы, личный учёт.

Кто что может:
- смотреть — участники группы (и с неподтверждённой заявкой: расписание они тоже
  видят) и модератор платформы; личный предмет — только его владелец;
- добавлять работы и материалы — любой подтверждённый участник: от старосты,
  заместителя или помощника (и модератора) — сразу видно всем, от остальных — после
  подтверждения ведущим. Автор видит своё предложение с пометкой «на проверке»;
- править и удалять — ведущий; автор — пока предложение не подтверждено;
- отметки «сдал» и баллы — личные, у каждого свои.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.academic import course_of, is_autumn, term_for
from src.core.models.assignment import Assignment, TaskStatus
from src.core.models.group import Group, Student, StudentRole
from src.core.models.schedule import ScheduleEntry, Subject
from src.core.models.subject_content import (
    ContentStatus,
    MaterialKind,
    SubjectMaterial,
    SubjectTag,
    SubjectWork,
    SubjectWorkProgress,
    WorkKind,
)
from src.core.models.user import User
from src.core.repositories.schedule import entry_applies_on
from src.core.schemas.subject import (
    DeadlineView,
    LectureLink,
    MaterialIn,
    MaterialPatch,
    MaterialView,
    ProgressIn,
    ScheduleSlot,
    SemesterOption,
    SubjectDetail,
    SubjectList,
    SubjectSummary,
    TagCount,
    TagView,
    WorkIn,
    WorkPatch,
    WorkView,
)
from src.shared.exceptions import AuthorizationError, NotFoundError

HOST_ROLES = {StudentRole.STAROSTA, StudentRole.DEPUTY, StudentRole.ASSISTANT}

# Подсказки тегов: с чего начать, если в группе тегов ещё нет (#165)
TAG_PRESETS = [
    "прога",
    "ИБ",
    "основа основ",
    "архитектура",
    "сети",
    "математика",
    "алгоритмы",
    "базы данных",
    "веб",
    "железо",
    "проект",
    "гуманитарка",
    "язык",
    "физра",
    "экзамен",
    "зачёт",
]
MAX_TAGS = 12


def normalize_tag(raw: str) -> tuple[str, str] | None:
    """(как показывать, ключ). «#ИБ » → («ИБ», «иб»); пустое — None."""
    tag = " ".join(raw.strip().lstrip("#").split())[:32].strip()
    return (tag, tag.lower()) if tag else None


def moscow_today() -> date:
    return (datetime.now(UTC) + timedelta(hours=3)).date()


@dataclass
class Viewer:
    user: User
    group: Group | None
    is_host: bool
    current_semester: int | None
    can_write: bool = True

    def require_write(self) -> None:
        if not self.can_write:
            raise AuthorizationError("Your group request is not approved yet", code="NOT_VERIFIED")


def _in_semester(item_semester: int | None, selected: int | None) -> bool:
    return selected is None or item_semester is None or item_semester == selected


def _subject_in_semester(subject: Subject, selected: int | None) -> bool:
    if selected is None or subject.first_semester is None:
        return True
    last = subject.last_semester or subject.first_semester
    return subject.first_semester <= selected <= last


class SubjectService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ─── Доступ ───

    async def _viewer_for_group(self, group: Group, user: User) -> Viewer:
        student = (
            await self.session.execute(
                select(Student).where(Student.user_id == user.id, Student.group_id == group.id)
            )
        ).scalar_one_or_none()
        if student is None and not user.is_moderator:
            raise AuthorizationError("Only group members can see subjects", code="NOT_MEMBER")
        verified = bool(student and student.verified)
        is_host = user.is_moderator or bool(verified and student and student.role in HOST_ROLES)
        term = term_for(group.code, moscow_today())
        return Viewer(
            user,
            group,
            is_host,
            term.semester if term else None,
            can_write=verified or user.is_moderator,
        )

    async def _subject_viewer(self, subject_id: uuid.UUID, user: User) -> tuple[Subject, Viewer]:
        subject = await self.session.get(Subject, subject_id)
        if not subject:
            raise NotFoundError("Subject not found")
        if subject.owner_id is not None:
            if subject.owner_id != user.id:
                raise NotFoundError("Subject not found")
            group = await self.session.get(Group, subject.group_id) if subject.group_id else None
            term = term_for(group.code, moscow_today()) if group else None
            return subject, Viewer(user, group, True, term.semester if term else None)
        if subject.group_id is None:
            raise NotFoundError("Subject not found")
        group = await self.session.get(Group, subject.group_id)
        assert group is not None
        return subject, await self._viewer_for_group(group, user)

    # ─── Список ───

    async def list_subjects(
        self, group_code: str, user: User, semester: int | None = None, all_semesters: bool = False
    ) -> SubjectList:
        group = (
            await self.session.execute(select(Group).where(Group.code == group_code))
        ).scalar_one_or_none()
        if not group:
            raise NotFoundError(f"Group {group_code} not found")
        viewer = await self._viewer_for_group(group, user)

        subjects = list(
            (
                await self.session.execute(
                    select(Subject)
                    .where(
                        Subject.group_id == group.id,
                        or_(Subject.owner_id.is_(None), Subject.owner_id == user.id),
                    )
                    .order_by(Subject.name)
                )
            )
            .scalars()
            .all()
        )

        selected = None if all_semesters else (semester or viewer.current_semester)
        options = self._semester_options(subjects, viewer.current_semester)
        if selected is not None and options and selected not in {o.number for o in options}:
            selected = viewer.current_semester
        shown = [s for s in subjects if _subject_in_semester(s, selected)]

        data = await self._collect([s.id for s in shown], viewer, selected)
        summaries = [self._summary(s, viewer, data) for s in shown]
        group_tags = await self._group_tags([s.id for s in subjects])
        used = {t.key for t in group_tags}
        return SubjectList(
            can_write=viewer.can_write,
            group_tags=group_tags,
            tag_suggestions=[p for p in TAG_PRESETS if p.lower() not in used],
            group_code=group.code,
            current_semester=viewer.current_semester,
            selected_semester=selected,
            semesters=options,
            subjects=summaries,
        )

    async def _group_tags(self, subject_ids: list[uuid.UUID]) -> list[TagCount]:
        """Все теги предметов группы (за все семестры) с числом предметов."""
        if not subject_ids:
            return []
        counts: dict[str, list[Any]] = {}
        for t in (
            await self.session.execute(
                select(SubjectTag)
                .where(SubjectTag.subject_id.in_(subject_ids))
                .order_by(SubjectTag.created_at)
            )
        ).scalars():
            counts.setdefault(t.key, [t.tag, 0])[1] += 1
        return sorted(
            (TagCount(tag=v[0], key=k, count=v[1]) for k, v in counts.items()),
            key=lambda x: (-x.count, x.key),
        )

    @staticmethod
    def _semester_options(subjects: list[Subject], current: int | None) -> list[SemesterOption]:
        counts: dict[int, int] = defaultdict(int)
        for s in subjects:
            if s.first_semester is None:
                continue
            for n in range(s.first_semester, (s.last_semester or s.first_semester) + 1):
                counts[n] += 1
        if current is not None:
            counts.setdefault(current, 0)
        return [
            SemesterOption(
                number=n,
                course=course_of(n),
                autumn=is_autumn(n),
                is_current=n == current,
                subjects=counts[n],
            )
            for n in sorted(counts)
        ]

    async def _collect(
        self, subject_ids: list[uuid.UUID], viewer: Viewer, selected: int | None
    ) -> dict[str, Any]:
        """Всё, что нужно для карточек и страниц предметов, одним набором запросов."""
        if not subject_ids:
            return {
                "works": {},
                "materials": {},
                "progress": {},
                "entries": {},
                "assignments": {},
                "tags": {},
            }
        visible = or_(
            SubjectWork.status == ContentStatus.APPROVED,
            *([] if not viewer.is_host else [SubjectWork.status == ContentStatus.PENDING]),
            SubjectWork.author_id == viewer.user.id,
        )
        works = (
            (
                await self.session.execute(
                    select(SubjectWork)
                    .where(SubjectWork.subject_id.in_(subject_ids), visible)
                    .order_by(SubjectWork.kind, SubjectWork.number.nulls_last(), SubjectWork.title)
                )
            )
            .scalars()
            .all()
        )
        works = [w for w in works if _in_semester(w.semester, selected)]
        visible_m = or_(
            SubjectMaterial.status == ContentStatus.APPROVED,
            *([] if not viewer.is_host else [SubjectMaterial.status == ContentStatus.PENDING]),
            SubjectMaterial.author_id == viewer.user.id,
        )
        materials = (
            (
                await self.session.execute(
                    select(SubjectMaterial)
                    .where(SubjectMaterial.subject_id.in_(subject_ids), visible_m)
                    .order_by(
                        SubjectMaterial.kind,
                        SubjectMaterial.lecture_date.nulls_last(),
                        SubjectMaterial.created_at,
                    )
                )
            )
            .scalars()
            .all()
        )
        materials = [m for m in materials if _in_semester(m.semester, selected)]

        progress: dict[uuid.UUID, SubjectWorkProgress] = {}
        if works:
            for p in (
                await self.session.execute(
                    select(SubjectWorkProgress).where(
                        SubjectWorkProgress.user_id == viewer.user.id,
                        SubjectWorkProgress.work_id.in_([w.id for w in works]),
                    )
                )
            ).scalars():
                progress[p.work_id] = p

        entries = (
            (
                await self.session.execute(
                    select(ScheduleEntry)
                    .where(ScheduleEntry.subject_id.in_(subject_ids))
                    .order_by(ScheduleEntry.weekday, ScheduleEntry.pair_number)
                )
            )
            .scalars()
            .all()
        )
        now = datetime.now(UTC)
        assignments = (
            (
                await self.session.execute(
                    select(Assignment).where(
                        Assignment.subject_id.in_(subject_ids),
                        Assignment.deadline >= now,
                        or_(
                            Assignment.is_personal.is_(False),
                            Assignment.author_id == viewer.user.id,
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )
        # Баллы за задания с максимумом: в сумму баллов предмета (#165)
        my_students = select(Student.id).where(Student.user_id == viewer.user.id)
        scored: dict[uuid.UUID, list[tuple[float, float | None]]] = defaultdict(list)
        for subject_id, max_points, got in (
            await self.session.execute(
                select(Assignment.subject_id, Assignment.max_points, TaskStatus.points)
                .outerjoin(
                    TaskStatus,
                    (TaskStatus.assignment_id == Assignment.id)
                    & TaskStatus.student_id.in_(my_students),
                )
                .where(
                    Assignment.subject_id.in_(subject_ids),
                    Assignment.max_points.is_not(None),
                    or_(
                        Assignment.is_personal.is_(False),
                        Assignment.author_id == viewer.user.id,
                    ),
                )
            )
        ).all():
            scored[subject_id].append((max_points, got))
        authors: dict[uuid.UUID, str] = {}
        author_ids: set[uuid.UUID] = {w.author_id for w in works if w.author_id} | {
            m.author_id for m in materials if m.author_id
        }
        if author_ids:
            for uid, name in (
                await self.session.execute(
                    select(User.id, User.display_name).where(User.id.in_(author_ids))
                )
            ).all():
                authors[uid] = name

        def by_subject(items: list[Any]) -> dict[uuid.UUID, list[Any]]:
            out: dict[uuid.UUID, list[Any]] = defaultdict(list)
            for it in items:
                out[it.subject_id].append(it)
            return out

        tags = (
            (
                await self.session.execute(
                    select(SubjectTag)
                    .where(SubjectTag.subject_id.in_(subject_ids))
                    .order_by(SubjectTag.created_at)
                )
            )
            .scalars()
            .all()
        )
        return {
            "tags": by_subject(list(tags)),
            "works": by_subject(works),
            "materials": by_subject(materials),
            "progress": progress,
            "entries": by_subject(list(entries)),
            "assignments": by_subject(list(assignments)),
            "scored": scored,
            "authors": authors,
        }

    def _required(self, viewer: Viewer, subject_id: uuid.UUID) -> int | None:
        if not viewer.group:
            return None
        reqs = (viewer.group.settings or {}).get("subject_requirements", {})
        total = (reqs.get(str(subject_id)) or {}).get("total")
        return int(total) if isinstance(total, int | float) else None

    def _deadlines(self, subject_id: uuid.UUID, data: dict[str, Any]) -> list[DeadlineView]:
        today = moscow_today()
        out = [
            DeadlineView(title=w.title, date=w.deadline, kind="work", work_id=w.id)
            for w in data["works"].get(subject_id, [])
            if w.deadline and w.deadline >= today and w.status == ContentStatus.APPROVED
        ]
        out += [
            DeadlineView(
                title=a.title,
                date=(a.deadline + timedelta(hours=3)).date(),
                kind="assignment",
                assignment_id=a.id,
            )
            for a in data["assignments"].get(subject_id, [])
            if a.deadline
        ]
        return sorted(out, key=lambda d: d.date)

    def _summary(self, subject: Subject, viewer: Viewer, data: dict[str, Any]) -> SubjectSummary:
        works = [w for w in data["works"].get(subject.id, []) if w.status == ContentStatus.APPROVED]
        progress = data["progress"]
        passed = [w for w in works if (p := progress.get(w.id)) and p.passed]
        points = sum((progress[w.id].points or 0) for w in works if w.id in progress)
        entries = data["entries"].get(subject.id, [])
        pending = sum(
            1
            for x in [*data["works"].get(subject.id, []), *data["materials"].get(subject.id, [])]
            if x.status == ContentStatus.PENDING
        )
        scored = data.get("scored", {}).get(subject.id, [])
        deadlines = self._deadlines(subject.id, data)
        return SubjectSummary(
            id=subject.id,
            name=subject.name,
            is_custom=subject.is_custom,
            grades_url=subject.grades_url,
            tags=[
                TagView(
                    tag=t.tag,
                    key=t.key,
                    can_remove=viewer.is_host or t.author_id == viewer.user.id,
                )
                for t in data["tags"].get(subject.id, [])
            ],
            teachers=sorted({e.teacher for e in entries if e.teacher}),
            lesson_types=sorted({e.lesson_type for e in entries if e.lesson_type}),
            first_semester=subject.first_semester,
            last_semester=subject.last_semester,
            works_total=len(works),
            works_passed=len(passed),
            points=round(points + sum(got or 0 for _, got in scored), 2),
            max_points=round(sum(w.max_points or 0 for w in works) + sum(m for m, _ in scored), 2),
            required=self._required(viewer, subject.id),
            materials=sum(
                1
                for m in data["materials"].get(subject.id, [])
                if m.status == ContentStatus.APPROVED
            ),
            pending=pending if viewer.is_host else 0,
            next_deadline=deadlines[0] if deadlines else None,
        )

    # ─── Страница предмета ───

    async def detail(
        self, subject_id: uuid.UUID, user: User, semester: int | None = None
    ) -> SubjectDetail:
        subject, viewer = await self._subject_viewer(subject_id, user)
        data = await self._collect([subject.id], viewer, semester)
        summary = self._summary(subject, viewer, data)
        authors: dict[uuid.UUID, str] = data.get("authors", {})
        progress = data["progress"]

        works = [
            WorkView(
                id=w.id,
                kind=w.kind,
                number=w.number,
                title=w.title,
                max_points=w.max_points,
                deadline=w.deadline,
                description=w.description,
                url=w.url,
                semester=w.semester,
                status=w.status,
                author_name=authors.get(w.author_id) if w.author_id else None,
                is_mine=w.author_id == user.id,
                passed=bool(progress.get(w.id) and progress[w.id].passed),
                points=progress[w.id].points if w.id in progress else None,
            )
            for w in data["works"].get(subject.id, [])
        ]
        materials = [
            MaterialView(
                id=m.id,
                kind=m.kind,
                title=m.title,
                url=m.url,
                lecture_date=m.lecture_date,
                semester=m.semester,
                status=m.status,
                author_name=authors.get(m.author_id) if m.author_id else None,
                is_mine=m.author_id == user.id,
            )
            for m in data["materials"].get(subject.id, [])
        ]
        entries = data["entries"].get(subject.id, [])
        slots = sorted(
            {
                (
                    e.weekday,
                    e.pair_number,
                    e.date_from,
                    e.date_to,
                    e.week_parity,
                    e.lesson_type,
                ): ScheduleSlot(
                    weekday=e.weekday,
                    pair_number=e.pair_number,
                    start_time=e.start_time,
                    end_time=e.end_time,
                    lesson_type=e.lesson_type,
                    room=e.room,
                    location=e.location,
                    teacher=e.teacher,
                    link=e.external_link,
                    date_from=_first_lesson(e),
                    date_to=_last_lesson(e),
                    week_parity=e.week_parity if e.week_parity in ("odd", "even") else None,
                )
                for e in entries
                if e.weekday
            }.values(),
            key=lambda s: (s.weekday, s.pair_number, s.date_from or date.min),
        )
        lectures: list[LectureLink] = []
        seen: set[str] = set()
        for e in entries:
            if e.external_link and e.external_link not in seen:
                seen.add(e.external_link)
                label = " · ".join(x for x in (e.lesson_type, e.teacher) if x) or subject.name
                lectures.append(LectureLink(title=label, url=e.external_link, source="schedule"))
        for m in materials:
            if m.kind in (MaterialKind.LECTURE, MaterialKind.RECORDING) and m.url:
                lectures.append(
                    LectureLink(
                        title=m.title,
                        url=m.url,
                        source="material",
                        lecture_date=m.lecture_date,
                        material=m,
                    )
                )

        required = summary.required
        labs_passed = sum(
            1
            for w in works
            if w.passed and w.kind == WorkKind.LAB and w.status == ContentStatus.APPROVED
        )
        return SubjectDetail(
            **summary.model_dump(),
            group_code=viewer.group.code if viewer.group else None,
            can_moderate=viewer.is_host,
            can_write=viewer.can_write,
            schedule=slots,
            works=works,
            materials_list=[
                m for m in materials if m.kind not in (MaterialKind.LECTURE, MaterialKind.RECORDING)
            ],
            lectures=lectures,
            deadlines=self._deadlines(subject.id, data),
            required_left=max(0, required - labs_passed) if required is not None else None,
        )

    # ─── Теги ───

    async def add_tags(
        self, subject_id: uuid.UUID, tags: list[str], user: User, semester: int | None = None
    ) -> SubjectDetail:
        """Поставить теги. Уже стоящие (без учёта регистра) пропускаются."""
        subject, viewer = await self._subject_viewer(subject_id, user)
        viewer.require_write()
        existing = {
            t.key
            for t in (
                await self.session.execute(
                    select(SubjectTag).where(SubjectTag.subject_id == subject.id)
                )
            ).scalars()
        }
        for raw in tags:
            norm = normalize_tag(raw)
            if not norm or norm[1] in existing:
                continue
            if len(existing) >= MAX_TAGS:
                break
            existing.add(norm[1])
            self.session.add(
                SubjectTag(subject_id=subject.id, tag=norm[0], key=norm[1], author_id=user.id)
            )
        await self.session.commit()
        return await self.detail(subject.id, user, semester)

    async def remove_tag(
        self, subject_id: uuid.UUID, key: str, user: User, semester: int | None = None
    ) -> SubjectDetail:
        subject, viewer = await self._subject_viewer(subject_id, user)
        norm = normalize_tag(key)
        tag = (
            (
                await self.session.execute(
                    select(SubjectTag).where(
                        SubjectTag.subject_id == subject.id, SubjectTag.key == norm[1]
                    )
                )
            ).scalar_one_or_none()
            if norm
            else None
        )
        if not tag:
            raise NotFoundError("Tag not found")
        if not (viewer.is_host or tag.author_id == user.id):
            raise AuthorizationError("Only the author or the group head can remove a tag")
        await self.session.delete(tag)
        await self.session.commit()
        return await self.detail(subject.id, user, semester)

    # ─── Таблица с оценками ───

    async def set_grades_url(
        self, subject_id: uuid.UUID, url: str | None, user: User, semester: int | None = None
    ) -> SubjectDetail:
        """Ссылку ставит ведущий (староста/зам/модератор) или владелец своего предмета."""
        subject, viewer = await self._subject_viewer(subject_id, user)
        if not (viewer.is_host or (subject.is_custom and subject.owner_id == user.id)):
            raise AuthorizationError("Only the group head can set the grades table link")
        subject.grades_url = url
        await self.session.commit()
        return await self.detail(subject.id, user, semester)

    # ─── Работы ───

    def _status(self, viewer: Viewer) -> str:
        return ContentStatus.APPROVED if viewer.is_host else ContentStatus.PENDING

    async def add_work(self, subject_id: uuid.UUID, data: WorkIn, user: User) -> SubjectDetail:
        subject, viewer = await self._subject_viewer(subject_id, user)
        viewer.require_write()
        work = SubjectWork(
            subject_id=subject.id,
            semester=data.semester or viewer.current_semester or subject.last_semester,
            kind=data.kind,
            number=data.number,
            title=data.title.strip(),
            max_points=data.max_points,
            deadline=data.deadline,
            description=data.description,
            url=data.url,
            status=self._status(viewer),
            author_id=user.id,
            approved_by=user.id if viewer.is_host else None,
        )
        self.session.add(work)
        await self.session.commit()
        return await self.detail(subject.id, user, work.semester)

    async def _work(self, work_id: uuid.UUID, user: User) -> tuple[SubjectWork, Viewer]:
        work = await self.session.get(SubjectWork, work_id)
        if not work:
            raise NotFoundError("Work not found")
        _, viewer = await self._subject_viewer(work.subject_id, user)
        if (
            work.status == ContentStatus.PENDING
            and not viewer.is_host
            and work.author_id != user.id
        ):
            raise NotFoundError("Work not found")
        return work, viewer

    @staticmethod
    def _can_edit(item: SubjectWork | SubjectMaterial, viewer: Viewer) -> None:
        own_pending = item.author_id == viewer.user.id and item.status == ContentStatus.PENDING
        if not (viewer.is_host or own_pending):
            raise AuthorizationError("Only the group head or assistants can change this")

    async def update_work(self, work_id: uuid.UUID, data: WorkPatch, user: User) -> SubjectDetail:
        work, viewer = await self._work(work_id, user)
        self._can_edit(work, viewer)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(
                work, field, value.strip() if isinstance(value, str) and field == "title" else value
            )
        await self.session.commit()
        return await self.detail(work.subject_id, user, work.semester)

    async def delete_work(self, work_id: uuid.UUID, user: User) -> SubjectDetail:
        work, viewer = await self._work(work_id, user)
        self._can_edit(work, viewer)
        subject_id, semester = work.subject_id, work.semester
        await self.session.delete(work)
        await self.session.commit()
        return await self.detail(subject_id, user, semester)

    async def approve_work(self, work_id: uuid.UUID, user: User) -> SubjectDetail:
        work, viewer = await self._work(work_id, user)
        if not viewer.is_host:
            raise AuthorizationError("Only the group head or assistants can approve")
        work.status = ContentStatus.APPROVED
        work.approved_by = user.id
        await self.session.commit()
        return await self.detail(work.subject_id, user, work.semester)

    async def set_progress(self, work_id: uuid.UUID, data: ProgressIn, user: User) -> SubjectDetail:
        work, viewer = await self._work(work_id, user)
        viewer.require_write()
        if work.status != ContentStatus.APPROVED:
            raise NotFoundError("Work not found")
        progress = (
            await self.session.execute(
                select(SubjectWorkProgress).where(
                    SubjectWorkProgress.work_id == work.id, SubjectWorkProgress.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if progress is None:
            progress = SubjectWorkProgress(work_id=work.id, user_id=user.id)
            self.session.add(progress)
        if data.passed and not progress.passed:
            progress.passed_at = datetime.now(UTC)
        progress.passed = data.passed
        progress.points = data.points
        await self.session.commit()
        return await self.detail(work.subject_id, user, work.semester)

    # ─── Материалы ───

    async def add_material(
        self, subject_id: uuid.UUID, data: MaterialIn, user: User
    ) -> SubjectDetail:
        subject, viewer = await self._subject_viewer(subject_id, user)
        viewer.require_write()
        material = SubjectMaterial(
            subject_id=subject.id,
            semester=data.semester or viewer.current_semester or subject.last_semester,
            kind=data.kind,
            title=data.title.strip(),
            url=data.url,
            lecture_date=data.lecture_date,
            status=self._status(viewer),
            author_id=user.id,
            approved_by=user.id if viewer.is_host else None,
        )
        self.session.add(material)
        await self.session.commit()
        return await self.detail(subject.id, user, material.semester)

    async def _material(self, material_id: uuid.UUID, user: User) -> tuple[SubjectMaterial, Viewer]:
        material = await self.session.get(SubjectMaterial, material_id)
        if not material:
            raise NotFoundError("Material not found")
        _, viewer = await self._subject_viewer(material.subject_id, user)
        if (
            material.status == ContentStatus.PENDING
            and not viewer.is_host
            and material.author_id != user.id
        ):
            raise NotFoundError("Material not found")
        return material, viewer

    async def update_material(
        self, material_id: uuid.UUID, data: MaterialPatch, user: User
    ) -> SubjectDetail:
        material, viewer = await self._material(material_id, user)
        self._can_edit(material, viewer)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(material, field, value)
        await self.session.commit()
        return await self.detail(material.subject_id, user, material.semester)

    async def delete_material(self, material_id: uuid.UUID, user: User) -> SubjectDetail:
        material, viewer = await self._material(material_id, user)
        self._can_edit(material, viewer)
        subject_id, semester = material.subject_id, material.semester
        await self.session.delete(material)
        await self.session.commit()
        return await self.detail(subject_id, user, semester)

    async def approve_material(self, material_id: uuid.UUID, user: User) -> SubjectDetail:
        material, viewer = await self._material(material_id, user)
        if not viewer.is_host:
            raise AuthorizationError("Only the group head or assistants can approve")
        material.status = ContentStatus.APPROVED
        material.approved_by = user.id
        await self.session.commit()
        return await self.detail(material.subject_id, user, material.semester)


async def mark_labs_passed(
    session: AsyncSession, subject_id: uuid.UUID, user_id: uuid.UUID, labs: list[int]
) -> int:
    """«Сдал» в очереди (#62) отмечает лабы с этими номерами в «Предметах» (#165).

    Без commit: вызывается внутри действия очереди. Возвращает, сколько отметил.
    """
    if not labs:
        return 0
    works = (
        (
            await session.execute(
                select(SubjectWork).where(
                    SubjectWork.subject_id == subject_id,
                    SubjectWork.kind == WorkKind.LAB,
                    SubjectWork.status == ContentStatus.APPROVED,
                    SubjectWork.number.in_(labs),
                )
            )
        )
        .scalars()
        .all()
    )
    if not works:
        return 0
    existing = {
        p.work_id: p
        for p in (
            await session.execute(
                select(SubjectWorkProgress).where(
                    SubjectWorkProgress.user_id == user_id,
                    SubjectWorkProgress.work_id.in_([w.id for w in works]),
                )
            )
        ).scalars()
    }
    now = datetime.now(UTC)
    for w in works:
        p = existing.get(w.id)
        if p is None:
            session.add(
                SubjectWorkProgress(work_id=w.id, user_id=user_id, passed=True, passed_at=now)
            )
        elif not p.passed:
            p.passed, p.passed_at = True, now
    return len(works)


__all__ = ["SubjectService", "mark_labs_passed"]


def _first_lesson(entry: ScheduleEntry) -> date | None:
    """Первая реальная пара. В расписании период задан неделями (02.11 — понедельник),
    а пара во вторник: первая будет 03.11. Учитываем и чётность недели."""
    if entry.date_from is None:
        return None
    for shift in range(15):
        day = entry.date_from + timedelta(days=shift)
        if entry.date_to and day > entry.date_to:
            break
        if entry_applies_on(entry, day):
            return day
    return entry.date_from


def _last_lesson(entry: ScheduleEntry) -> date | None:
    """Последняя реальная пара (см. _first_lesson)."""
    if entry.date_to is None:
        return None
    for shift in range(15):
        day = entry.date_to - timedelta(days=shift)
        if entry.date_from and day < entry.date_from:
            break
        if entry_applies_on(entry, day):
            return day
    return entry.date_to
