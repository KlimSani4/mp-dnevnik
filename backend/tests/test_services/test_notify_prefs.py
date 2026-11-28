"""Тихий бот по умолчанию и настройки уведомлений (#32)."""

import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest

from src.core.models.notification import NotificationType as T
from src.core.services import daily_digest as dd
from src.core.services import notify_prefs as np

MSK = timezone(timedelta(hours=3))


def test_quiet_by_default() -> None:
    """Без явных настроек — только дедлайны и изменения расписания."""
    assert {t for t in T if np.is_enabled({}, t)} == {T.DEADLINE, T.SCHEDULE_CHANGE}


def test_explicit_preference_wins() -> None:
    assert np.is_enabled({T.DIGEST: True}, T.DIGEST) is True
    assert np.is_enabled({T.DEADLINE: False}, T.DEADLINE) is False


def test_enabled_users_mixes_defaults_and_saved() -> None:
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    assert np.enabled_users([a, b, c], [(a, True), (b, False)], T.DIGEST) == {a}
    assert np.enabled_users([a, b, c], [(b, False)], T.DEADLINE) == {a, c}


def test_every_type_has_default() -> None:
    assert set(np.DEFAULTS) == set(T)


@pytest.mark.parametrize(
    ("quiet", "hour", "expected"),
    [
        ("23-8", 23, True),
        ("23-8", 2, True),
        ("23-8", 8, False),
        ("23-8", 22, False),
        ("0-9", 0, True),
        ("0-9", 9, False),
        ("off", 3, False),
    ],
)
def test_quiet_hours(quiet: str, hour: int, expected: bool) -> None:
    settings = {"notify": {"quiet": quiet}}
    assert np.in_quiet_hours(settings, datetime(2026, 11, 28, hour, 15, tzinfo=MSK)) is expected


def test_garbage_settings_fall_back_to_defaults() -> None:
    for bad in (None, {}, {"notify": "x"}, {"notify": {"digest_time": "2359", "quiet": "1-2"}}):
        assert np.digest_time(bad) == np.DEFAULT_DIGEST_TIME
        assert np.quiet(bad) == np.DEFAULT_QUIET
        assert np.is_setup_done(bad) is False


def test_with_notify_keeps_other_settings() -> None:
    before = {"class_reminder_minutes": 10, "notify": {"quiet": "off"}}
    after = np.with_notify(before, digest_time="0730")
    assert after == {"class_reminder_minutes": 10, "notify": {"quiet": "off", "digest_time": "0730"}}
    assert after is not before
    assert before["notify"] == {"quiet": "off"}


def test_presets_only_add_noise_step_by_step() -> None:
    on = {name: {t for t, v in p.items() if v} for name, p in np.PRESETS.items()}
    assert on["quiet"] < on["digest"] < on["all"]
    assert T.DIGEST not in on["quiet"]
    assert T.CLASS_REMINDER not in on["digest"]


def test_digest_times_fit_callback_data() -> None:
    # двоеточие — разделитель в CallbackData
    assert all(":" not in t for t in np.DIGEST_TIMES)
    assert np.MORNING_TIMES <= set(np.DIGEST_TIMES)


def test_format_evening() -> None:
    today = date(2026, 11, 28)
    lessons = [
        dd.DigestLesson(subject="Базы данных", start=time(9, 0), end=time(10, 30), place="Пр1407"),
        dd.DigestLesson(subject="ТРПО", start=time(10, 40), end=time(12, 10)),
    ]
    deadlines = [
        dd.DigestDeadline(
            title="ЛР 3", subject="Базы данных", deadline=datetime(2026, 11, 29, 23, 59, tzinfo=MSK)
        )
    ]
    text = dd.format_evening(lessons, deadlines, today)
    assert text.startswith("🌙 <b>Завтра</b> 2 пары, 09:00–12:10")
    assert "завтра — ЛР 3" in text
    assert dd.format_evening([], [], today) == "🌙 <b>Завтра пар нет</b>"


def test_morning_text_unchanged() -> None:
    assert dd.format_morning([], [], date(2026, 11, 28)) == "☀️ <b>Доброе утро!</b> Сегодня пар нет"
