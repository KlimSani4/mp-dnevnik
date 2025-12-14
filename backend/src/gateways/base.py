"""Abstract base classes for gateway interfaces."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class ExternalIdentity:
    """Identity information from external provider."""

    provider: str
    external_id: str
    username: str | None
    display_name: str | None
    raw_data: dict[str, Any]


class AuthProvider(ABC):
    """Interface for authentication providers."""

    provider: str

    @abstractmethod
    async def validate(self, data: dict[str, Any]) -> ExternalIdentity:
        """Validate authentication data and return identity."""
        ...


class MembershipChecker(ABC):
    """Interface for checking chat membership."""

    @abstractmethod
    async def check_membership(self, chat_id: str, external_id: str) -> bool:
        """Check if user is member of a chat."""
        ...


class Notifier(ABC):
    """Interface for sending notifications."""

    @abstractmethod
    async def send_message(
        self,
        external_id: str,
        text: str,
        *,
        parse_mode: str | None = None,
    ) -> None:
        """Send message to user."""
        ...

    @abstractmethod
    async def send_to_chat(
        self,
        chat_id: str,
        text: str,
        *,
        parse_mode: str | None = None,
    ) -> None:
        """Send message to chat."""
        ...
