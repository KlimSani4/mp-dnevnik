"""Group service unit tests."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.core.models.group import Group, Student, StudentRole
from src.core.schemas.group import GroupCreate, GroupUpdate
from src.core.services.group import GroupService
from src.shared.exceptions import AuthorizationError, ConflictError, NotFoundError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _make_group(code: str = "231-329", owner_id: uuid.UUID | None = None) -> Group:
    g = Group()
    g.id = _uuid()
    g.code = code
    g.name = code
    g.owner_id = owner_id or _uuid()
    g.settings = {}
    g.created_at = datetime.now(tz=timezone.utc)
    g.updated_at = datetime.now(tz=timezone.utc)
    return g


def _make_student(
    user_id: uuid.UUID,
    group_id: uuid.UUID,
    role: StudentRole = StudentRole.STUDENT,
    verified: bool = False,
) -> Student:
    s = Student()
    s.id = _uuid()
    s.user_id = user_id
    s.group_id = group_id
    s.role = role
    s.verified = verified
    s.created_at = datetime.now(tz=timezone.utc)
    s.updated_at = datetime.now(tz=timezone.utc)
    return s


def _make_service(session: MagicMock) -> GroupService:
    session.refresh = AsyncMock()
    svc = GroupService(session)
    svc.group_repo = AsyncMock()
    svc.chat_repo = AsyncMock()
    svc.student_repo = AsyncMock()
    svc.subject_repo = AsyncMock()
    svc.user_repo = AsyncMock()
    # По умолчанию пользователь — не модератор платформы (#150)
    svc.user_repo.get = AsyncMock(return_value=MagicMock(is_moderator=False))
    svc.audit_repo = AsyncMock()
    # Одна группа на человека и перенос личных событий (#162) проверяются на PostgreSQL
    svc._make_room = AsyncMock()  # type: ignore[method-assign]
    svc._adopt_personal_events = AsyncMock(return_value=0)  # type: ignore[method-assign]
    return svc


@pytest.fixture(autouse=True)
def _rasp(monkeypatch: pytest.MonkeyPatch) -> None:
    """Без сети: любой код «есть на rasp», расписание пустое (#146)."""

    async def resolve(code: str) -> str:
        return code.strip()

    async def no_schedule(code: str) -> list[object]:
        return []

    monkeypatch.setattr("src.core.services.group.resolve_group_code", resolve)
    monkeypatch.setattr("src.integrations.rasp_parser.fetch_group_schedule", no_schedule)


# ---------------------------------------------------------------------------
# join_group
# ---------------------------------------------------------------------------

class TestJoinGroup:
    @pytest.mark.asyncio
    async def test_joins_existing_group(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        user_id = _uuid()
        group = _make_group()
        student = _make_student(user_id, group.id)

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=None)
        svc.student_repo.create = AsyncMock(return_value=student)
        svc.audit_repo.log = AsyncMock()

        with __import__("unittest.mock", fromlist=["patch"]).patch(
            "src.core.services.group.StudentResponse.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.join_group(group.code, user_id)

        assert result is student
        svc.student_repo.create.assert_awaited_once()
        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_does_not_create_missing_group(self) -> None:
        """Вступление больше не создаёт группу молча (#146)."""
        session = MagicMock()
        svc = _make_service(session)
        svc.group_repo.get_by_code = AsyncMock(return_value=None)
        svc.group_repo.create = AsyncMock()

        with pytest.raises(NotFoundError):
            await svc.join_group("NEW-123", _uuid())
        svc.group_repo.create.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_raises_if_already_member(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        user_id = _uuid()
        group = _make_group()
        existing_student = _make_student(user_id, group.id)

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=existing_student)

        with pytest.raises(ConflictError, match="Already a member"):
            await svc.join_group(group.code, user_id)


# ---------------------------------------------------------------------------
# create_group
# ---------------------------------------------------------------------------

class TestCreateGroup:
    @pytest.mark.asyncio
    async def test_creates_group_and_starosta(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        session.rollback = AsyncMock()
        svc = _make_service(session)

        owner_id = _uuid()
        group = _make_group(owner_id=owner_id)
        student = _make_student(owner_id, group.id, role=StudentRole.STAROSTA, verified=True)

        svc.group_repo.get_by_code = AsyncMock(return_value=None)
        svc.group_repo.create = AsyncMock(return_value=group)
        svc.student_repo.create = AsyncMock(return_value=student)
        svc.audit_repo.log = AsyncMock()

        data = GroupCreate(code="231-329", name="Группа 231-329")

        with __import__("unittest.mock", fromlist=["patch"]).patch(
            "src.core.services.group.GroupResponse.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.create_group(data, owner_id)

        assert result is group
        svc.student_repo.create.assert_awaited_once_with(
            user_id=owner_id,
            group_id=group.id,
            role=StudentRole.STAROSTA,
            verified=True,
            joined_via="site",
        )

    @pytest.mark.asyncio
    async def test_duplicate_code_raises_conflict(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        existing = _make_group()
        svc.group_repo.get_by_code = AsyncMock(return_value=existing)

        data = GroupCreate(code="231-329")

        with pytest.raises(ConflictError):
            await svc.create_group(data, _uuid())

    @pytest.mark.asyncio
    async def test_code_not_on_rasp_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Код, которого нет в расписании Политеха, занять нельзя (#112, #146)."""

        async def missing(code: str) -> None:
            return None

        monkeypatch.setattr("src.core.services.group.resolve_group_code", missing)
        svc = _make_service(MagicMock())
        svc.group_repo.create = AsyncMock()
        with pytest.raises(NotFoundError):
            await svc.create_group(GroupCreate(code="999-999"), _uuid())
        svc.group_repo.create.assert_not_awaited()


# ---------------------------------------------------------------------------
# get_group
# ---------------------------------------------------------------------------

class TestGetGroup:
    @pytest.mark.asyncio
    async def test_returns_group(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group = _make_group()
        svc.group_repo.get_by_code = AsyncMock(return_value=group)

        with __import__("unittest.mock", fromlist=["patch"]).patch(
            "src.core.services.group.GroupResponse.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.get_group(group.code)

        assert result is group

    @pytest.mark.asyncio
    async def test_not_found_raises(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        svc.group_repo.get_by_code = AsyncMock(return_value=None)

        with pytest.raises(NotFoundError):
            await svc.get_group("DOES-NOT-EXIST")


# ---------------------------------------------------------------------------
# verify_student
# ---------------------------------------------------------------------------

class TestVerifyStudent:
    @pytest.mark.asyncio
    async def test_starosta_can_verify(self) -> None:
        session = MagicMock()
        session.commit = AsyncMock()
        svc = _make_service(session)

        group = _make_group()
        starosta_id = _uuid()
        target_id = _uuid()

        starosta = _make_student(starosta_id, group.id, role=StudentRole.STAROSTA)
        target = _make_student(target_id, group.id)
        verified_target = _make_student(target_id, group.id)
        verified_target.verified = True

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.student_repo.get_by_user_and_group = AsyncMock(
            side_effect=[starosta, target]
        )
        svc.student_repo.verify_student = AsyncMock(return_value=verified_target)
        svc.audit_repo.log = AsyncMock()

        with __import__("unittest.mock", fromlist=["patch"]).patch(
            "src.core.services.group.StudentResponse.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.verify_student(group.code, target_id, starosta_id)

        assert result.verified is True

    @pytest.mark.asyncio
    async def test_plain_student_cannot_verify(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        group = _make_group()
        user_id = _uuid()
        plain = _make_student(user_id, group.id, role=StudentRole.STUDENT)

        svc.group_repo.get_by_code = AsyncMock(return_value=group)
        svc.student_repo.get_by_user_and_group = AsyncMock(return_value=plain)

        with pytest.raises(AuthorizationError):
            await svc.verify_student(group.code, _uuid(), user_id)


# ---------------------------------------------------------------------------
# list_groups
# ---------------------------------------------------------------------------

class TestListGroups:
    @pytest.mark.asyncio
    async def test_list_returns_all(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        groups = [_make_group(f"231-{i}") for i in range(3)]
        svc.group_repo.list = AsyncMock(return_value=groups)

        with __import__("unittest.mock", fromlist=["patch"]).patch(
            "src.core.services.group.GroupResponse.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.list_groups()

        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_search_calls_search_repo(self) -> None:
        session = MagicMock()
        svc = _make_service(session)

        groups = [_make_group("231-329")]
        svc.group_repo.search_by_code = AsyncMock(return_value=groups)

        with __import__("unittest.mock", fromlist=["patch"]).patch(
            "src.core.services.group.GroupResponse.model_validate",
            side_effect=lambda x: x,
        ):
            result = await svc.list_groups(search="231")

        svc.group_repo.search_by_code.assert_awaited_once_with("231", limit=20)
        assert len(result) == 1
