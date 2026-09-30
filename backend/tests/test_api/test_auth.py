"""Authentication endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_telegram_auth_requires_data(client: AsyncClient) -> None:
    """Test Telegram auth requires init_data or widget_data."""
    response = await client.post("/api/v1/auth/telegram", json={})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_refresh_requires_token(client: AsyncClient) -> None:
    """Test refresh endpoint requires refresh_token."""
    response = await client.post("/api/v1/auth/refresh", json={})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_logout_requires_auth(client: AsyncClient) -> None:
    """Test logout requires authentication."""
    response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 401
