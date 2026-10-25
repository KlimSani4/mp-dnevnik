"""Регрессионные тесты ИБ-аудита (#98): доступ к чужим данным и внутренним маршрутам.

Тесты идут через настоящее приложение и настоящую БД (как в CI), без моков сервисов.
Каждый тест описывает ожидаемое безопасное поведение.
"""

from __future__ import annotations

import pytest

from tests.test_security.conftest import World


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
