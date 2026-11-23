"""Контакт Telegram участника для старосты (#148).

Из identity с provider=telegram достаём @username и имя. Имя лежит в raw_data
по-разному в зависимости от способа входа: у виджета и у бота — first_name/last_name
на верхнем уровне, у Mini App — внутри JSON-строки user.
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

from src.core.schemas.group import TelegramContact

if TYPE_CHECKING:
    from src.core.models.user import Identity

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{4,32}$")


def _name_parts(raw: dict[str, Any]) -> tuple[str, str]:
    first, last = raw.get("first_name"), raw.get("last_name")
    if not first and not last and raw.get("user"):
        user = raw["user"]
        if isinstance(user, str):
            try:
                user = json.loads(user)
            except ValueError:
                user = {}
        if isinstance(user, dict):
            first, last = user.get("first_name"), user.get("last_name")
    return (str(first or "").strip(), str(last or "").strip())


def telegram_contact(identities: list[Identity]) -> TelegramContact | None:
    identity = next((i for i in identities if i.provider == "telegram"), None)
    if identity is None:
        return None
    username = (
        identity.username if identity.username and _USERNAME_RE.match(identity.username) else None
    )
    name = " ".join(p for p in _name_parts(identity.raw_data or {}) if p) or None
    return TelegramContact(
        username=username,
        name=name,
        profile_url=f"https://t.me/{username}" if username else None,
    )
