"""«Предметы» (#165): семестры, работы, материалы, личный учёт — API на PostgreSQL."""

from collections.abc import AsyncIterator
from datetime import date, time, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.api.app import create_app
from src.api.deps import get_db_session
from src.core.academic import term_for
from src.core.models.base import Base
from src.core.models.group import Group, Student, StudentRole
from src.core.models.schedule import ScheduleEntry, Subject
from src.core.models.subject_content import SubjectWorkProgress
from src.core.models.user import User
from src.core.services import subject as subject_service
from src.shared.security import create_access_token
from tests.conftest import TEST_DATABASE_URL

CODE = "241-327"
CURRENT = term_for(CODE, subject_service.moscow_today())
assert CURRENT is not None
NOW = CURRENT.semester

Ctx = tuple[AsyncClient, dict[str, Any], async_sessionmaker[AsyncSession]]


@pytest.fixture
async def ctx() -> AsyncIterator[Ctx]:
    eng: AsyncEngine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except (OSError, SQLAlchemyError) as e:
        await eng.dispose()
        pytest.skip(f"PostgreSQL недоступна: {e}")
    maker = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        users = {
            n: User(display_name=n, is_moderator=n == "mod")
            for n in ("head", "anna", "boris", "pending", "outsider", "mod")
        }
        s.add_all(users.values())
        await s.flush()
        group = Group(code=CODE, name=CODE, owner_id=users["head"].id, settings={})
        s.add(group)
        await s.flush()
        s.add_all(
            [
                Student(
                    user_id=users["head"].id,
                    group_id=group.id,
                    role=StudentRole.STAROSTA,
                    verified=True,
                ),
                Student(user_id=users["anna"].id, group_id=group.id, verified=True),
                Student(user_id=users["boris"].id, group_id=group.id, verified=True),
                Student(user_id=users["pending"].id, group_id=group.id, verified=False),
            ]
        )
        nets = Subject(name="Сети ЭВМ", group_id=group.id, first_semester=NOW, last_semester=NOW)
        old = Subject(
            name="Матанализ", group_id=group.id, first_semester=NOW - 2, last_semester=NOW - 1
        )
        mine = Subject(
            name="Английский с репетитором",
            group_id=group.id,
            is_custom=True,
            owner_id=users["anna"].id,
        )
        s.add_all([nets, old, mine])
        await s.flush()
        s.add(
            ScheduleEntry(
                group_id=group.id,
                subject_id=nets.id,
                weekday=3,
                pair_number=2,
                start_time=time(10, 40),
                end_time=time(12, 10),
                lesson_type="Лекция",
                teacher="Иванов И. И.",
                external_link="https://webinar.example/nets",
            )
        )
        group.settings = {"subject_requirements": {str(nets.id): {"total": 3}}}
        await s.commit()
        ids = {n: u.id for n, u in users.items()} | {
            "nets": nets.id,
            "old": old.id,
            "mine": mine.id,
        }

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db_session] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t/api/v1") as c:
        yield c, ids, maker
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


def _auth(uid: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(uid)})}"}


async def test_list_filters_by_semester(ctx: Ctx) -> None:
    c, ids, _ = ctx
    r = await c.get(f"/subjects?group={CODE}", headers=_auth(ids["anna"]))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["current_semester"] == NOW and data["selected_semester"] == NOW
    names = [s["name"] for s in data["subjects"]]
    assert "Сети ЭВМ" in names and "Матанализ" not in names
    assert "Английский с репетитором" in names  # личный — без семестра, виден всегда
    sems = {o["number"]: o for o in data["semesters"]}
    assert set(sems) == {NOW - 2, NOW - 1, NOW} and sems[NOW]["is_current"]
    assert sems[NOW]["course"] == CURRENT.course

    r = await c.get(f"/subjects?group={CODE}&semester={NOW - 1}", headers=_auth(ids["anna"]))
    assert [s["name"] for s in r.json()["subjects"]] == ["Английский с репетитором", "Матанализ"]
    r = await c.get(f"/subjects?group={CODE}&all=true", headers=_auth(ids["anna"]))
    assert r.json()["selected_semester"] is None and len(r.json()["subjects"]) == 3

    # Личный предмет другого не виден
    r = await c.get(f"/subjects?group={CODE}", headers=_auth(ids["boris"]))
    assert "Английский с репетитором" not in [s["name"] for s in r.json()["subjects"]]


