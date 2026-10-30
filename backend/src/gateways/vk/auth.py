from typing import Any

import httpx

from src.config import settings
from src.gateways.base import AuthProvider, ExternalIdentity
from src.shared.exceptions import AuthenticationError, ValidationError

VK_TOKEN_URL = "https://id.vk.ru/oauth2/auth"
VK_USER_INFO_URL = "https://id.vk.ru/oauth2/user_info"

class VKAuthProvider(AuthProvider):

    provider = "vk"

    async def validate(self, data: dict[str, Any]) -> ExternalIdentity:
        required_keys = ["code", "code_verifier", "device_id", "state"]
        for key in required_keys:
            if key in data:
                if not data[key]:
                    raise ValidationError(f"Missing {key} value")
            else:
                raise ValidationError(f"Missing {key} data")

        async with httpx.AsyncClient() as client:
            # 1 request - code -> token
            response = await client.post(
                VK_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": data["code"],
                    "code_verifier": data["code_verifier"],
                    "device_id": data["device_id"],
                    "state": data["state"],
                    "client_id": settings.VK_CLIENT_ID,
                    "redirect_uri": settings.VK_REDIRECT_URI,
                    "service_token": settings.VK_SERVICE_TOKEN,
                },
            )
            token_data = response.json()
            if "error" in token_data:
                raise AuthenticationError("VK authentication failed")
            access_token = token_data["access_token"]
            # 2 request - user data
            response = await client.post(
                VK_USER_INFO_URL,
                data={"client_id": settings.VK_CLIENT_ID, "access_token": access_token},
            )
            user = response.json()["user"]
            if "error" in user:
                            raise AuthenticationError("user data error")

        external_id = str(user["user_id"])
        first_name = user.get("first_name", "")
        last_name = user.get("last_name", "")

        return ExternalIdentity(
            provider=self.provider,
            external_id=external_id,
            username=None,  # у VK тут его нет
            display_name=f"{first_name} {last_name}".strip() or None,
            raw_data={"first_name": first_name, "last_name": last_name},
        )
