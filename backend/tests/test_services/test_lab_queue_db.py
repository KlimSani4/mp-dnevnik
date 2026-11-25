"""Очередь на сдачу ЛР (#62). Тесты на настоящей PostgreSQL."""

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import date, datetime, time

import pytest
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
from src.core.models.queue import QueueMode
from src.core.models.schedule import ScheduleEntry, Subject
from src.core.models.semester import Semester, SubjectSemester
from src.core.models.user import User
from src.core.schemas.queue import QueueCreate, QueueDetail
from src.core.services.queue import LabQueueService
from src.shared.exceptions import AuthorizationError, ConflictError, ValidationError
from tests.conftest import TEST_DATABASE_URL

DAY = date(2026, 11, 25)


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


@dataclass
class World:
    maker: async_sessionmaker[AsyncSession]
    users: dict[str, User]
    entry_id: uuid.UUID
    subject_id: uuid.UUID
    students: dict[str, uuid.UUID]
    sent: list[tuple[uuid.UUID, str, list[tuple[str, str]]]] = field(default_factory=list)

    def svc(self, s: AsyncSession) -> LabQueueService:
        async def notify(uid: uuid.UUID, text: str, buttons: list[tuple[str, str]]) -> None:
            self.sent.append((uid, text, buttons))

        return LabQueueService(s, notify=notify)

    async def run(self, method: str, *args: object) -> QueueDetail:
        async with self.maker() as s:
            result: QueueDetail = await getattr(self.svc(s), method)(*args)
            return result


@pytest.fixture
async def world(engine: AsyncEngine) -> World:
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    names = ("head", "anna", "boris", "vera", "gleb", "pending", "outsider", "mod")
    async with maker() as s:
        users = {n: User(display_name=n, is_moderator=(n == "mod")) for n in names}
        s.add_all(users.values())
        await s.flush()
        group = Group(code="241-327", name="241-327", owner_id=users["head"].id)
        s.add(group)
        await s.flush()
        students = {
            n: Student(
                user_id=users[n].id,
                group_id=group.id,
                role=StudentRole.STAROSTA if n == "head" else StudentRole.STUDENT,
                verified=n != "pending",
            )
            for n in ("head", "anna", "boris", "vera", "gleb", "pending")
        }
        s.add_all(students.values())
        subject = Subject(name="Сети ЭВМ", group_id=group.id, is_custom=False)
        s.add(subject)
        await s.flush()
        entry = ScheduleEntry(
            group_id=group.id,
            subject_id=subject.id,
            weekday=3,
            pair_number=2,
            start_time=time(10, 40),
            end_time=time(12, 10),
            lesson_type="Лабораторная",
        )
        semester = Semester(
            name="Осень 2026",
            start_date=date(2026, 9, 1),
            end_date=date(2027, 1, 31),
            is_current=True,
        )
        s.add_all([entry, semester])
        await s.flush()
        s.add(
            SubjectSemester(
                subject_id=subject.id,
                semester_id=semester.id,
                student_id=students["anna"].id,
                total_labs=8,
                done_labs=4,
            )
        )
        await s.commit()
        return World(
            maker=maker,
            users=users,
            entry_id=entry.id,
            subject_id=subject.id,
            students={n: st.id for n, st in students.items()},
        )


async def _open(w: World, mode: QueueMode = QueueMode.FIRST_COME, max_labs: int = 3) -> uuid.UUID:
    data = QueueCreate(
        group_code="241-327", entry_id=w.entry_id, lesson_date=DAY, mode=mode, max_labs=max_labs
    )
    q = await w.run("open", data, w.users["head"])
    assert q.title == "Сети ЭВМ"
    assert q.is_host
    return q.id


def _line(q: QueueDetail) -> list[str]:
    return [e.name for e in q.entries]


async def test_open_join_start_first_come(world: World) -> None:
    w = world
    qid = await _open(w)
    for n, labs in (("boris", [3]), ("anna", [1, 2]), ("vera", [2])):
        await w.run("join", qid, labs, w.users[n])

    q = await w.run("start", qid, w.users["head"])
    assert q.status == "started"
    assert q.entries[0].status == "current"
    assert _line(q) == ["boris", "anna", "vera"]

    late = await w.run("join", qid, [4], w.users["gleb"])
    assert _line(late) == ["boris", "anna", "vera", "gleb"]
    assert late.me is not None and late.me.position == 3


