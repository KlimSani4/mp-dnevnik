"""Telegram authentication provider."""

import json
from typing import Any

from src.gateways.base import AuthProvider, ExternalIdentity
from src.shared.security import validate_telegram_init_data, validate_telegram_widget_data


class TelegramAuthProvider(AuthProvider):
    """Telegram authentication via init_data or widget."""

    provider = "telegram"

    async def validate(self, data: dict[str, Any]) -> ExternalIdentity:
        """
        Validate Telegram auth data.

        Expects either:
        - {"init_data": "..."} for Mini App
        - {"widget_data": {...}} for Login Widget
        """
        if "init_data" in data:
            return await self._validate_init_data(data["init_data"])
        elif "widget_data" in data:
            return await self._validate_widget(data["widget_data"])
        else:
            raise ValueError("Missing init_data or widget_data")

    async def _validate_init_data(self, init_data: str) -> ExternalIdentity:
        """Validate Mini App init_data."""
        parsed = validate_telegram_init_data(init_data)

        user_data = json.loads(parsed.get("user", "{}"))
        external_id = str(user_data.get("id", ""))
        username = user_data.get("username")
        first_name = user_data.get("first_name", "")
        last_name = user_data.get("last_name", "")

        return ExternalIdentity(
            provider=self.provider,
            external_id=external_id,
            username=username,
            display_name=f"{first_name} {last_name}".strip() or username,
            raw_data=parsed,
        )

    async def _validate_widget(self, widget_data: dict[str, Any]) -> ExternalIdentity:
        """Validate Login Widget data."""
        parsed = validate_telegram_widget_data(widget_data.copy())

        external_id = str(parsed.get("id", ""))
        username = parsed.get("username")
        first_name = parsed.get("first_name", "")
        last_name = parsed.get("last_name", "")

        return ExternalIdentity(
            provider=self.provider,
            external_id=external_id,
            username=username,
            display_name=f"{first_name} {last_name}".strip() or username,
            raw_data=parsed,
        )
