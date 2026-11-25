"""Бот: группа в /settings, создание и вступление, выход, /guide (#146, #157, #158).

Хендлеры вызываются напрямую с подменёнными объектами Telegram, база — PostgreSQL.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiogram.types import InlineKeyboardMarkup, Message
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.core.models.base import Base
from src.core.models.group import Group, Student, StudentRole
from src.core.models.user import Identity, User
from src.gateways.telegram.handlers import callbacks, guide, settings, start
from tests.conftest import TEST_DATABASE_URL

RASP = {"241-327", "241-3211"}


@pytest.fixture
async def maker(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    from src.integrations import rasp_groups

    eng: AsyncEngine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    except (OSError, SQLAlchemyError) as e:
        await eng.dispose()
        pytest.skip(f"PostgreSQL недоступна: {e}")
    mk = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)

    async with mk() as s:
        head, me = User(display_name="Староста"), User(display_name="Я")
        s.add_all([head, me])
        await s.flush()
        group = Group(code="241-327", name="241-327", owner_id=head.id)
        s.add(group)
        await s.flush()
        s.add_all(
            [
                Student(
                    user_id=head.id, group_id=group.id, role=StudentRole.STAROSTA, verified=True
                ),
                Identity(user_id=head.id, provider="telegram", external_id="1"),
                Identity(user_id=me.id, provider="telegram", external_id="2"),
            ]
        )
        await s.commit()

    @asynccontextmanager
    async def session() -> AsyncIterator[AsyncSession]:
        async with mk() as s:
            yield s

    async def groups() -> dict[str, str]:
        return {rasp_groups.normalize(c): c for c in RASP}

    async def no_schedule(_code: str) -> list[object]:
        return []

    for mod in (callbacks, settings):
        monkeypatch.setattr(mod, "get_session", session)
    monkeypatch.setattr(rasp_groups, "rasp_groups", groups)
    monkeypatch.setattr("src.integrations.rasp_parser.fetch_group_schedule", no_schedule)
    yield mk
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


def _message(tg_id: int, text: str = "") -> Any:
    m = MagicMock(spec=Message)
    m.from_user = MagicMock(id=tg_id, first_name="Ана")
    m.text = text
    m.answer = AsyncMock()
    m.edit_text = AsyncMock()
    return m


def _callback(tg_id: int, data: str) -> Any:
    cb = MagicMock()
    cb.from_user = MagicMock(id=tg_id, first_name="Ана")
    cb.data = data
    cb.answer = AsyncMock()
    cb.message = _message(tg_id)
    return cb


def _buttons(markup: InlineKeyboardMarkup) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in markup.inline_keyboard:
        for b in row:
            out[b.text] = b.callback_data or b.url or ""
            assert len(out[b.text].encode()) <= 64
    return out


def _state() -> Any:
    st = MagicMock()
    st.clear = AsyncMock()
    st.set_state = AsyncMock()
    return st


@pytest.mark.usefixtures("maker")
async def test_settings_without_group_then_create() -> None:
    text, kb = await settings.settings_view(2, "Ана")
    assert "не указана" in text
    assert _buttons(kb)["📚 Указать группу"] == "settings:group"

    # Нет на rasp — понятная ошибка, состояние не сбрасывается
    m, st = _message(2, "999-999"), _state()
    await callbacks.process_group_input(m, st)
    assert "нет в расписании" in m.answer.call_args.args[0]
    st.clear.assert_not_awaited()

    m, st = _message(2, "241-3211"), _state()
    await callbacks.process_group_input(m, st)
    assert "вы — староста" in m.answer.call_args.args[0]
    st.clear.assert_awaited()

    text, kb = await settings.settings_view(2, "Ана")
    assert "241-3211</b> — староста" in text
    assert "🚪 Выйти из 241-3211" in _buttons(kb)


async def test_join_existing_then_leave(maker: async_sessionmaker[AsyncSession]) -> None:
    m = _message(2, "241-327")
    await callbacks.process_group_input(m, _state())
    assert "Заявка в группу" in m.answer.call_args.args[0]
    text, _ = await settings.settings_view(2, "Ана")
    assert "ждёт подтверждения" in text

    cb = _callback(2, "group:leave:241-327")
    await settings.callback_leave_ask(cb)
    confirm = _buttons(cb.message.edit_text.call_args.kwargs["reply_markup"])["Да, выйти"]
    cb = _callback(2, confirm)
    await settings.callback_leave_confirm(cb)
    assert "Вы вышли" in cb.message.edit_text.call_args.args[0]
    async with maker() as s:
        assert (await s.execute(select(Student).where(Student.verified.is_(False)))).first() is None


@pytest.mark.usefixtures("maker")
async def test_starosta_is_warned_before_leaving() -> None:
    cb = _callback(1, "group:leave:241-327")
    await settings.callback_leave_ask(cb)
    assert "Вы староста" in cb.message.edit_text.call_args.args[0]


@pytest.mark.usefixtures("maker")
async def test_start_and_guide() -> None:
    kb = guide.menu_keyboard()
    sections = [d for d in _buttons(kb).values() if d.startswith("guide:")]
    assert len(sections) == len(guide.SECTIONS)
    for data in [*sections, "guide:menu"]:
        cb = _callback(2, data)
        await guide.callback_guide(cb)
        text = cb.message.edit_text.call_args.args[0]
        assert text.startswith(("❓", "👥", "📅", "📝", "🙋", "📊", "🌐"))
        _buttons(cb.message.edit_text.call_args.kwargs["reply_markup"])

    m = _message(2)
    await start.cmd_help(m)
    assert "/guide" in m.answer.call_args.args[0]


async def test_bot_switches_group_with_confirmation(
    maker: async_sessionmaker[AsyncSession],
) -> None:
    """Вторая группа — только сменой с подтверждением (#162)."""
    await callbacks.process_group_input(_message(2, "241-327"), _state())

    m, st = _message(2, "241-3211"), _state()
    await callbacks.process_group_input(m, st)
    assert "только в одной группе" in m.answer.call_args.args[0]
    switch = _buttons(m.answer.call_args.kwargs["reply_markup"])["🔁 Сменить на 241-3211"]

    cb = _callback(2, switch)
    await callbacks.callback_switch_group(cb)
    assert "вы — староста" in cb.message.edit_text.call_args.args[0]
    async with maker() as s:
        codes = (
            (
                await s.execute(
                    select(Group.code)
                    .join(Student, Student.group_id == Group.id)
                    .join(Identity, Identity.user_id == Student.user_id)
                    .where(Identity.external_id == "2")
                )
            )
            .scalars()
            .all()
        )
    assert codes == ["241-3211"]
