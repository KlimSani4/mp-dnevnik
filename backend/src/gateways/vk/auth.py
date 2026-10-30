import logging
from typing import Any

import httpx

from src.config import settings
from src.gateways.base import AuthProvider, ExternalIdentity
from src.shared.exceptions import (
    AuthenticationError,
    ExternalServiceError,
    ServiceUnavailableError,
    ValidationError,
)

logger = logging.getLogger(__name__)

VK_TOKEN_URL = "https://id.vk.ru/oauth2/auth"
VK_USER_INFO_URL = "https://id.vk.ru/oauth2/user_info"
REQUEST_TIMEOUT = 10.0


class VKAuthProvider(AuthProvider):
    provider = "vk"

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def validate(self, data: dict[str, Any]) -> ExternalIdentity:
        """
        authorization code -> return the VK identity
        Expects: {"code": "...", "code_verifier": "...", "device_id": "...", "state": "..."}
        (all four come from the redirect back from VK and the frontend's PKCE data).
        """
        if not settings.VK_CLIENT_ID or not settings.VK_REDIRECT_URI:
            raise ServiceUnavailableError("VK authentication is not configured")

        if not all(data.get(key) for key in ("code", "code_verifier", "device_id", "state")):
            raise ValidationError("code, code_verifier, device_id and state are required")

        if self._client is not None:
            return await self._authenticate(self._client, data)
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            return await self._authenticate(client, data)

    async def _authenticate(
        self, client: httpx.AsyncClient, data: dict[str, Any]
    ) -> ExternalIdentity:
        form = {
            "grant_type": "authorization_code",
            "code": data["code"],
            "code_verifier": data["code_verifier"],
            "device_id": data["device_id"],
            "redirect_uri": settings.VK_REDIRECT_URI,
            "client_id": settings.VK_CLIENT_ID,
            "state": data["state"],
        }
        if settings.VK_SERVICE_TOKEN:
            # required for confidential apps (service key from the app settings).
            form["service_token"] = settings.VK_SERVICE_TOKEN

        token_data = await self._post(client, VK_TOKEN_URL, form)

        # na vsyakiy sluchai proverim.
        if token_data.get("state") is not None and token_data["state"] != data["state"]:
            raise AuthenticationError("VK authentication failed: state mismatch")

        access_token = token_data.get("access_token")
        if not access_token:
            raise AuthenticationError("VK did not return an access token")

        info = await self._post(
            client,
            VK_USER_INFO_URL,
            {"client_id": settings.VK_CLIENT_ID, "access_token": access_token},
        )

        user = info.get("user") or {}
        external_id = str(user.get("user_id") or token_data.get("user_id") or "")
        if not external_id:
            raise AuthenticationError("Invalid VK data: missing user ID")

        first_name = user.get("first_name") or ""
        last_name = user.get("last_name") or ""

        return ExternalIdentity(
            provider=self.provider,
            external_id=external_id,
            username=None,
            display_name=f"{first_name} {last_name}".strip() or None,
            raw_data={"first_name": first_name, "last_name": last_name},
        )

    async def _post(
        self, client: httpx.AsyncClient, url: str, form: dict[str, str]
    ) -> dict[str, Any]:
        try:
            response = await client.post(url, data=form)
        except httpx.HTTPError as exc:
            logger.warning("VK request failed", extra={"url": url, "error": str(exc)})
            raise ExternalServiceError("VK is unavailable") from exc

        if response.status_code >= 500:
            logger.warning("VK server error", extra={"url": url, "status": response.status_code})
            raise ExternalServiceError("VK is unavailable")

        try:
            payload = response.json()
        except ValueError as exc:
            raise ExternalServiceError("Invalid response from VK") from exc

        if response.status_code >= 400 or not isinstance(payload, dict) or "error" in payload:
            logger.info(
                "VK rejected request",
                extra={"url": url, "status": response.status_code},
            )
            raise AuthenticationError("VK authentication failed")

        return payload