async def test_lab_number_mode_orders_catching_up_first(world: World) -> None:
    w = world
    qid = await _open(w, QueueMode.LAB_NUMBER)
    for n, labs in (("boris", [3]), ("anna", [1, 2]), ("vera", [2])):
        await w.run("join", qid, labs, w.users[n])
    q = await w.run("start", qid, w.users["head"])
    assert _line(q) == ["anna", "vera", "boris"]


async def test_debtors_mode_uses_done_labs(world: World) -> None:
    w = world
    qid = await _open(w, QueueMode.DEBTORS)
    for n in ("anna", "boris"):  # у anna сдано 4, у boris — ничего
        await w.run("join", qid, [1], w.users[n])
    q = await w.run("start", qid, w.users["head"])
    assert _line(q) == ["boris", "anna"]


async def test_mark_passed_counts_labs_and_promotes_next(world: World) -> None:
    w = world
    qid = await _open(w)
    await w.run("join", qid, [5, 6], w.users["anna"])
    await w.run("join", qid, [1], w.users["boris"])
    q = await w.run("start", qid, w.users["head"])
    anna = q.entries[0]
    assert anna.name == "anna"

    q = await w.run("mark", qid, anna.id, "passed", w.users["head"])
    assert _line(q) == ["boris"]
    assert q.entries[0].status == "current"
    assert [e.name for e in q.finished] == ["anna"]

    q = await w.run("mark", qid, q.entries[0].id, "passed", w.users["head"])
    assert q.entries == []

    async with w.maker() as s:
        rows = {
            r.student_id: r.done_labs
            for r in (
                await s.execute(
                    select(SubjectSemester).where(SubjectSemester.subject_id == w.subject_id)
                )
            ).scalars()
        }
    assert rows[w.students["anna"]] == 6  # было 4, сдала 2
    assert rows[w.students["boris"]] == 1  # строки не было — создана


async def test_mark_absent_moves_to_end(world: World) -> None:
    w = world
    qid = await _open(w)
    for n in ("anna", "boris", "vera"):
        await w.run("join", qid, [1], w.users[n])
    q = await w.run("start", qid, w.users["head"])
    q = await w.run("mark", qid, q.entries[0].id, "absent", w.users["head"])
    assert _line(q) == ["boris", "vera", "anna"]
    assert q.entries[-1].skips == 1


async def test_skip_and_to_end(world: World) -> None:
    w = world
    qid = await _open(w)
    for n in ("anna", "boris", "vera", "gleb"):
        await w.run("join", qid, [1], w.users[n])
    q = await w.run("skip", qid, False, w.users["anna"])
    assert _line(q) == ["boris", "anna", "vera", "gleb"]
    q = await w.run("skip", qid, True, w.users["anna"])
    assert _line(q) == ["boris", "vera", "gleb", "anna"]
    with pytest.raises(ConflictError):
        await w.run("skip", qid, False, w.users["anna"])

    q = await w.run("start", qid, w.users["head"])
    # Сдающий уступает одному следующему
    q = await w.run("skip", qid, False, w.users["boris"])
    assert _line(q) == ["vera", "boris", "gleb", "anna"]
    assert q.entries[0].status == "current"


async def test_swap_by_consent(world: World) -> None:
    w = world
    qid = await _open(w)
    for n in ("anna", "boris", "vera"):
        await w.run("join", qid, [1], w.users[n])
    q = await w.run("detail", qid, w.users["vera"])
    anna_entry = q.entries[0].id

    q = await w.run("request_swap", qid, anna_entry, w.users["vera"])
    assert q.outgoing_swap is not None
    assert w.sent and w.sent[-1][0] == w.users["anna"].id
    assert w.sent[-1][2][0][1].startswith("qs:a:")
    assert all(len(cb.encode()) <= 64 for _, cb in w.sent[-1][2])

    with pytest.raises(ConflictError):  # второй запрос, пока висит первый
        await w.run("request_swap", qid, q.entries[1].id, w.users["vera"])

    a = await w.run("detail", qid, w.users["anna"])
    assert len(a.incoming_swaps) == 1
    swap_id = a.incoming_swaps[0].id
    with pytest.raises(AuthorizationError):  # отвечать может только адресат
        await w.run("respond_swap", swap_id, True, w.users["boris"])

    q = await w.run("respond_swap", swap_id, True, w.users["anna"])
    assert _line(q) == ["vera", "boris", "anna"]
    assert w.sent[-1][0] == w.users["vera"].id
    with pytest.raises(ConflictError):
        await w.run("respond_swap", swap_id, True, w.users["anna"])


