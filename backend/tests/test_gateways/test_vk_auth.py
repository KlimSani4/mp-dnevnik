"""VK HTTP API is replaced with a fake client :-)"""

from typing import Any
from unittest.mock import patch

import httpx
import pytest

from src.gateways.vk.auth import VK_TOKEN_URL, VK_USER_INFO_URL, VKAuthProvider
from src.shared.exceptions import (
    AuthenticationError,
    ExternalServiceError,
    ServiceUnavailableError,
    ValidationError,
)

VALID_DATA = {
    "code": "auth-code",
    "code_verifier": "verifier",
    "device_id": "device-1",
    "state": "xyz",
}


class FakeResponse:
    def __init__(self, status_code: int = 200, payload: Any = None, bad_json: bool = False) -> None:
        self.status_code = status_code
        self._payload = payload
        self._bad_json = bad_json

    def json(self) -> Any:
        if self._bad_json:
            raise ValueError("not json")
        return self._payload


class FakeClient:
    """Returns queued responses in order and records the calls."""

    def __init__(self, *responses: FakeResponse | Exception) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, dict[str, str]]] = []

    async def post(self, url: str, data: dict[str, str]) -> FakeResponse:
        self.calls.append((url, data))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def _ok_client(user: dict[str, Any] | None = None) -> FakeClient:
    return FakeClient(
        FakeResponse(payload={"access_token": "vk-token", "user_id": 777}),
        FakeResponse(
            payload={
                "user": user
                or {
                    "user_id": "777",
                    "first_name": "Алина",
                    "last_name": "Минок",
                    "email": "secret@example.com",
                }
            }
        ),
    )


@pytest.fixture(autouse=True)
def vk_settings():  # type: ignore[no-untyped-def]
    with patch("src.gateways.vk.auth.settings") as s:
        s.VK_CLIENT_ID = "12345"
        s.VK_REDIRECT_URI = "https://example.com/auth/vk"
        s.VK_SERVICE_TOKEN = ""
        yield s


class TestVKAuthProvider:
    @pytest.mark.asyncio
    async def test_returns_identity(self) -> None:
        client = _ok_client()

        identity = await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

        assert identity.provider == "vk"
        assert identity.external_id == "777"
        assert identity.display_name == "Алина Минок"

    @pytest.mark.asyncio
    async def test_sends_pkce_params_to_vk(self) -> None:
        client = _ok_client()

        await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

        (token_url, token_form), (info_url, info_form) = client.calls
        assert token_url == VK_TOKEN_URL
        assert token_form["grant_type"] == "authorization_code"
        assert token_form["code"] == "auth-code"
        assert token_form["code_verifier"] == "verifier"
        assert token_form["device_id"] == "device-1"
        assert token_form["client_id"] == "12345"
        assert token_form["redirect_uri"] == "https://example.com/auth/vk"
        assert token_form["state"] == "xyz"
        assert "service_token" not in token_form
        assert info_url == VK_USER_INFO_URL
        assert info_form == {"client_id": "12345", "access_token": "vk-token"}

    @pytest.mark.asyncio
    async def test_raw_data_has_no_tokens_or_email(self) -> None:
        identity = await VKAuthProvider(_ok_client()).validate(VALID_DATA)  # type: ignore[arg-type]

        assert identity.raw_data == {"first_name": "Алина", "last_name": "Минок"}

    @pytest.mark.asyncio
    async def test_external_id_comes_from_vk_not_from_request(self) -> None:
        data = {**VALID_DATA, "user_id": "999", "external_id": "999"}

        identity = await VKAuthProvider(_ok_client()).validate(data)  # type: ignore[arg-type]

        assert identity.external_id == "777"

    @pytest.mark.asyncio
    async def test_falls_back_to_user_id_from_token_response(self) -> None:
        client = FakeClient(
            FakeResponse(payload={"access_token": "t", "user_id": 555}),
            FakeResponse(payload={"user": {"first_name": "A"}}),
        )

        identity = await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

        assert identity.external_id == "555"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("missing", ["code", "code_verifier", "device_id", "state"])
    async def test_missing_field_is_validation_error(self, missing: str) -> None:
        data = {k: v for k, v in VALID_DATA.items() if k != missing}
        client = _ok_client()

        with pytest.raises(ValidationError):
            await VKAuthProvider(client).validate(data)  # type: ignore[arg-type]

        assert client.calls == []

    @pytest.mark.asyncio
    async def test_service_token_sent_for_confidential_app(self, vk_settings: Any) -> None:
        vk_settings.VK_SERVICE_TOKEN = "service-key"
        client = _ok_client()

        await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

        assert client.calls[0][1]["service_token"] == "service-key"

    @pytest.mark.asyncio
    async def test_state_mismatch_in_response(self) -> None:
        client = FakeClient(FakeResponse(payload={"access_token": "t", "state": "other"}))

        with pytest.raises(AuthenticationError, match="state"):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

        assert len(client.calls) == 1  # user_info is not requested

    @pytest.mark.asyncio
    async def test_not_configured(self, vk_settings: Any) -> None:
        vk_settings.VK_CLIENT_ID = ""

        with pytest.raises(ServiceUnavailableError):
            await VKAuthProvider(_ok_client()).validate(VALID_DATA)  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_vk_rejects_code(self) -> None:
        client = FakeClient(FakeResponse(400, {"error": "invalid_grant"}))

        with pytest.raises(AuthenticationError):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_no_access_token(self) -> None:
        client = FakeClient(FakeResponse(payload={"user_id": 1}))

        with pytest.raises(AuthenticationError):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_user_info_rejected(self) -> None:
        client = FakeClient(
            FakeResponse(payload={"access_token": "t"}),
            FakeResponse(401, {"error": "invalid_token"}),
        )

        with pytest.raises(AuthenticationError):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_missing_user_id(self) -> None:
        client = FakeClient(
            FakeResponse(payload={"access_token": "t"}),
            FakeResponse(payload={"user": {"first_name": "A"}}),
        )

        with pytest.raises(AuthenticationError, match="missing user ID"):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_vk_server_error(self) -> None:
        client = FakeClient(FakeResponse(503, {}))

        with pytest.raises(ExternalServiceError):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_network_error(self) -> None:
        client = FakeClient(httpx.ConnectError("boom"))

        with pytest.raises(ExternalServiceError):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_non_json_response(self) -> None:
        client = FakeClient(FakeResponse(200, bad_json=True))

        with pytest.raises(ExternalServiceError):
            await VKAuthProvider(client).validate(VALID_DATA)  # type: ignore[arg-type]