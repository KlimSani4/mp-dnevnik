"""Модератор платформы в любой группе — как староста (#150). API на настоящей PostgreSQL."""

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
from src.core.models.user import AuditLog, User
from src.shared.security import create_access_token
from tests.conftest import TEST_DATABASE_URL


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
async def ctx(
    engine: AsyncEngine,
) -> AsyncIterator[tuple[AsyncClient, dict[str, Any], async_sessionmaker[AsyncSession]]]:
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        starosta = User(display_name="Староста")
        applicant = User(display_name="Заявка")
        moderator = User(display_name="Модератор", is_moderator=True)
        stranger = User(display_name="Посторонний")
        s.add_all([starosta, applicant, moderator, stranger])
        await s.flush()
        group = Group(code="241-327", name="241-327", owner_id=starosta.id)
        other = Group(code="241-326", name="241-326", owner_id=starosta.id)
        s.add_all([group, other])
        await s.flush()
        s.add_all(
            [
                Student(
                    user_id=starosta.id, group_id=group.id, role=StudentRole.STAROSTA, verified=True
                ),
                Student(user_id=applicant.id, group_id=group.id, verified=False, joined_via="site"),
            ]
        )
        await s.commit()
        ids = {u.display_name: u.id for u in (starosta, applicant, moderator, stranger)}

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db_session] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t/api/v1") as c:
        yield c, ids, maker


def _auth(user_id: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user_id)})}"}


async def test_moderator_lists_all_groups(ctx: Any) -> None:
    c, ids, _ = ctx
    r = await c.get("/moderation/groups", headers=_auth(ids["Модератор"]))
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["code"] == "241-327"  # группа с заявкой — первой
    assert (rows[0]["members"], rows[0]["pending"], rows[0]["starosta_name"]) == (1, 1, "Староста")
    assert {x["code"] for x in rows} == {"241-327", "241-326"}

    r = await c.get("/moderation/groups", headers=_auth(ids["Посторонний"]))
    assert r.status_code == 403


async def test_moderator_sees_members_of_any_group(ctx: Any) -> None:
    c, ids, _ = ctx
    r = await c.get("/groups/241-327/students", headers=_auth(ids["Модератор"]))
    assert r.status_code == 200
    assert {x["user"]["display_name"] for x in r.json()} == {"Староста", "Заявка"}

    r = await c.get("/groups/241-327/students", headers=_auth(ids["Посторонний"]))
    assert r.status_code == 403


async def test_moderator_verifies_and_rejects_with_audit(ctx: Any) -> None:
    c, ids, maker = ctx
    r = await c.post(f"/groups/241-327/verify/{ids['Заявка']}", headers=_auth(ids["Модератор"]))
    assert r.status_code == 200

    async with maker() as s:
        actions = (await s.execute(select(AuditLog.action, AuditLog.user_id))).all()
    assert ("student_verified_by_moderator", ids["Модератор"]) in actions

    # модератор не стал участником группы
    async with maker() as s:
        rows = (
            (await s.execute(select(Student).where(Student.user_id == ids["Модератор"])))
            .scalars()
            .all()
        )
    assert rows == []


async def test_stranger_still_cannot_verify(ctx: Any) -> None:
    c, ids, _ = ctx
    r = await c.post(f"/groups/241-327/verify/{ids['Заявка']}", headers=_auth(ids["Посторонний"]))
    assert r.status_code == 403


async def test_starosta_verify_returns_student(ctx: Any) -> None:
    """Подтверждение отдаёт ответ, а не 500 (updated_at после flush не подгружался)."""
    c, ids, _ = ctx
    r = await c.post(f"/groups/241-327/verify/{ids['Заявка']}", headers=_auth(ids["Староста"]))
    assert r.status_code == 200
    assert r.json()["verified"] is True


async def test_extended_stats(ctx: Any) -> None:
    """Расширенная статистика модерации считается на настоящей базе (#152)."""
    c, ids, _ = ctx
    r = await c.get("/moderation/stats", headers=_auth(ids["Модератор"]))
    assert r.status_code == 200
    d = r.json()
    assert d["users_total"] == 4
    # воронка: двое подали заявку в группу, подтверждён один (староста)
    assert (d["users_requested_group"], d["users_in_group"]) == (2, 1)
    assert d["join_requests_pending"] == 1
    assert (d["groups_total"], d["groups_active"], d["groups_without_starosta"]) == (2, 1, 1)
    assert len(d["assignments_by_day"]) == 30
    assert [x["key"] for x in d["tasks_by_state"]] == ["todo", "doing", "review", "done"]
    assert [x["key"] for x in d["support_by_status"]] == ["new", "in_progress", "closed"]
    assert d["top_groups"][0] == {"code": "241-327", "members": 1, "assignments_30d": 0}
    assert d["support_median_reply_hours"] is None
