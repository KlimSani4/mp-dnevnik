"""Gateway registry for managing providers."""

from src.gateways.base import AuthProvider, MembershipChecker, Notifier


class GatewayRegistry:
    """Registry for gateway providers."""

    def __init__(self) -> None:
        self._auth_providers: dict[str, AuthProvider] = {}
        self._membership_checkers: dict[str, MembershipChecker] = {}
        self._notifiers: dict[str, Notifier] = {}

    def register_auth_provider(self, provider: AuthProvider) -> None:
        """Register authentication provider."""
        self._auth_providers[provider.provider] = provider

    def register_membership_checker(self, provider_name: str, checker: MembershipChecker) -> None:
        """Register membership checker."""
        self._membership_checkers[provider_name] = checker

    def register_notifier(self, provider_name: str, notifier: Notifier) -> None:
        """Register notifier."""
        self._notifiers[provider_name] = notifier

    def get_auth_provider(self, provider: str) -> AuthProvider | None:
        """Get authentication provider by name."""
        return self._auth_providers.get(provider)

    def get_membership_checker(self, provider: str) -> MembershipChecker | None:
        """Get membership checker by provider name."""
        return self._membership_checkers.get(provider)

    def get_notifier(self, provider: str) -> Notifier | None:
        """Get notifier by provider name."""
        return self._notifiers.get(provider)

    @property
    def providers(self) -> list[str]:
        """Get list of registered provider names."""
        return list(set(self._auth_providers.keys()) | set(self._notifiers.keys()))


# Global registry instance
registry = GatewayRegistry()
