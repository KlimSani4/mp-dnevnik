"""Модерация платформы (#99)."""

import pathlib
import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.api.deps import require_moderator
from src.core import activity
from src.core.models.moderation import ApplicationStatus, SupportStatus
from src.core.schemas.moderation import SupportRequestUpdate, TeacherApplicationCreate
from src.core.schemas.user import UserUpdate
from src.core.services import moderation as mod
from src.shared.exceptions import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)

SRC = pathlib.Path(__file__).resolve().parents[2] / "src"


def _session() -> MagicMock:
    s = MagicMock()
    s.commit = AsyncMock()
    s.refresh = AsyncMock()
    return s


def _user(**kw: object) -> SimpleNamespace:
    data: dict[str, object] = {
        "id": uuid.uuid4(),
        "display_name": "Mod",
        "is_moderator": True,
        "is_teacher": False,
    }
    data.update(kw)
    return SimpleNamespace(**data)


# ─── Роль модератора выдаётся только вручную ───


class TestModeratorRoleIsManualOnly:
    @pytest.mark.asyncio
    async def test_non_moderator_gets_403(self) -> None:
        with pytest.raises(AuthorizationError):
            await require_moderator(_user(is_moderator=False))  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_moderator_passes(self) -> None:
        user = _user()
        assert await require_moderator(user) is user  # type: ignore[arg-type]

    def test_profile_update_cannot_set_roles(self) -> None:
        assert "is_moderator" not in UserUpdate.model_fields
        assert "is_teacher" not in UserUpdate.model_fields
        data = UserUpdate.model_validate({"display_name": "x", "is_moderator": True})
        assert "is_moderator" not in data.model_dump(exclude_unset=True)

    def test_no_api_or_bot_code_changes_moderator_role(self) -> None:
        """Роль меняют только grant/revoke_moderator, и вызывает их только CLI."""
        offenders = []
        for path in (SRC / "api").rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if "is_moderator =" in text or "grant_moderator" in text or "revoke_moderator" in text:
                offenders.append(path)
        for path in (SRC / "gateways").rglob("*.py"):
            if "moderator" in path.read_text(encoding="utf-8"):
                offenders.append(path)
        assert offenders == []

        setters = [
            p.relative_to(SRC).as_posix()
            for p in SRC.rglob("*.py")
            if "is_moderator = True" in p.read_text(encoding="utf-8")
        ]
        assert setters == ["core/services/moderation.py"]

    def test_all_moderation_routes_require_moderator(self) -> None:
        from src.api.routes.moderation import router

        assert any(d.dependency is require_moderator for d in router.dependencies)
        moderators_routes = [r for r in router.routes if "moderators" in r.path]  # type: ignore[attr-defined]
        assert moderators_routes
        assert all(r.methods == {"GET"} for r in moderators_routes)  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_grant_sets_flag_and_logs_once(self, monkeypatch: pytest.MonkeyPatch) -> None:
        session = _session()
        user = _user(is_moderator=False)
        audit = MagicMock(log=AsyncMock())
        repo = MagicMock(get_by_identity=AsyncMock(return_value=user))
        monkeypatch.setattr(mod, "UserRepository", MagicMock(return_value=repo))
        monkeypatch.setattr(mod, "AuditLogRepository", MagicMock(return_value=audit))

        await mod.grant_moderator(session, "123", operator="admin")
        await mod.grant_moderator(session, "123", operator="admin")  # повтор ничего не меняет

        assert user.is_moderator is True
        audit.log.assert_awaited_once()
        assert audit.log.await_args.args[0] == "moderator_granted"

    @pytest.mark.asyncio
    async def test_revoke_and_unknown_user(self, monkeypatch: pytest.MonkeyPatch) -> None:
        session = _session()
        user = _user(is_moderator=True)
        audit = MagicMock(log=AsyncMock())
        repo = MagicMock(get_by_identity=AsyncMock(return_value=user))
        monkeypatch.setattr(mod, "UserRepository", MagicMock(return_value=repo))
        monkeypatch.setattr(mod, "AuditLogRepository", MagicMock(return_value=audit))

        await mod.revoke_moderator(session, "123", operator="admin")
        assert user.is_moderator is False
        assert audit.log.await_args.args[0] == "moderator_revoked"

        repo.get_by_identity = AsyncMock(return_value=None)
        with pytest.raises(NotFoundError):
            await mod.grant_moderator(session, "999", operator="admin")


