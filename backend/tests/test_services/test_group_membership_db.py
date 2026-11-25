"""Создание группы на сайте (#146), выход (#157), назначение старосты модератором (#159).

API на настоящей PostgreSQL; rasp подменён — сеть не нужна.
"""

from collections.abc import AsyncIterator
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
from src.core.models.base import Base
from src.core.models.group import Group, Student, StudentRole
from src.core.models.user import AuditLog, Identity, User
from src.core.services.group import GroupService
from src.shared.security import create_access_token
from tests.conftest import TEST_DATABASE_URL

RASP = {"241-327": "241-327", "241-3211": "241-3211", "24А-431": "24А-431"}

Ctx = tuple[AsyncClient, dict[str, Any], async_sessionmaker[AsyncSession]]


@pytest.fixture(autouse=True)
def _rasp(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.integrations import rasp_groups

    async def groups() -> dict[str, str]:
        return {rasp_groups.normalize(k): v for k, v in RASP.items()}

    async def no_schedule(_code: str) -> list[object]:
        return []

    monkeypatch.setattr(rasp_groups, "rasp_groups", groups)
    monkeypatch.setattr("src.integrations.rasp_parser.fetch_group_schedule", no_schedule)


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(TEST_DATABASE_URL)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except (OSError, SQLAlchemyError) as e:
        await eng.dispose()
        pytest.skip(f"PostgreSQL недоступна: {e}")
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture
async def ctx(engine: AsyncEngine) -> AsyncIterator[Ctx]:
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    names = ("starosta", "deputy", "student", "applicant", "moderator", "newbie")
    async with maker() as s:
        users = {n: User(display_name=n, is_moderator=n == "moderator") for n in names}
        s.add_all(users.values())
        await s.flush()
        group = Group(code="241-327", name="241-327", owner_id=users["starosta"].id)
        s.add(group)
        await s.flush()
        s.add_all(
            [
                Student(
                    user_id=users["starosta"].id,
                    group_id=group.id,
                    role=StudentRole.STAROSTA,
                    verified=True,
                ),
                Student(
                    user_id=users["deputy"].id,
                    group_id=group.id,
                    role=StudentRole.DEPUTY,
                    verified=True,
                ),
                Student(user_id=users["student"].id, group_id=group.id, verified=True),
                Student(user_id=users["applicant"].id, group_id=group.id, verified=False),
                Identity(user_id=users["newbie"].id, provider="telegram", external_id="777"),
            ]
        )
        await s.commit()
        ids = {n: u.id for n, u in users.items()}

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db_session] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t/api/v1") as c:
        yield c, ids, maker


def _auth(user_id: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user_id)})}"}


async def _roles(
    maker: async_sessionmaker[AsyncSession], code: str = "241-327"
) -> dict[Any, tuple[str, bool]]:
    async with maker() as s:
        rows = await s.execute(
            select(Student.user_id, Student.role, Student.verified)
            .join(Group, Group.id == Student.group_id)
            .where(Group.code == code)
        )
        return {uid: (str(role), verified) for uid, role, verified in rows.all()}


# ─── #146: создание и вступление ───


async def test_create_group_from_site_makes_starosta(ctx: Ctx) -> None:
    c, ids, maker = ctx
    r = await c.post("/groups", json={"code": " 241-3211 "}, headers=_auth(ids["newbie"]))
    assert r.status_code == 201, r.text
    assert r.json()["code"] == "241-3211"
    assert (await _roles(maker, "241-3211"))[ids["newbie"]] == ("starosta", True)


async def test_create_resolves_latin_lookalikes(ctx: Ctx) -> None:
    c, ids, _ = ctx
    r = await c.post("/groups", json={"code": "24a-431"}, headers=_auth(ids["newbie"]))
    assert r.status_code == 201, r.text
    assert r.json()["code"] == "24А-431"


async def test_create_rejects_unknown_and_existing(ctx: Ctx) -> None:
    c, ids, _ = ctx
    r = await c.post("/groups", json={"code": "999-999"}, headers=_auth(ids["newbie"]))
    assert r.status_code == 404
    r = await c.post("/groups", json={"code": "241-327"}, headers=_auth(ids["newbie"]))
    assert r.status_code == 409