async def test_swap_only_with_someone_ahead(world: World) -> None:
    w = world
    qid = await _open(w)
    for n in ("anna", "boris"):
        await w.run("join", qid, [1], w.users[n])
    q = await w.run("detail", qid, w.users["anna"])
    with pytest.raises(ConflictError):
        await w.run("request_swap", qid, q.entries[1].id, w.users["anna"])


async def test_permissions(world: World) -> None:
    w = world
    data = QueueCreate(group_code="241-327", entry_id=w.entry_id, lesson_date=DAY)
    with pytest.raises(AuthorizationError):
        await w.run("open", data, w.users["anna"])
    qid = await _open(w, max_labs=2)
    with pytest.raises(ConflictError):  # вторая очередь на ту же пару
        await w.run("open", data, w.users["head"])
    with pytest.raises(AuthorizationError):
        await w.run("join", qid, [1], w.users["pending"])
    with pytest.raises(AuthorizationError):
        await w.run("detail", qid, w.users["outsider"])
    with pytest.raises(ValidationError):
        await w.run("join", qid, [1, 2, 3], w.users["anna"])
    with pytest.raises(AuthorizationError):
        await w.run("start", qid, w.users["anna"])

    # Модератор платформы ведёт очередь без членства в группе
    q = await w.run("start", qid, w.users["mod"])
    assert q.is_host and q.status == "started"


async def test_leave_rejoin_and_close(world: World) -> None:
    w = world
    qid = await _open(w)
    await w.run("join", qid, [1], w.users["anna"])
    await w.run("join", qid, [2], w.users["boris"])
    q = await w.run("leave", qid, w.users["anna"])
    assert _line(q) == ["boris"]
    q = await w.run("join", qid, [3], w.users["anna"])
    assert _line(q) == ["boris", "anna"]
    q = await w.run("update_labs", qid, [3, 4], w.users["anna"])
    assert q.me is not None and q.me.labs == [3, 4]

    q = await w.run("close", qid, w.users["head"])
    assert q.status == "closed"
    with pytest.raises(ConflictError):
        await w.run("join", qid, [1], w.users["vera"])
    # После закрытия можно открыть новую очередь на ту же пару
    await _open(w)

    import src.core.services.queue as queue_module

    real_today = queue_module.moscow_today
    queue_module.moscow_today = lambda: DAY  # закрытые показываются только в день пары
    try:
        async with w.maker() as s:
            listed = await LabQueueService(s).list_for_group("241-327", w.users["anna"])
    finally:
        queue_module.moscow_today = real_today
    assert {x.status for x in listed} == {"open", "closed"}


# ─── Бот: прогон колбэков как от нажатий кнопок ───


class FakeCallback:
    """То, что handlers/queue.py берёт из CallbackQuery."""

    def __init__(self, tg_id: int, data: str) -> None:
        from unittest.mock import AsyncMock, MagicMock

        from aiogram.types import Message

        self.from_user = MagicMock(id=tg_id)
        self.data = data
        self.answer = AsyncMock()
        self.message = MagicMock(spec=Message)
        self.message.edit_text = AsyncMock()

    @property
    def text(self) -> str:
        return str(self.message.edit_text.call_args.args[0])

    @property
    def buttons(self) -> dict[str, str]:
        markup = self.message.edit_text.call_args.kwargs["reply_markup"]
        return {b.text: b.callback_data for row in markup.inline_keyboard for b in row}

    @property
    def alert(self) -> str | None:
        args = self.answer.call_args
        return str(args.args[0]) if args and args.kwargs.get("show_alert") else None


