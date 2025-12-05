"""Telegram bot dependencies."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.database import async_session_maker


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Get database session for bot handlers."""
    async with async_session_maker() as session:
        yield session
