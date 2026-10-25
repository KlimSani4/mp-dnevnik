"""Тесты по issue аудита #98: IP клиента, лимиты, токены, конфигурация, бот, ФЗ-152."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from html import escape
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError as PydanticValidationError

from src.config import Settings
from src.shared.exceptions import AuthenticationError, RateLimitError
from tests.test_security.conftest import World


# ─── IP клиента (#107) ───


def _request(xff: str | None, peer: str = "10.0.0.1") -> Any:
    headers = {"X-Forwarded-For": xff} if xff else {}
    return SimpleNamespace(headers=headers, client=SimpleNamespace(host=peer))


def test_client_ip_ignores_values_supplied_by_client(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.shared import net

    monkeypatch.setattr(net.settings, "TRUSTED_PROXY_COUNT", 1)
    # клиент прислал 6.6.6.6, прокси дописал реальный адрес
    assert net.get_client_ip(_request("6.6.6.6, 203.0.113.9")) == "203.0.113.9"


def test_client_ip_counts_proxies_from_the_right(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.shared import net

    monkeypatch.setattr(net.settings, "TRUSTED_PROXY_COUNT", 2)
    assert net.get_client_ip(_request("6.6.6.6, 203.0.113.9, 172.16.0.5")) == "203.0.113.9"


def test_client_ip_falls_back_to_peer(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.shared import net

    monkeypatch.setattr(net.settings, "TRUSTED_PROXY_COUNT", 1)
    assert net.get_client_ip(_request(None, "10.1.1.1")) == "10.1.1.1"
    monkeypatch.setattr(net.settings, "TRUSTED_PROXY_COUNT", 0)
    assert net.get_client_ip(_request("6.6.6.6", "10.1.1.1")) == "10.1.1.1"


# ─── Rate limit (#109) ───


async def test_hit_limit_blocks_over_limit() -> None:
    from src.api.rate_limit import hit_limit

    pipe = MagicMock()
    pipe.execute = AsyncMock(return_value=[4, 30])
    redis = MagicMock()
    redis.pipeline = MagicMock(return_value=pipe)
    with pytest.raises(RateLimitError):
        await hit_limit(redis, "k", 3, 60)


async def test_hit_limit_fails_open_when_redis_is_down() -> None:
    from src.api.rate_limit import hit_limit

    pipe = MagicMock()
    pipe.execute = AsyncMock(side_effect=ConnectionError("down"))
    redis = MagicMock()
    redis.pipeline = MagicMock(return_value=pipe)
    await hit_limit(redis, "k", 3, 60)  # не должно падать


async def test_export_is_rate_limited(world: World) -> None:
    codes = []
    for _ in range(8):
        r = await world.client.get(
            "/api/v1/schedule/export",
            params={"group_code": world.group_code},
            headers=world.auth(world.member_id),
        )
        codes.append(r.status_code)
    assert 429 in codes


async def test_bot_auth_init_is_rate_limited(world: World) -> None:
    codes = [(await world.client.post("/api/v1/auth/telegram/init")).status_code for _ in range(12)]
    assert 429 in codes


# ─── Токены (#108, #118) ───


async def test_refresh_cookie_is_httponly_and_rotates(world: World) -> None:
    from src.core.models.user import User  # noqa: F401
    from src.shared.security import internal_api_headers

    init = await world.client.post("/api/v1/auth/telegram/init")
    token = init.json()["token"]
    await world.client.post(
        "/api/v1/internal/auth/complete",
        json={"token": token, "telegram_id": "777001"},
        headers=internal_api_headers(),
    )
    poll = await world.client.get(f"/api/v1/auth/telegram/poll/{token}")
    assert poll.json()["status"] == "complete"
    cookie = poll.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api/v1/auth" in cookie

    # refresh по cookie (без тела) выдаёт новую пару, старая перестаёт работать
    old_refresh = poll.json()["refresh_token"]
    world.client.cookies.set("nexora_refresh", old_refresh, path="/api/v1/auth")
    first = await world.client.post("/api/v1/auth/refresh")
    assert first.status_code == 200
    again = await world.client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert again.status_code == 401


async def test_unissued_refresh_token_is_rejected(world: World) -> None:
    from src.core.models.user import User  # noqa: F401
    from src.shared.security import create_refresh_token

    # токен, подписанный нашим ключом, но не выданный сервером (нет в Redis), не принимается
    forged = create_refresh_token({"sub": str(world.member_id)})
    resp = await world.client.post("/api/v1/auth/refresh", json={"refresh_token": forged})
    assert resp.status_code == 401


def test_telegram_auth_date_must_be_a_number() -> None:
    from src.shared.security import _check_auth_date

    for bad in (None, "abc", ""):
        with pytest.raises(AuthenticationError):
            _check_auth_date(bad, "Init data")
    old = str(int((datetime.now(tz=UTC) - timedelta(days=2)).timestamp()))
    with pytest.raises(AuthenticationError):
        _check_auth_date(old, "Init data")


# ─── Конфигурация (#111) ───

_OK = "x" * 40


def _settings(**kw: Any) -> Settings:
    base: dict[str, Any] = {
        "APP_ENV": "production",
        "APP_SECRET_KEY": _OK,
        "JWT_SECRET_KEY": "y" * 40,
        "DATABASE_URL": "postgresql+asyncpg://u:p@h/db",
    }
    base.update(kw)
    return Settings(_env_file=None, **base)


def test_production_rejects_example_or_short_secrets() -> None:
    for secret in ("change-me-minimum-32-characters-long", "short", "вставьте-длинный-случайный-секрет" * 2):
        with pytest.raises(PydanticValidationError):
            _settings(APP_SECRET_KEY=secret)
    with pytest.raises(PydanticValidationError):
        _settings(JWT_SECRET_KEY=_OK)  # совпадает с APP_SECRET_KEY


def test_production_accepts_strong_secrets_and_is_the_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    assert _settings().is_production
    assert Settings(
        _env_file=None,
        APP_SECRET_KEY=_OK,
        JWT_SECRET_KEY="y" * 40,
        DATABASE_URL="postgresql+asyncpg://u:p@h/db",
    ).is_production


def test_development_keeps_short_secrets() -> None:
    assert _settings(APP_ENV="development", APP_SECRET_KEY="dev", JWT_SECRET_KEY="dev2").is_development


async def test_openapi_hidden_outside_development(world: World) -> None:
    resp = await world.client.get("/openapi.json")
    assert resp.status_code == 404


# ─── Личные задания в рассылках (#98) ───


async def test_other_member_does_not_see_personal_deadline(world: World, db_engine: Any) -> None:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.core.repositories.assignment import AssignmentRepository

    maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        repo = AssignmentRepository(s)
        for a in await repo.get_group_assignments(world.group_id):
            await repo.update(a, deadline=datetime.utcnow() + timedelta(days=1))
        await s.commit()

        for_group = await repo.get_upcoming_deadlines(world.group_id)
        assert {a.title for a in for_group} == {"public"}
        for_author = await repo.get_upcoming_deadlines(world.group_id, viewer_id=world.member_id)
        assert {a.title for a in for_author} == {"public", "private"}
        for_other = await repo.get_upcoming_deadlines(world.group_id, viewer_id=world.outsider_id)
        assert {a.title for a in for_other} == {"public"}


# ─── Бот: HTML не проходит как разметка (#110) ───


def test_bot_messages_escape_user_text() -> None:
    from src.gateways.telegram.handlers.forward import _format_preview
    from src.gateways.telegram.handlers.schedule import format_deadline, format_entry_full

    evil = '<a href="https://evil.example">x</a>'
    preview = _format_preview(evil, evil, None)
    assert evil not in preview and escape(evil) in preview

    assignment = SimpleNamespace(
        title=evil,
        subject=SimpleNamespace(name=evil),
        deadline=None,
        priority="normal",
        description=evil,
    )
    assert evil not in format_deadline(assignment)

    entry = {"subject": {"name": evil}, "teacher": evil, "location": evil, "lesson_type": evil}
    assert evil not in format_entry_full(entry)


# ─── ФЗ-152 (#116) ───


async def test_consent_type_is_validated(world: World) -> None:
    ok = await world.client.post(
        "/api/v1/users/me/consents",
        json={"consent_type": "data_processing"},
        headers=world.auth(world.member_id),
    )
    assert ok.status_code == 201
    bad = await world.client.post(
        "/api/v1/users/me/consents",
        json={"consent_type": "x" * 500},
        headers=world.auth(world.member_id),
    )
    assert bad.status_code == 422


async def test_data_export_includes_user_content(world: World) -> None:
    resp = await world.client.get("/api/v1/users/me/data", headers=world.auth(world.member_id))
    assert resp.status_code == 200
    body = resp.json()
    assert {a["title"] for a in body["assignments_authored"]} == {"private", "public"}
    assert len(body["memberships"]) == 1


async def test_retention_clears_old_network_metadata(db_engine: Any) -> None:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    from src.core.models.user import AuditLog
    from src.core.retention import purge_old_network_metadata

    maker = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        old = AuditLog(
            action="login",
            ip_address="1.2.3.4",
            user_agent="ua",
            created_at=datetime.now(tz=UTC).replace(tzinfo=None) - timedelta(days=400),
        )
        fresh = AuditLog(action="login", ip_address="5.6.7.8", user_agent="ua")
        s.add_all([old, fresh])
        await s.commit()

        changed = await purge_old_network_metadata(s, days=365)
        assert changed == 1

        rows = {r.id: r for r in (await s.execute(select(AuditLog))).scalars().all()}
        assert rows[old.id].ip_address is None and rows[old.id].user_agent is None
        assert rows[fresh.id].ip_address == "5.6.7.8"
        assert uuid.UUID(str(old.id))