# ─── Обращения в поддержку ───


def _service(session: MagicMock, notify: AsyncMock) -> mod.ModerationService:
    svc = mod.ModerationService(session, notify=notify)
    svc.audit_repo = MagicMock(log=AsyncMock())
    return svc


class TestSupport:
    @pytest.mark.asyncio
    async def test_reply_closes_and_notifies(self) -> None:
        session, notify = _session(), AsyncMock()
        svc = _service(session, notify)
        req = SimpleNamespace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            message="Не работает <b>",
            status=SupportStatus.NEW,
            reply=None,
            replied_at=None,
            handled_by=None,
        )
        svc.support_repo.get_with_user = AsyncMock(return_value=req)
        moderator = _user()

        await svc.update_support(req.id, SupportRequestUpdate(reply="Починили"), moderator)  # type: ignore[arg-type]

        assert req.status == SupportStatus.CLOSED
        assert req.reply == "Починили" and req.handled_by == moderator.id and req.replied_at
        svc.audit_repo.log.assert_awaited_once()
        assert svc.audit_repo.log.await_args.args[0] == "support_replied"
        notify.assert_awaited_once()
        uid, text = notify.await_args.args
        assert uid == req.user_id and "Починили" in text and "&lt;b&gt;" in text

    @pytest.mark.asyncio
    async def test_reply_can_keep_in_progress(self) -> None:
        session, notify = _session(), AsyncMock()
        svc = _service(session, notify)
        req = SimpleNamespace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            message="x",
            status=SupportStatus.NEW,
            reply=None,
            replied_at=None,
            handled_by=None,
        )
        svc.support_repo.get_with_user = AsyncMock(return_value=req)
        await svc.update_support(
            req.id,
            SupportRequestUpdate(reply="Смотрим", status=SupportStatus.IN_PROGRESS),
            _user(),  # type: ignore[arg-type]
        )
        assert req.status == SupportStatus.IN_PROGRESS

    @pytest.mark.asyncio
    async def test_status_only_does_not_notify(self) -> None:
        session, notify = _session(), AsyncMock()
        svc = _service(session, notify)
        req = SimpleNamespace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            message="x",
            status=SupportStatus.NEW,
            reply=None,
            replied_at=None,
            handled_by=None,
        )
        svc.support_repo.get_with_user = AsyncMock(return_value=req)
        await svc.update_support(
            req.id, SupportRequestUpdate(status=SupportStatus.IN_PROGRESS), _user()
        )  # type: ignore[arg-type]
        assert req.status == SupportStatus.IN_PROGRESS
        notify.assert_not_awaited()
        assert svc.audit_repo.log.await_args.args[0] == "support_status_changed"

    @pytest.mark.asyncio
    async def test_empty_update_and_not_found(self) -> None:
        svc = _service(_session(), AsyncMock())
        svc.support_repo.get_with_user = AsyncMock(return_value=SimpleNamespace(id=uuid.uuid4()))
        with pytest.raises(ValidationError):
            await svc.update_support(uuid.uuid4(), SupportRequestUpdate(), _user())  # type: ignore[arg-type]
        svc.support_repo.get_with_user = AsyncMock(return_value=None)
        with pytest.raises(NotFoundError):
            await svc.update_support(uuid.uuid4(), SupportRequestUpdate(reply="ok"), _user())  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_open_requests_limit(self) -> None:
        session = _session()
        svc = mod.SupportService(session)
        open_req = SimpleNamespace(status=SupportStatus.NEW)
        svc.repo.list_for_user = AsyncMock(return_value=[open_req] * mod.MAX_OPEN_SUPPORT_REQUESTS)
        with pytest.raises(ConflictError):
            await svc.create(_user(), "Ещё одно обращение")  # type: ignore[arg-type]

        svc.repo.list_for_user = AsyncMock(
            return_value=[SimpleNamespace(status=SupportStatus.CLOSED)] * 10
        )
        svc.repo.create = AsyncMock(return_value="created")
        assert await svc.create(_user(), "  Текст обращения  ") == "created"  # type: ignore[arg-type]
        assert svc.repo.create.await_args.kwargs["message"] == "Текст обращения"


