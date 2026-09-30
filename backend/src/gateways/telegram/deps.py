"""Telegram bot dependencies."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.database import async_session_maker


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Get database session for bot handlers."""
    async with async_session_maker() as session:
        yield session
