"""API участников группы на настоящей PostgreSQL (#148).

Староста получает контакт Telegram и способ вступления, обычный участник — 403.
Локально без базы тесты пропускаются; в CI PostgreSQL поднимается сервисом.
"""

from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
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
from src.core.models.user import Identity, User
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
async def api(engine: AsyncEngine) -> AsyncIterator[tuple[AsyncClient, dict[str, Any]]]:
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        starosta = User(display_name="Староста")
        member = User(display_name="Одногруппник")
        applicant = User(display_name="Студент")
        s.add_all([starosta, member, applicant])
        await s.flush()
        group = Group(code="241-327", name="241-327", owner_id=starosta.id)
        s.add(group)
        await s.flush()
        s.add_all(
            [
                Student(
                    user_id=starosta.id, group_id=group.id, role=StudentRole.STAROSTA, verified=True
                ),
                Student(user_id=member.id, group_id=group.id, verified=True, joined_via="bot"),
                Student(user_id=applicant.id, group_id=group.id, verified=False, joined_via="site"),
                Identity(
                    user_id=applicant.id,
                    provider="telegram",
                    external_id="111",
                    username="alina_mnk",
                    raw_data={"first_name": "Алина", "last_name": "Минок"},
                ),
            ]
        )
        await s.commit()
        ids = {"starosta": starosta.id, "member": member.id, "applicant": applicant.id}

    async def override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db_session] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t/api/v1") as c:
        yield c, ids


def _auth(user_id: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user_id)})}"}


async def test_starosta_sees_telegram_and_how_joined(
    api: tuple[AsyncClient, dict[str, Any]],
) -> None:
    c, ids = api
    r = await c.get("/groups/241-327/students", headers=_auth(ids["starosta"]))
    assert r.status_code == 200
    rows = r.json()
    assert not rows[0]["verified"]  # заявки — первыми
    applicant = next(x for x in rows if x["user_id"] == str(ids["applicant"]))
    assert applicant["telegram"] == {
        "username": "alina_mnk",
        "name": "Алина Минок",
        "profile_url": "https://t.me/alina_mnk",
    }
    assert applicant["joined_via"] == "site"
    assert "created_at" in applicant


async def test_member_gets_no_contacts(api: tuple[AsyncClient, dict[str, Any]]) -> None:
    c, ids = api
    r = await c.get("/groups/241-327/students", headers=_auth(ids["member"]))
    assert r.status_code == 403


async def test_reject_removes_request(api: tuple[AsyncClient, dict[str, Any]]) -> None:
    c, ids = api
    r = await c.post(f"/groups/241-327/reject/{ids['applicant']}", headers=_auth(ids["starosta"]))
    assert r.status_code == 204
    rows = (await c.get("/groups/241-327/students", headers=_auth(ids["starosta"]))).json()
    assert str(ids["applicant"]) not in {x["user_id"] for x in rows}

    # подтверждённого участника отклонить нельзя, обычный участник — не может вовсе
    r = await c.post(f"/groups/241-327/reject/{ids['member']}", headers=_auth(ids["starosta"]))
    assert r.status_code == 409
    r = await c.post(f"/groups/241-327/reject/{ids['starosta']}", headers=_auth(ids["member"]))
    assert r.status_code == 403