# ─── Заявки преподавателей ───


class TestTeacherApplications:
    def _app(self, status: ApplicationStatus = ApplicationStatus.PENDING) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            status=status,
            reviewed_by=None,
            reviewed_at=None,
            user=_user(is_moderator=False),
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("approve", "status", "teacher"),
        [(True, ApplicationStatus.APPROVED, True), (False, ApplicationStatus.REJECTED, False)],
    )
    async def test_review(self, approve: bool, status: ApplicationStatus, teacher: bool) -> None:
        notify = AsyncMock()
        svc = _service(_session(), notify)
        app = self._app()
        svc.app_repo.get_with_user = AsyncMock(return_value=app)
        moderator = _user()
        await svc.review_application(app.id, approve=approve, moderator=moderator)  # type: ignore[arg-type]
        assert app.status == status and app.reviewed_by == moderator.id
        assert app.user.is_teacher is teacher
        notify.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_cannot_review_twice(self) -> None:
        svc = _service(_session(), AsyncMock())
        svc.app_repo.get_with_user = AsyncMock(return_value=self._app(ApplicationStatus.APPROVED))
        with pytest.raises(ConflictError):
            await svc.review_application(uuid.uuid4(), approve=False, moderator=_user())  # type: ignore[arg-type]

    @pytest.mark.asyncio
    async def test_apply_conflicts(self) -> None:
        svc = mod.TeacherApplicationService(_session())
        data = TeacherApplicationCreate(full_name="Иванов Иван Иванович")
        with pytest.raises(ConflictError):
            await svc.apply(_user(is_teacher=True), data)  # type: ignore[arg-type]
        svc.repo.get_pending_for_user = AsyncMock(return_value=object())
        with pytest.raises(ConflictError):
            await svc.apply(_user(), data)  # type: ignore[arg-type]


# ─── Активность ───


class TestActivity:
    def test_period_keys(self) -> None:
        keys = activity.period_keys(date(2026, 10, 24), 3)
        assert keys == ["active:2026-10-24", "active:2026-10-23", "active:2026-10-22"]

    @pytest.mark.asyncio
    async def test_track_and_count(self) -> None:
        redis = MagicMock(pfadd=AsyncMock(), expire=AsyncMock(), pfcount=AsyncMock(return_value=7))
        uid = uuid.uuid4()
        await activity.track_active(redis, uid, date(2026, 10, 24))
        redis.pfadd.assert_awaited_once_with("active:2026-10-24", str(uid))
        redis.expire.assert_awaited_once()
        assert await activity.count_active(redis, date(2026, 10, 24), 7) == 7
        assert len(redis.pfcount.await_args.args) == 7

    @pytest.mark.asyncio
    async def test_redis_errors_are_swallowed(self) -> None:
        redis = MagicMock(
            pfadd=AsyncMock(side_effect=ConnectionError),
            pfcount=AsyncMock(side_effect=ConnectionError),
        )
        await activity.track_active(redis, uuid.uuid4())
        assert await activity.count_active(redis, date(2026, 10, 24), 30) == 0
        days = await activity.daily_active(redis, date(2026, 10, 24), 3)
        assert [v for _, v in days] == [0, 0, 0] and days[-1][0] == date(2026, 10, 24)