@pytest.fixture
async def bot(world: World, monkeypatch: pytest.MonkeyPatch) -> World:
    from contextlib import asynccontextmanager

    from src.core.models.user import Identity
    from src.core.services import queue as queue_service
    from src.gateways.telegram.handlers import queue as handlers

    async with world.maker() as s:
        for i, n in enumerate(("head", "anna", "boris", "vera"), start=1):
            s.add(Identity(user_id=world.users[n].id, provider="telegram", external_id=str(i)))
        await s.commit()

    @asynccontextmanager
    async def session() -> AsyncIterator[AsyncSession]:
        async with world.maker() as s:
            yield s

    async def notify(_s: object, uid: uuid.UUID, text: str, buttons: list[tuple[str, str]]) -> None:
        world.sent.append((uid, text, buttons))

    monkeypatch.setattr(handlers, "get_session", session)
    monkeypatch.setattr(queue_service, "telegram_notify", notify)
    monkeypatch.setattr(handlers, "_today", lambda: datetime.combine(DAY, time(9, 0)))
    return world


async def press(tg_id: int, data: str) -> FakeCallback:
    from src.gateways.telegram.handlers import queue as handlers

    assert len(data.encode()) <= 64, data
    cb = FakeCallback(tg_id, data)
    handler = next(
        h.callback
        for h in handlers.router.callback_query.handlers
        if all(f.callback(cb) for f in h.filters or [])  # type: ignore[arg-type]
    )
    await handler(cb)
    if cb.message.edit_text.called:
        for d in cb.buttons.values():
            assert len(d.encode()) <= 64, d
    return cb


async def test_bot_full_flow(bot: World) -> None:
    head, anna, boris, vera = 1, 2, 3, 4

    cb = await press(head, "q:l")
    assert "Открыть очередь" in "".join(cb.buttons)
    cb = await press(head, "q:n")
    lesson = next(d for t, d in cb.buttons.items() if "Сети ЭВМ" in t)
    cb = await press(head, lesson)
    cb = await press(head, cb.buttons["Кто раньше записался"])
    assert "Сети ЭВМ" in cb.text and "идёт запись" in cb.text
    qid = cb.buttons["🔄 Обновить"].split(":")[2]

    # Участники не видят кнопок открытия
    cb = await press(anna, "q:l")
    assert "➕ Открыть очередь" not in cb.buttons
    cb = await press(anna, "q:n")
    assert cb.alert and "староста" in cb.alert

    # Запись через выбор номеров ЛР
    for tg, mask in ((anna, "3"), (boris, "4"), (vera, "1")):  # ЛР 1+2, ЛР 3, ЛР 1
        cb = await press(tg, f"q:p:{qid}:0")
        cb = await press(tg, f"q:p:{qid}:{mask}")
        done = next(d for d in cb.buttons.values() if d.startswith("q:d:"))
        cb = await press(tg, done)
    assert "Вы 3-й" in cb.text

    cb = await press(anna, f"q:p:{qid}:f")  # 4 ЛР при лимите 3 — «Готово» не показываем
    assert "Слишком много" in cb.text
    assert not any(d.startswith("q:d:") for d in cb.buttons.values())

    # vera просит anna поменяться, anna соглашается кнопкой из уведомления
    cb = await press(vera, f"q:w:{qid}")
    target = next(d for t, d in cb.buttons.items() if "anna" in t)
    cb = await press(vera, target)
    assert "Ждём ответа" in cb.text
    swap_cb = bot.sent[-1][2][0][1]
    cb = await press(anna, swap_cb)
    assert cb.text.index("<b>Вы</b>") > cb.text.index("vera")

    cb = await press(head, f"q:st:{qid}")
    assert "Сдаёт: vera" in cb.text
    cb = await press(head, cb.buttons["✅ Сдал"])
    assert "Сдаёт: boris" in cb.text and "Сдали: 1" in cb.text
    cb = await press(boris, f"q:v:{qid}")
    assert "Ваша очередь" in cb.text
    cb = await press(head, f"q:v:{qid}")
    cb = await press(head, cb.buttons["🚶 Нет на месте"])
    assert "Сдаёт: anna" in cb.text

    cb = await press(boris, f"q:x:{qid}")
    cb = await press(head, f"q:cl:{qid}")
    assert "закрыта" in cb.text
    cb = await press(anna, f"q:p:{qid}:1")
    assert cb.alert is None  # карточку видно, но записаться уже нельзя
    cb = await press(anna, f"q:d:{qid}:1")
    assert cb.alert == "Очередь уже закрыта."


@pytest.mark.usefixtures("bot")
async def test_bot_without_account() -> None:
    cb = await press(999, "q:l")
    assert cb.alert and "/start" in cb.alert