async def test_join_does_not_create(ctx: Ctx) -> None:
    c, ids, maker = ctx
    r = await c.post("/groups/241-3211/join", headers=_auth(ids["newbie"]))
    assert r.status_code == 404
    async with maker() as s:
        assert (await s.execute(select(Group).where(Group.code == "241-3211"))).first() is None
    r = await c.post("/groups/241-327/join", headers=_auth(ids["newbie"]))
    assert r.status_code == 201
    assert (await _roles(maker))[ids["newbie"]] == ("student", False)


async def test_bot_creates_or_joins(ctx: Ctx) -> None:
    _, ids, maker = ctx
    async with maker() as s:
        created = await GroupService(s).join_group_by_telegram("777", "241-3211")
    assert created.role == StudentRole.STAROSTA and created.verified
    async with maker() as s:
        again = await GroupService(s).join_group_by_telegram("777", "241-3211")
    assert again.id == created.id
    async with maker() as s:
        joined = await GroupService(s).join_group_by_telegram("777", "241-327")
    assert joined.role == StudentRole.STUDENT and not joined.verified


# ─── #157: выход ───


async def test_leave_group(ctx: Ctx) -> None:
    c, ids, maker = ctx
    r = await c.delete("/groups/241-327/membership", headers=_auth(ids["student"]))
    assert r.status_code == 204
    assert ids["student"] not in await _roles(maker)
    r = await c.get("/groups/my", headers=_auth(ids["student"]))
    assert r.json() == []
    r = await c.delete("/groups/241-327/membership", headers=_auth(ids["student"]))
    assert r.status_code == 404


async def test_starosta_leaving_hands_over_to_deputy(ctx: Ctx) -> None:
    c, ids, maker = ctx
    r = await c.delete("/groups/241-327/membership", headers=_auth(ids["starosta"]))
    assert r.status_code == 204
    roles = await _roles(maker)
    assert roles[ids["deputy"]] == ("starosta", True)
    async with maker() as s:
        group = (await s.execute(select(Group).where(Group.code == "241-327"))).scalar_one()
    assert group.owner_id == ids["deputy"]

    # Бывший староста больше не управляет группой
    r = await c.post(f"/groups/241-327/verify/{ids['applicant']}", headers=_auth(ids["starosta"]))
    assert r.status_code == 403


# ─── #159: модератор назначает старосту ───


async def test_moderator_appoints_starosta(ctx: Ctx) -> None:
    c, ids, maker = ctx
    r = await c.patch(
        f"/groups/241-327/students/{ids['applicant']}/role",
        json={"role": "starosta"},
        headers=_auth(ids["moderator"]),
    )
    assert r.status_code == 200, r.text
    roles = await _roles(maker)
    assert roles[ids["applicant"]] == ("starosta", True)  # заявка подтверждена
    assert roles[ids["starosta"]] == ("deputy", True)  # староста в группе один
    async with maker() as s:
        actions = (await s.execute(select(AuditLog.action))).scalars().all()
    assert "role_changed_by_moderator" in actions


async def test_starosta_cannot_appoint_starosta(ctx: Ctx) -> None:
    c, ids, maker = ctx
    r = await c.patch(
        f"/groups/241-327/students/{ids['student']}/role",
        json={"role": "starosta"},
        headers=_auth(ids["starosta"]),
    )
    assert r.status_code == 403
    assert (await _roles(maker))[ids["starosta"]] == ("starosta", True)
    # Но помощника назначить может
    r = await c.patch(
        f"/groups/241-327/students/{ids['student']}/role",
        json={"role": "assistant"},
        headers=_auth(ids["starosta"]),
    )
    assert r.status_code == 200


async def test_moderator_revives_group_without_starosta(ctx: Ctx) -> None:
    """Группа осталась без старосты и заместителя — модератор назначает нового."""
    c, ids, maker = ctx
    for who in ("deputy", "starosta"):
        assert (
            await c.delete("/groups/241-327/membership", headers=_auth(ids[who]))
        ).status_code == 204
    assert all(role != "starosta" for role, _ in (await _roles(maker)).values())
    r = await c.patch(
        f"/groups/241-327/students/{ids['student']}/role",
        json={"role": "starosta"},
        headers=_auth(ids["moderator"]),
    )
    assert r.status_code == 200
    async with maker() as s:
        group = (await s.execute(select(Group).where(Group.code == "241-327"))).scalar_one()
    assert group.owner_id == ids["student"]
