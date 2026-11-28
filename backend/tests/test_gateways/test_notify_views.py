"""Экраны мастера и /notify (#32): без Telegram и базы."""

import uuid

from aiogram.types import InlineKeyboardMarkup

from src.core.models.notification import NotificationType as T
from src.gateways.telegram.handlers import notify as n


def _callbacks(kb: InlineKeyboardMarkup) -> list[str]:
    return [b.callback_data for row in kb.inline_keyboard for b in row if b.callback_data]


def _texts(kb: InlineKeyboardMarkup) -> list[str]:
    return [b.text for row in kb.inline_keyboard for b in row]


def test_callback_data_fits_telegram_limit() -> None:
    views = [n.wizard_mode(), n.wizard_time(), n.wizard_remind(), n.wizard_quiet()]
    p = n.Prefs({T.DIGEST: True, T.CLASS_REMINDER: True}, {})
    views += [n.settings_view(p), n.wizard_done(p)]
    data = [c for _, kb in views for c in _callbacks(kb)]
    data.append(n.DoneCb(assignment=uuid.uuid4().hex).pack())
    data += [n.MuteCb(type=t.value).pack() for t in T]
    assert all(len(c.encode()) <= 64 for c in data), max(data, key=len)


def test_wizard_offers_three_levels() -> None:
    _, kb = n.wizard_mode()
    assert [n.WizCb.unpack(c).value for c in _callbacks(kb)] == ["quiet", "digest", "all"]


def test_default_screen_is_quiet() -> None:
    text, kb = n.settings_view(n.Prefs({}, {}))
    assert "⏰ Дедлайны" in text
    assert "Сводка в" not in text
    assert "Перед парой" not in text
    labels = _texts(kb)
    assert "📋 Сводка раз в день: выкл" in labels
    assert "📍 Перед парой: выкл" in labels
    # выбор времени и минут появляется только у включённых
    assert not any(label.endswith("20:00") for label in labels)


def test_screen_shows_choices_when_enabled() -> None:
    p = n.Prefs(
        {T.DIGEST: True, T.CLASS_REMINDER: True},
        {"notify": {"digest_time": "0730"}, "class_reminder_minutes": 10},
    )
    text, kb = n.settings_view(p)
    labels = _texts(kb)
    assert "✓ 07:30" in labels
    assert "✓ за 10 мин" in labels
    assert "Сводка в 07:30 — пары на сегодня" in text


def test_nothing_enabled_says_so() -> None:
    p = n.Prefs({T.DEADLINE: False}, {})
    assert "Ничего не присылаю" in n.summary(p)


def test_quiet_button_cycles() -> None:
    _, kb = n.settings_view(n.Prefs({}, {"notify": {"quiet": "off"}}))
    quiet = [n.SetCb.unpack(c) for c in _callbacks(kb) if c.startswith("ns:quiet:")]
    assert quiet[0].value == "23-8"