async def test_access(ctx: Ctx) -> None:
    c, ids, _ = ctx
    r = await c.get(f"/subjects?group={CODE}", headers=_auth(ids["outsider"]))
    assert r.status_code == 403 and r.json()["code"] == "NOT_MEMBER"
    assert (
        await c.get(f"/subjects/{ids['nets']}", headers=_auth(ids["outsider"]))
    ).status_code == 403

    # Заявка ещё не подтверждена: смотреть можно, добавлять — нет
    r = await c.get(f"/subjects?group={CODE}", headers=_auth(ids["pending"]))
    assert r.status_code == 200 and r.json()["can_write"] is False
    r = await c.get(f"/subjects/{ids['nets']}", headers=_auth(ids["pending"]))
    assert r.status_code == 200 and r.json()["can_write"] is False
    for path, body in (
        ("works", {"kind": "lab", "title": "x"}),
        ("materials", {"kind": "theory", "title": "x", "url": "https://a.b/c"}),
        ("tags", {"tags": ["x"]}),
    ):
        r = await c.post(
            f"/subjects/{ids['nets']}/{path}", json=body, headers=_auth(ids["pending"])
        )
        assert r.status_code == 403 and r.json()["code"] == "NOT_VERIFIED", path
    assert (await c.get(f"/subjects?group={CODE}", headers=_auth(ids["mod"]))).status_code == 200
    r = await c.get(f"/subjects/{ids['mine']}", headers=_auth(ids["boris"]))
    assert r.status_code == 404


async def test_works_moderation_and_progress(ctx: Ctx) -> None:
    c, ids, maker = ctx
    nets = ids["nets"]
    deadline = (subject_service.moscow_today() + timedelta(days=5)).isoformat()

    # Староста — сразу видно всем
    r = await c.post(
        f"/subjects/{nets}/works",
        json={
            "kind": "lab",
            "number": 1,
            "title": "ЛР1. Сокеты",
            "max_points": 10,
            "deadline": deadline,
        },
        headers=_auth(ids["head"]),
    )
    assert r.status_code == 201, r.text
    lab1 = r.json()["works"][0]
    assert lab1["status"] == "approved"

    # Участник — на проверку: видит он и ведущий, но не другие
    r = await c.post(
        f"/subjects/{nets}/works",
        json={"kind": "lab", "number": 2, "title": "ЛР2. HTTP", "max_points": 15},
        headers=_auth(ids["anna"]),
    )
    lab2 = next(w for w in r.json()["works"] if w["number"] == 2)
    assert lab2["status"] == "pending" and lab2["is_mine"]
    boris = (await c.get(f"/subjects/{nets}", headers=_auth(ids["boris"]))).json()
    assert [w["number"] for w in boris["works"]] == [1]
    head = (await c.get(f"/subjects?group={CODE}", headers=_auth(ids["head"]))).json()
    assert next(s for s in head["subjects"] if s["name"] == "Сети ЭВМ")["pending"] == 1

    # Чужое предложение участник не правит; ведущий подтверждает
    r = await c.patch(
        f"/subjects/works/{lab2['id']}", json={"title": "x"}, headers=_auth(ids["boris"])
    )
    assert r.status_code == 404
    r = await c.post(f"/subjects/works/{lab2['id']}/approve", headers=_auth(ids["anna"]))
    assert r.status_code == 403
    r = await c.post(f"/subjects/works/{lab2['id']}/approve", headers=_auth(ids["head"]))
    assert r.status_code == 200
    # После подтверждения автор уже не правит
    r = await c.patch(
        f"/subjects/works/{lab2['id']}", json={"title": "y"}, headers=_auth(ids["anna"])
    )
    assert r.status_code == 403

    # Личный учёт
    r = await c.put(
        f"/subjects/works/{lab1['id']}/progress",
        json={"passed": True, "points": 8.5},
        headers=_auth(ids["anna"]),
    )
    d = r.json()
    assert d["works_passed"] == 1 and d["points"] == 8.5 and d["max_points"] == 25
    assert d["required"] == 3 and d["required_left"] == 2
    assert d["next_deadline"]["title"] == "ЛР1. Сокеты"
    assert d["teachers"] == ["Иванов И. И."]
    assert d["lectures"][0]["url"] == "https://webinar.example/nets"
    assert d["schedule"][0]["room"] is None and d["schedule"][0]["weekday"] == 3
    # У Бориса своя отметка
    b = (await c.get(f"/subjects/{nets}", headers=_auth(ids["boris"]))).json()
    assert b["works_passed"] == 0

    # Удаление каскадом убирает отметки
    r = await c.delete(f"/subjects/works/{lab1['id']}", headers=_auth(ids["head"]))
    assert r.status_code == 200
    async with maker() as s:
        assert (await s.execute(select(SubjectWorkProgress))).first() is None


