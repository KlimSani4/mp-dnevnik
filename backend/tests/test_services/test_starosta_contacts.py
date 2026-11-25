"""Староста видит Telegram участников и заявок (#148)."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.core.models.group import StudentRole
from src.core.services.auth import AuthService, ExternalIdentity
from src.core.services.group import GroupService
from src.core.telegram_contact import telegram_contact
from src.shared.exceptions import AuthorizationError, ConflictError


def test_contact_with_username() -> None:
    c = telegram_contact([_identity_with("alina_m", {"first_name": "Алина", "last_name": "Минок"})])
    assert c is not None
    assert (c.username, c.name, c.profile_url) == ("alina_m", "Алина Минок", "https://t.me/alina_m")


def _identity_with(username: str | None, raw: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(provider="telegram", username=username, raw_data=raw)


def test_contact_without_username_uses_name() -> None:
    c = telegram_contact([_identity_with(None, {"first_name": "Феликс", "last_name": None})])
    assert c is not None
    assert (c.username, c.name, c.profile_url) == (None, "Феликс", None)


def test_contact_from_mini_app_raw_data() -> None:
    raw = {"user": '{"id": 1, "first_name": "Илья", "last_name": "Конарев"}'}
    c = telegram_contact([_identity_with("ilya", raw)])
    assert c is not None
    assert c.name == "Илья Конарев"


def test_contact_ignores_bad_username_and_other_providers() -> None:
    vk = SimpleNamespace(provider="vk", username="someone", raw_data={})
    assert telegram_contact([vk]) is None
    c = telegram_contact([_identity_with("bad name<script>", {})])
    assert c is not None
    assert c.username is None and c.profile_url is None


def _group_service() -> GroupService:
    session = MagicMock()
    session.commit = AsyncMock()
    svc = GroupService(session)
    svc.group_repo = AsyncMock()
    svc.group_repo.get_by_code = AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))
    svc.student_repo = AsyncMock()
    svc.user_repo = AsyncMock()
    svc.user_repo.get = AsyncMock(return_value=SimpleNamespace(is_moderator=False))
    svc.audit_repo = AsyncMock()
    return svc


def _student(role: StudentRole, verified: bool) -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), role=role, verified=verified)


async def test_starosta_rejects_pending_request() -> None:
    svc = _group_service()
    pending = _student(StudentRole.STUDENT, verified=False)
    svc.student_repo.get_by_user_and_group = AsyncMock(
        side_effect=[_student(StudentRole.STAROSTA, True), pending]
    )
    await svc.reject_student("241-327", uuid.uuid4(), uuid.uuid4())
    svc.student_repo.delete.assert_awaited_once_with(pending)
    svc.audit_repo.log.assert_awaited_once()
    assert svc.audit_repo.log.await_args.kwargs["action"] == "student_rejected"


async def test_cannot_reject_verified_member() -> None:
    svc = _group_service()
    svc.student_repo.get_by_user_and_group = AsyncMock(
        side_effect=[_student(StudentRole.STAROSTA, True), _student(StudentRole.STUDENT, True)]
    )
    with pytest.raises(ConflictError):
        await svc.reject_student("241-327", uuid.uuid4(), uuid.uuid4())
    svc.student_repo.delete.assert_not_awaited()


@pytest.mark.parametrize("role", [StudentRole.STUDENT, StudentRole.ASSISTANT])
async def test_only_starosta_or_deputy_can_reject(role: StudentRole) -> None:
    svc = _group_service()
    svc.student_repo.get_by_user_and_group = AsyncMock(return_value=_student(role, True))
    with pytest.raises(AuthorizationError):
        await svc.reject_student("241-327", uuid.uuid4(), uuid.uuid4())


async def test_login_refreshes_username() -> None:
    svc = AuthService(MagicMock())
    svc.user_repo = AsyncMock()
    svc.user_repo.get_by_identity = AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))
    stored = SimpleNamespace(
        username="old_nick", raw_data={"first_name": "Алина", "photo_url": "x"}
    )
    svc.identity_repo = AsyncMock()
    svc.identity_repo.get_by_external = AsyncMock(return_value=stored)

    ident = ExternalIdentity(
        provider="telegram",
        external_id="1",
        username="new_nick",
        display_name="Алина",
        raw_data={"first_name": "Алина", "last_name": "Минок"},
    )
    await svc._get_or_create_user(ident)

    assert stored.username == "new_nick"
    assert stored.raw_data == {"first_name": "Алина", "last_name": "Минок", "photo_url": "x"}


async def test_login_without_username_keeps_stored() -> None:
    svc = AuthService(MagicMock())
    svc.user_repo = AsyncMock()
    svc.user_repo.get_by_identity = AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))
    stored = SimpleNamespace(username="nick", raw_data={})
    svc.identity_repo = AsyncMock()
    svc.identity_repo.get_by_external = AsyncMock(return_value=stored)
    await svc._get_or_create_user(
        ExternalIdentity(
            provider="telegram", external_id="1", username=None, display_name="x", raw_data={}
        )
    )
    assert stored.username == "nick"
