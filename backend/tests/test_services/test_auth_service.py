"""Auth service unit tests — all DB/security calls are mocked."""

import json
import uuid
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.models.user import User
from src.core.schemas.auth import TokenResponse
from src.core.services.auth import AuthService
from src.shared.exceptions import AuthenticationError, ValidationError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(user_id: uuid.UUID | None = None, display_name: str = "Test User") -> User:
    u = User()
    u.id = user_id or uuid.uuid4()
    u.display_name = display_name
    u.settings = {}
    return u


def _make_service(session: MagicMock) -> AuthService:
    svc = AuthService(session)
    svc.user_repo = AsyncMock()
    svc.identity_repo = AsyncMock()
    svc.consent_repo = AsyncMock()
    svc.audit_repo = AsyncMock()
    return svc


def _make_token_response() -> TokenResponse:
    return TokenResponse(
        access_token="access.token.here",
        refresh_token="refresh.token.here",
        token_type="bearer",
        expires_in=3600,
    )


# ---------------------------------------------------------------------------
# register_from_bot
# ---------------------------------------------------------------------------

class TestRegisterFromBot:
    @pytest.mark.asyncio
    async def test_creates_new_user(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        new_user = _make_user()
        svc.user_repo.get_by_identity = AsyncMock(return_value=None)
        svc.user_repo.create = AsyncMock(return_value=new_user)
        svc.identity_repo.create = AsyncMock()

        result = await svc.register_from_bot(
            telegram_id="123456",
            username="john",
            first_name="John",
            last_name="Doe",
        )

        assert result is new_user
        svc.user_repo.create.assert_awaited_once()
        svc.identity_repo.create.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_returns_existing_user(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        existing = _make_user()
        svc.user_repo.get_by_identity = AsyncMock(return_value=existing)

        result = await svc.register_from_bot(telegram_id="123456")

        assert result is existing
        svc.user_repo.create.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_display_name_from_names(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        new_user = _make_user()
        svc.user_repo.get_by_identity = AsyncMock(return_value=None)
        svc.user_repo.create = AsyncMock(return_value=new_user)
        svc.identity_repo.create = AsyncMock()

        await svc.register_from_bot(
            telegram_id="999",
            first_name="Анна",
            last_name="Иванова",
        )

        call_kwargs = svc.user_repo.create.call_args.kwargs
        assert call_kwargs["display_name"] == "Анна Иванова"

    @pytest.mark.asyncio
    async def test_display_name_fallback_to_username(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        new_user = _make_user()
        svc.user_repo.get_by_identity = AsyncMock(return_value=None)
        svc.user_repo.create = AsyncMock(return_value=new_user)
        svc.identity_repo.create = AsyncMock()

        await svc.register_from_bot(telegram_id="999", username="johndoe")

        call_kwargs = svc.user_repo.create.call_args.kwargs
        assert call_kwargs["display_name"] == "johndoe"


# ---------------------------------------------------------------------------
# _create_tokens
# ---------------------------------------------------------------------------

class TestCreateTokens:
    def test_returns_token_response(self) -> None:
        session = MagicMock()
        svc = AuthService.__new__(AuthService)
        svc.session = session

        user = _make_user()

        with (
            patch("src.core.services.auth.create_access_token", return_value="acc"),
            patch("src.core.services.auth.create_refresh_token", return_value="ref"),
            patch("src.core.services.auth.settings") as mock_settings,
        ):
            mock_settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60
            tokens = svc._create_tokens(user)

        assert tokens.access_token == "acc"
        assert tokens.refresh_token == "ref"
        assert tokens.token_type == "bearer"
        assert tokens.expires_in == 3600


# ---------------------------------------------------------------------------
# authenticate_telegram — init_data path
# ---------------------------------------------------------------------------

class TestAuthenticateTelegramInitData:
    @pytest.mark.asyncio
    async def test_valid_init_data_creates_tokens(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        user = _make_user()
        svc.user_repo.get_by_identity = AsyncMock(return_value=user)
        svc.audit_repo.log = AsyncMock()

        user_payload = json.dumps({"id": 111, "first_name": "Alice", "username": "alice"})

        with (
            patch(
                "src.core.services.auth.validate_telegram_init_data",
                return_value={"user": user_payload, "auth_date": "9999999999"},
            ),
            patch("src.core.services.auth.create_access_token", return_value="acc"),
            patch("src.core.services.auth.create_refresh_token", return_value="ref"),
            patch("src.core.services.auth.settings") as mock_settings,
        ):
            mock_settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60
            result_user, tokens, is_new = await svc.authenticate_telegram(
                init_data="query_id=xxx&user=%7B%7D&hash=yyy"
            )

        assert result_user is user
        assert tokens.access_token == "acc"
        assert is_new is False

    @pytest.mark.asyncio
    async def test_missing_user_id_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        with (
            patch(
                "src.core.services.auth.validate_telegram_init_data",
                return_value={"user": json.dumps({}), "auth_date": "9999999999"},
            ),
        ):
            with pytest.raises(AuthenticationError):
                await svc.authenticate_telegram(init_data="some_init_data")

    @pytest.mark.asyncio
    async def test_no_data_raises_validation_error(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        with pytest.raises(ValidationError):
            await svc.authenticate_telegram()


# ---------------------------------------------------------------------------
# authenticate_telegram — widget_data path
# ---------------------------------------------------------------------------

class TestAuthenticateTelegramWidgetData:
    @pytest.mark.asyncio
    async def test_valid_widget_data(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        user = _make_user()
        svc.user_repo.get_by_identity = AsyncMock(return_value=None)
        svc.user_repo.create = AsyncMock(return_value=user)
        svc.identity_repo.create = AsyncMock()
        svc.audit_repo.log = AsyncMock()

        widget = {
            "id": 222,
            "first_name": "Bob",
            "username": "bobik",
            "hash": "abc",
            "auth_date": "9999999999",
        }

        with (
            patch(
                "src.core.services.auth.validate_telegram_widget_data",
                return_value={**widget},
            ),
            patch("src.core.services.auth.create_access_token", return_value="acc"),
            patch("src.core.services.auth.create_refresh_token", return_value="ref"),
            patch("src.core.services.auth.settings") as mock_settings,
        ):
            mock_settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60
            result_user, tokens, is_new = await svc.authenticate_telegram(widget_data=widget)

        assert tokens.access_token == "acc"
        assert is_new is True


# ---------------------------------------------------------------------------
# refresh_tokens
# ---------------------------------------------------------------------------

class TestRefreshTokens:
    @pytest.mark.asyncio
    async def test_valid_refresh_token(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        user_id = uuid.uuid4()
        user = _make_user(user_id)
        svc.user_repo.get = AsyncMock(return_value=user)
        svc.audit_repo.log = AsyncMock()

        with (
            patch(
                "src.core.services.auth.decode_token",
                return_value={"type": "refresh", "sub": str(user_id)},
            ),
            patch("src.core.services.auth.create_access_token", return_value="new_acc"),
            patch("src.core.services.auth.create_refresh_token", return_value="new_ref"),
            patch("src.core.services.auth.settings") as mock_settings,
        ):
            mock_settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60
            tokens = await svc.refresh_tokens("old_refresh_token")

        assert tokens.access_token == "new_acc"

    @pytest.mark.asyncio
    async def test_wrong_token_type_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        with patch(
            "src.core.services.auth.decode_token",
            return_value={"type": "access", "sub": str(uuid.uuid4())},
        ):
            with pytest.raises(AuthenticationError, match="Invalid token type"):
                await svc.refresh_tokens("not_a_refresh_token")

    @pytest.mark.asyncio
    async def test_user_not_found_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        user_id = uuid.uuid4()
        svc.user_repo.get = AsyncMock(return_value=None)

        with patch(
            "src.core.services.auth.decode_token",
            return_value={"type": "refresh", "sub": str(user_id)},
        ):
            with pytest.raises(AuthenticationError, match="User not found"):
                await svc.refresh_tokens("token")

    @pytest.mark.asyncio
    async def test_invalid_token_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        with patch(
            "src.core.services.auth.decode_token",
            side_effect=AuthenticationError("Invalid token"),
        ):
            with pytest.raises(AuthenticationError):
                await svc.refresh_tokens("garbage_token")


# ---------------------------------------------------------------------------
# logout
# ---------------------------------------------------------------------------

class TestLogout:
    @pytest.mark.asyncio
    async def test_logout_audits(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)
        svc.audit_repo.log = AsyncMock()

        user_id = uuid.uuid4()
        await svc.logout(user_id, ip_address="1.2.3.4", user_agent="pytest")

        svc.audit_repo.log.assert_awaited_once_with(
            action="logout",
            user_id=user_id,
            resource="auth",
            ip_address="1.2.3.4",
            user_agent="pytest",
        )
        session.commit.assert_awaited_once()
