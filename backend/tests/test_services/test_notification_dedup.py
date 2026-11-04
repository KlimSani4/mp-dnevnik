"""Одно уведомление — одно сообщение, даже при нескольких экземплярах бэкенда (#135)."""

import asyncio
import time

import pytest

from src.gateways.telegram import scheduler as sch


class FakeRedis:
    """SET NX EX с честной атомарностью: между проверкой и записью нет await."""

    def __init__(self) -> None:
        self.data: dict[str, float] = {}

    async def set(self, key: str, _value: str, *, nx: bool = False, ex: int | None = None) -> bool:
        await asyncio.sleep(0)  # даём другим корутинам вклиниться, как при сетевом вызове
        now = time.monotonic()
        expires = self.data.get(key)
        if nx and expires is not None and expires > now:
            return False
        self.data[key] = now + (ex or 10**9)
        return True


class BrokenRedis:
    async def set(self, *_args: object, **_kwargs: object) -> bool:
        raise ConnectionError("redis down")


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    fake = FakeRedis()

    async def get_redis() -> FakeRedis:
        return fake

    monkeypatch.setattr("src.shared.redis.get_redis", get_redis)
    return fake


@pytest.mark.usefixtures("redis")
async def test_parallel_runs_send_once() -> None:
    """Два пода одновременно решают, слать ли одно и то же: слать должен только один."""
    results = await asyncio.gather(
        *(sch._is_duplicate("u1", "class_reminder", "lesson:2026-11-04") for _ in range(5))
    )
    assert results.count(False) == 1
    assert results.count(True) == 4


@pytest.mark.usefixtures("redis")
async def test_dedup_is_per_notification() -> None:
    assert await sch._is_duplicate("u1", "deadline_24h", "a1") is False
    assert await sch._is_duplicate("u1", "deadline_3h", "a1") is False
    assert await sch._is_duplicate("u2", "deadline_24h", "a1") is False
    assert await sch._is_duplicate("u1", "deadline_24h", "a1") is True


@pytest.mark.usefixtures("redis")
async def test_job_runs_once_across_instances() -> None:
    calls = 0

    @sch._single_instance("test_job")
    async def job() -> None:
        nonlocal calls
        calls += 1

    await asyncio.gather(job(), job(), job())
    assert calls == 1


@pytest.mark.usefixtures("redis")
async def test_job_lock_is_per_job() -> None:
    calls: list[str] = []

    @sch._single_instance("a")
    async def job_a() -> None:
        calls.append("a")

    @sch._single_instance("b")
    async def job_b() -> None:
        calls.append("b")

    await asyncio.gather(job_a(), job_b())
    assert sorted(calls) == ["a", "b"]


async def test_job_skipped_without_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    async def get_redis() -> BrokenRedis:
        return BrokenRedis()

    monkeypatch.setattr("src.shared.redis.get_redis", get_redis)
    calls = 0

    @sch._single_instance("test_job")
    async def job() -> None:
        nonlocal calls
        calls += 1

    await job()
    assert calls == 0


def test_all_jobs_are_single_instance() -> None:
    """Каждая задача планировщика обёрнута блокировкой."""
    for job in (
        sch.send_upcoming_class_notifications,
        sch.send_evening_digest,
        sch.send_morning_schedule,
        sch.send_deadline_reminders,
        sch.sync_all_schedules,
    ):
        assert hasattr(job, "__wrapped__"), job.__name__


@pytest.mark.parametrize("target", [24, 3])
def test_deadline_hits_exactly_one_hourly_run(target: int) -> None:
    """Задача идёт раз в час: дедлайн при любом смещении попадает ровно в один запуск."""
    for minute in range(60):
        for second in (0, 30):
            # часов до дедлайна в момент первого запуска; следующие запуски — минус 1, 2, ...
            first = target + 1 + minute / 60 + second / 3600
            hits = sum(sch.in_window(first - run, target) for run in range(4))
            assert hits == 1, (minute, second)


def test_deadline_window_bounds() -> None:
    assert sch.in_window(24.5, 24) is False
    assert sch.in_window(24.49, 24) is True
    assert sch.in_window(23.5, 24) is True
    assert sch.in_window(23.49, 24) is False
