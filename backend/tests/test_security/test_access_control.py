"""Регрессионные тесты ИБ-аудита (#98): доступ к чужим данным и внутренним маршрутам.

Тесты идут через настоящее приложение и настоящую БД (как в CI), без моков сервисов.
Каждый тест описывает ожидаемое безопасное поведение.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import time
from typing import Any

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.api.app import create_app
from src.api.deps import get_db_session, get_redis_client
from src.config import settings
from src.core.models.group import StudentRole
from src.core.repositories.assignment import AssignmentRepository
from src.core.repositories.group import GroupRepository, StudentRepository
from src.core.repositories.schedule import ScheduleEntryRepository, SubjectRepository
from src.core.repositories.user import UserRepository
from src.shared.security import create_access_token


@dataclass
class World:
    """Две группы: в первой староста, участник и посторонний вне её."""

    client: AsyncClient
    group_id: uuid.UUID
    group_code: str
    member_id: uuid.UUID
    outsider_id: uuid.UUID
    subject_id: uuid.UUID
    entry_id: uuid.UUID
    personal_assignment_id: uuid.UUID
    public_assignment_id: uuid.UUID

    def auth(self, user_id: uuid.UUID) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token({'sub': str(user_id)})}"}


@pytest_asyncio.fixture
async def world(db_engine: Any) -> AsyncGenerator[World, None]:
    maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        users = UserRepository(s)
        member = await users.create(display_name="member", settings={})
        outsider = await users.create(display_name="outsider", settings={})
        group = await GroupRepository(s).create(code="T-001", name="T-001", owner_id=member.id)
        await StudentRepository(s).create(
            user_id=member.id, group_id=group.id, role=StudentRole.STUDENT, verified=True
        )
        subject = await SubjectRepository(s).create(name="Subj", group_id=group.id, is_custom=False)
        entry = await ScheduleEntryRepository(s).create(
            group_id=group.id,
            subject_id=subject.id,
            weekday=1,
            pair_number=1,
            start_time=time(9, 0),
            end_time=time(10, 30),
            raw_data={},
        )
        arepo = AssignmentRepository(s)
        common: dict[str, Any] = {
            "group_id": group.id,
            "subject_id": subject.id,
            "author_id": member.id,
            "priority": "normal",
        }
        personal = await arepo.create(title="private", is_personal=True, **common)
        public = await arepo.create(title="public", is_personal=False, **common)
        await s.commit()
        ids = (
            group.id, member.id, outsider.id, subject.id, entry.id, personal.id, public.id,
        )

    redis = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    app = create_app()

    async def _db() -> AsyncGenerator[AsyncSession, None]:
        async with maker() as session:
            yield session

    async def _redis() -> Any:
        return redis

    app.dependency_overrides[get_db_session] = _db
    app.dependency_overrides[get_redis_client] = _redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield World(client, ids[0], "T-001", *ids[1:])
    await redis.aclose()


# ─── Внутренний вход через бота ───


async def test_internal_auth_complete_needs_secret(world: World) -> None:
    init = await world.client.post("/api/v1/auth/telegram/init")
    token = init.json()["token"]

    resp = await world.client.post(
        "/api/v1/internal/auth/complete",
        json={"token": token, "telegram_id": "424242"},
    )
    assert resp.status_code in (401, 403, 404)

    poll = await world.client.get(f"/api/v1/auth/telegram/poll/{token}")
    assert poll.json() == {"status": "pending"}


async def test_internal_auth_complete_works_with_secret(world: World) -> None:
    from src.shared.security import internal_api_headers

    init = await world.client.post("/api/v1/auth/telegram/init")
    token = init.json()["token"]
    resp = await world.client.post(
        "/api/v1/internal/auth/complete",
        json={"token": token, "telegram_id": "424243"},
        headers=internal_api_headers(),
    )
    assert resp.status_code == 200


# ─── Чужие задания ───


async def test_assignment_by_id_requires_login(world: World) -> None:
    resp = await world.client.get(f"/api/v1/assignments/{world.public_assignment_id}")
    assert resp.status_code == 401


async def test_assignment_by_id_hidden_from_outsider(world: World) -> None:
    resp = await world.client.get(
        f"/api/v1/assignments/{world.public_assignment_id}", headers=world.auth(world.outsider_id)
    )
    assert resp.status_code in (403, 404)


async def test_personal_assignment_hidden_from_other_member(world: World) -> None:
    resp = await world.client.get(
        f"/api/v1/assignments/{world.personal_assignment_id}",
        headers=world.auth(world.outsider_id),
    )
    assert resp.status_code in (403, 404)


async def test_assignment_list_hidden_from_outsider(world: World) -> None:
    resp = await world.client.get(
        "/api/v1/assignments",
        params={"group_id": str(world.group_id)},
        headers=world.auth(world.outsider_id),
    )
    assert resp.status_code in (403, 404)


async def test_dashboard_hidden_from_outsider(world: World) -> None:
    resp = await world.client.get(
        "/api/v1/dashboard",
        params={"group_id": str(world.group_id), "group_code": world.group_code},
        headers=world.auth(world.outsider_id),
    )
    assert resp.status_code in (403, 404)


async def test_member_still_sees_own_assignments(world: World) -> None:
    resp = await world.client.get(
        "/api/v1/assignments",
        params={"group_id": str(world.group_id)},
        headers=world.auth(world.member_id),
    )
    assert resp.status_code == 200
    assert {a["title"] for a in resp.json()} == {"private", "public"}


# ─── Правки расписания ───


async def test_outsider_cannot_add_group_override(world: World) -> None:
    resp = await world.client.post(
        "/api/v1/schedule/override",
        json={
            "entry_id": str(world.entry_id),
            "scope": "group",
            "override_type": "add",
            "value": "text",
        },
        headers=world.auth(world.outsider_id),
    )
    assert resp.status_code == 403


# ─── Ссылки в заданиях ───


@pytest.mark.parametrize("link", ["javascript:alert(1)", "data:text/html,x", "vbscript:x"])
async def test_assignment_link_must_be_http(world: World, link: str) -> None:
    resp = await world.client.post(
        "/api/v1/assignments",
        json={
            "group_id": str(world.group_id),
            "subject_id": str(world.subject_id),
            "title": "t",
            "link": link,
        },
        headers=world.auth(world.member_id),
    )
    assert resp.status_code == 422


async def test_assignment_link_http_is_accepted(world: World) -> None:
    resp = await world.client.post(
        "/api/v1/assignments",
        json={
            "group_id": str(world.group_id),
            "subject_id": str(world.subject_id),
            "title": "t",
            "link": "https://example.com/task",
        },
        headers=world.auth(world.member_id),
    )
    assert resp.status_code == 201