async def test_materials(ctx: Ctx) -> None:
    c, ids, _ = ctx
    nets = ids["nets"]
    r = await c.post(
        f"/subjects/{nets}/materials",
        json={
            "kind": "presentation",
            "title": "Лекция 1. Модель OSI",
            "url": "https://disk.example/osi.pdf",
        },
        headers=_auth(ids["head"]),
    )
    assert r.status_code == 201
    r = await c.post(
        f"/subjects/{nets}/materials",
        json={
            "kind": "recording",
            "title": "Запись 1",
            "url": "https://video.example/1",
            "lecture_date": "2026-11-25",
        },
        headers=_auth(ids["head"]),
    )
    d = r.json()
    assert [m["title"] for m in d["materials_list"]] == ["Лекция 1. Модель OSI"]
    assert [lec["source"] for lec in d["lectures"]] == ["schedule", "material"]
    assert d["materials"] == 2

    # Опасные ссылки не принимаем
    r = await c.post(
        f"/subjects/{nets}/materials",
        json={"kind": "theory", "title": "x", "url": "javascript:alert(1)"},
        headers=_auth(ids["head"]),
    )
    assert r.status_code == 422


async def test_queue_passed_marks_lab(ctx: Ctx) -> None:
    c, ids, maker = ctx
    nets = ids["nets"]
    r = await c.post(
        f"/subjects/{nets}/works",
        json={"kind": "lab", "number": 3, "title": "ЛР3", "max_points": 10},
        headers=_auth(ids["head"]),
    )
    async with maker() as s:
        n = await subject_service.mark_labs_passed(s, nets, ids["boris"], [3, 4])
        await s.commit()
    assert n == 1
    b = (await c.get(f"/subjects/{nets}", headers=_auth(ids["boris"]))).json()
    assert b["works_passed"] == 1 and b["works"][0]["passed"]
    assert r.status_code == 201


async def test_import_marks_semesters(ctx: Ctx) -> None:
    from src.core.services.schedule import mark_semester

    s = Subject(name="x")
    mark_semester(s, term_for(CODE, date(2024, 10, 1)))
    mark_semester(s, term_for(CODE, date(2026, 3, 1)))
    assert (s.first_semester, s.last_semester) == (1, 4)
    mark_semester(s, None)
    assert (s.first_semester, s.last_semester) == (1, 4)
    assert ctx


async def test_tags(ctx: Ctx) -> None:
    c, ids, _ = ctx
    nets = ids["nets"]
    # Участник ставит теги; регистр и # не важны, дубли пропускаются
    r = await c.post(
        f"/subjects/{nets}/tags",
        json={"tags": ["#ИБ ", "сети", "иб", "  "]},
        headers=_auth(ids["anna"]),
    )
    assert r.status_code == 200, r.text
    assert [(t["tag"], t["can_remove"]) for t in r.json()["tags"]] == [("ИБ", True), ("сети", True)]

    # Другой участник видит, но убрать чужой не может; ведущий — может
    r = await c.get(f"/subjects/{nets}", headers=_auth(ids["boris"]))
    assert [t["can_remove"] for t in r.json()["tags"]] == [False, False]
    r = await c.delete(f"/subjects/{nets}/tags/иб", headers=_auth(ids["boris"]))
    assert r.status_code == 403
    r = await c.delete(f"/subjects/{nets}/tags/ИБ", headers=_auth(ids["head"]))
    assert [t["tag"] for t in r.json()["tags"]] == ["сети"]

    # В списке — теги группы со счётчиком и подсказки без уже занятых
    await c.post(
        f"/subjects/{ids['old']}/tags",
        json={"tags": ["Сети", "основа основ"]},
        headers=_auth(ids["anna"]),
    )
    data = (await c.get(f"/subjects?group={CODE}", headers=_auth(ids["anna"]))).json()
    assert [(t["key"], t["count"]) for t in data["group_tags"]] == [
        ("сети", 2),
        ("основа основ", 1),
    ]
    assert "сети" not in data["tag_suggestions"] and "прога" in data["tag_suggestions"]

    # Чужая группа — нельзя
    r = await c.post(f"/subjects/{nets}/tags", json={"tags": ["x"]}, headers=_auth(ids["outsider"]))
    assert r.status_code == 403


def test_schema_outdated_detection() -> None:
    """Неприменённая миграция узнаётся по ошибке Postgres (#165)."""
    from src.api.app import is_schema_outdated

    class UndefinedColumnError(Exception):
        pass

    class DBAPIError(Exception):
        def __init__(self, orig: Exception) -> None:
            self.orig = orig

    assert is_schema_outdated(DBAPIError(UndefinedColumnError()))
    assert not is_schema_outdated(DBAPIError(ValueError()))
    assert not is_schema_outdated(RuntimeError("x"))
