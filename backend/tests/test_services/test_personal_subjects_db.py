"""Личные предметы видит только их владелец (#101). Тесты на настоящей PostgreSQL."""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.core.models.base import Base
from src.core.models.group import Group, Student
from src.core.models.schedule import Subject
from src.core.models.user import User
from src.core.schemas.schedule import SubjectCreate
from src.core.services.group import GroupService
from src.shared.exceptions import AuthorizationError
from tests.conftest import TEST_DATABASE_URL


@pytest.fixture
async def engine() -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(TEST_DATABASE_URL)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except (OSError, SQLAlchemyError) as e:
        await eng.dispose()
        pytest.skip(f"PostgreSQL недоступна: {e}")
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture
async def setup(engine: AsyncEngine) -> tuple[async_sessionmaker[AsyncSession], dict[str, User]]:
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        users = {name: User(display_name=name) for name in ("alina", "felix", "outsider")}
        s.add_all(users.values())
        await s.flush()
        group = Group(code="241-327", name="241-327", owner_id=users["alina"].id)
        s.add(group)
        await s.flush()
        s.add_all(
            [
                Student(user_id=users["alina"].id, group_id=group.id),
                Student(user_id=users["felix"].id, group_id=group.id),
                Subject(name="Экономика", group_id=group.id, is_custom=False),
                # Личный предмет, созданный до миграции 007: автор неизвестен
                Subject(name="Старый личный", group_id=group.id, is_custom=True),
            ]
        )
        await s.commit()
    return maker, users


async def _names(maker: async_sessionmaker[AsyncSession], viewer: User | None) -> set[str]:
    async with maker() as s:
        subjects = await GroupService(s).get_group_subjects(
            "241-327", viewer.id if viewer else None
        )
    return {x.name for x in subjects}


async def test_personal_subject_visible_only_to_owner(
    setup: tuple[async_sessionmaker[AsyncSession], dict[str, User]],
) -> None:
    maker, users = setup
    async with maker() as s:
        created = await GroupService(s).create_custom_subject(
            "241-327", SubjectCreate(name="Английский с репетитором"), users["alina"].id
        )
    assert created.is_custom

    assert "Английский с репетитором" in await _names(maker, users["alina"])
    assert "Английский с репетитором" not in await _names(maker, users["felix"])
    assert "Английский с репетитором" not in await _names(maker, None)


async def test_official_and_legacy_subjects_visible_to_all(
    setup: tuple[async_sessionmaker[AsyncSession], dict[str, User]],
) -> None:
    maker, users = setup
    for viewer in (users["alina"], users["felix"], None):
        assert {"Экономика", "Старый личный"} <= await _names(maker, viewer)


async def test_non_member_cannot_create_subject(
    setup: tuple[async_sessionmaker[AsyncSession], dict[str, User]],
) -> None:
    maker, users = setup
    async with maker() as s:
        with pytest.raises(AuthorizationError):
            await GroupService(s).create_custom_subject(
                "241-327", SubjectCreate(name="Чужой"), users["outsider"].id
            )
