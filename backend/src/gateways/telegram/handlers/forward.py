"""Handler: forwarded message → create assignment."""

import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

logger = logging.getLogger(__name__)
router = Router(name="forward")

MOSCOW_TZ = timezone(timedelta(hours=3))

# ── date parsing ──────────────────────────────────────────────────────────────

_MONTH_NAMES: dict[str, int] = {
    "янв": 1,
    "январ": 1,
    "фев": 2,
    "феврал": 2,
    "мар": 3,
    "март": 3,
    "апр": 4,
    "апрел": 4,
    "май": 5,
    "мая": 5,
    "июн": 6,
    "июл": 7,
    "авг": 8,
    "август": 8,
    "сен": 9,
    "сентябр": 9,
    "окт": 10,
    "октябр": 10,
    "ноя": 11,
    "ноябр": 11,
    "дек": 12,
    "декабр": 12,
}

_WEEKDAY_RU: dict[str, int] = {
    "понедельник": 0,
    "вторник": 1,
    "среду": 2,
    "среда": 2,
    "четверг": 3,
    "пятницу": 4,
    "пятница": 4,
    "субботу": 5,
    "суббота": 5,
    "воскресенье": 6,
}


def _now_moscow() -> datetime:
    return datetime.now(MOSCOW_TZ)


def _today() -> date:
    return _now_moscow().date()


def _next_weekday(weekday: int) -> date:
    """Return the date of the next occurrence of *weekday* (Mon=0)."""
    today = _today()
    days_ahead = (weekday - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7  # "следующий" means next week if today matches
    return today + timedelta(days=days_ahead)


def extract_deadline(text: str) -> datetime | None:
    """Try to find a deadline in Russian text. Returns timezone-aware datetime (23:59 MSK)."""
    text_lower = text.lower()

    # "завтра" / "послезавтра"
    if "послезавтра" in text_lower:
        d = _today() + timedelta(days=2)
        return datetime(d.year, d.month, d.day, 23, 59, tzinfo=MOSCOW_TZ)
    if "завтра" in text_lower:
        d = _today() + timedelta(days=1)
        return datetime(d.year, d.month, d.day, 23, 59, tzinfo=MOSCOW_TZ)

    # "до пятницы" / "в пятницу" etc.
    for name, weekday in _WEEKDAY_RU.items():
        if name in text_lower:
            d = _next_weekday(weekday)
            return datetime(d.year, d.month, d.day, 23, 59, tzinfo=MOSCOW_TZ)

    # DD.MM.YYYY or DD.MM
    m = re.search(r"\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}|\d{2}))?\b", text)
    if m:
        try:
            day = int(m.group(1))
            month = int(m.group(2))
            year_raw = m.group(3)
            if year_raw:
                year = int(year_raw) if len(year_raw) == 4 else 2000 + int(year_raw)
            else:
                year = _today().year
                # if month/day already passed this year, assume next year
                if date(year, month, day) < _today():
                    year += 1
            d = date(year, month, day)
            return datetime(d.year, d.month, d.day, 23, 59, tzinfo=MOSCOW_TZ)
        except ValueError:
            pass

    # "15 мая" / "15 мая 2025"
    m = re.search(
        r"\b(\d{1,2})\s+(" + "|".join(_MONTH_NAMES.keys()) + r")\w*(?:\s+(\d{4}))?\b",
        text_lower,
    )
    if m:
        try:
            day = int(m.group(1))
            month_key = m.group(2)[:3]
            month = _MONTH_NAMES.get(month_key) or _MONTH_NAMES.get(m.group(2)[:6])
            year_raw = m.group(3)
            year = int(year_raw) if year_raw else _today().year
            if month:
                if not year_raw and date(year, month, day) < _today():
                    year += 1
                d = date(year, month, day)
                return datetime(d.year, d.month, d.day, 23, 59, tzinfo=MOSCOW_TZ)
        except (ValueError, TypeError):
            pass

    return None


# ── subject matching ──────────────────────────────────────────────────────────


def match_subject(text: str, subjects: list) -> "object | None":
    """Return the best-matching subject or None.

    Strategy: for each subject split its name into words ≥4 chars and count
    how many appear in the lowercased text.  The subject with the most hits
    wins, provided at least one word matched.
    """
    text_lower = text.lower()
    best = None
    best_score = 0

    for subj in subjects:
        name_words = [w for w in re.split(r"\W+", subj.name.lower()) if len(w) >= 4]
        score = sum(1 for w in name_words if w in text_lower)
        if score > best_score:
            best_score = score
            best = subj

    return best if best_score > 0 else None


# ── FSM ───────────────────────────────────────────────────────────────────────


class ForwardEdit(StatesGroup):
    waiting_for_title = State()
    waiting_for_subject = State()
    waiting_for_deadline = State()


# ── helpers ───────────────────────────────────────────────────────────────────


def _preview_keyboard(payload: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Создать", callback_data=f"fw_create:{payload}"),
                InlineKeyboardButton(text="✏️ Изменить", callback_data=f"fw_edit:{payload}"),
                InlineKeyboardButton(text="❌ Отмена", callback_data="fw_cancel"),
            ]
        ]
    )


def _subject_keyboard(subjects: list, payload_base: str) -> InlineKeyboardMarkup:
    """Build inline keyboard with subject choices."""
    rows = []
    for subj in subjects[:20]:  # cap at 20 to avoid huge keyboards
        rows.append(
            [
                InlineKeyboardButton(
                    text=subj.name[:40],
                    callback_data=f"fw_subj:{subj.id}:{payload_base}",
                )
            ]
        )
    rows.append([InlineKeyboardButton(text="❌ Отмена", callback_data="fw_cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _format_preview(title: str, subject_name: str | None, deadline: datetime | None) -> str:
    deadline_str = deadline.strftime("%d.%m.%Y") if deadline else "не найден"
    subj_str = subject_name or "не определён"
    return (
        "📋 <b>Новое задание из пересланного сообщения</b>\n\n"
        f"📌 Название: <b>{title}</b>\n"
        f"📚 Предмет: <b>{subj_str}</b>\n"
        f"⏰ Дедлайн: <b>{deadline_str}</b>\n\n"
        "Всё верно?"
    )


def _encode_payload(data: dict) -> str:
    """Encode assignment data as compact JSON string for callback_data."""
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)


def _decode_payload(raw: str) -> dict:
    return json.loads(raw)


def _make_title(text: str) -> str:
    """Extract a short title from the forwarded text (first non-empty line, max 200 chars)."""
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line[:200]
    return text.strip()[:200]


# ── main handler ──────────────────────────────────────────────────────────────


@router.message(F.forward_date | F.forward_origin)
async def handle_forwarded_message(message: Message) -> None:
    """Catch forwarded messages and try to parse them as assignments."""
    from src.core.repositories.group import StudentRepository
    from src.core.repositories.schedule import SubjectRepository
    from src.core.repositories.user import IdentityRepository
    from src.gateways.telegram.deps import get_session

    tg_user = message.from_user
    if not tg_user:
        return

    text = message.text or message.caption or ""
    if not text.strip():
        await message.answer("Перешли сообщение с текстом — я создам из него задание.")
        return

    async with get_session() as session:
        identity_repo = IdentityRepository(session)
        identity = await identity_repo.get_by_external("telegram", str(tg_user.id))
        if not identity:
            await message.answer("Сначала зарегистрируйся: /start")
            return

        student_repo = StudentRepository(session)
        students = await student_repo.get_user_students(identity.user_id)
        if not students:
            await message.answer("Укажи группу в /settings — тогда смогу создать задание.")
            return

        group = students[0].group

        subject_repo = SubjectRepository(session)
        subjects = await subject_repo.get_group_subjects(group.id)

    # Parse
    title = _make_title(text)
    deadline = extract_deadline(text)
    matched_subject = match_subject(text, subjects)

    payload = {
        "t": title,
        "g": str(group.id),
        "u": str(identity.user_id),
        "s": str(matched_subject.id) if matched_subject else None,
        "sn": matched_subject.name if matched_subject else None,
        "d": deadline.isoformat() if deadline else None,
    }

    encoded = _encode_payload(payload)
    preview = _format_preview(title, payload["sn"], deadline)
    await message.answer(preview, parse_mode="HTML", reply_markup=_preview_keyboard(encoded))


# ── callback: create ──────────────────────────────────────────────────────────


@router.callback_query(F.data.startswith("fw_create:"))
async def cb_forward_create(callback: CallbackQuery) -> None:
    from src.core.models.assignment import Assignment
    from src.core.repositories.group import StudentRepository
    from src.core.repositories.schedule import SubjectRepository
    from src.gateways.telegram.deps import get_session

    await callback.answer()
    raw = callback.data.split(":", 1)[1]  # type: ignore[union-attr]
    data = _decode_payload(raw)

    if not data.get("s"):
        await callback.message.answer(  # type: ignore[union-attr]
            "Не удалось определить предмет. Нажми «Изменить» и выбери вручную."
        )
        return

    try:
        group_id = uuid.UUID(data["g"])
        user_id = uuid.UUID(data["u"])
        subject_id = uuid.UUID(data["s"])
        deadline = datetime.fromisoformat(data["d"]) if data.get("d") else None

        async with get_session() as session:
            student_repo = StudentRepository(session)
            student = await student_repo.get_by_user_and_group(user_id, group_id)
            if not student:
                await callback.message.answer("Ошибка: ты не состоишь в группе.")  # type: ignore[union-attr]
                return

            subject_repo = SubjectRepository(session)
            subject = await subject_repo.get(subject_id)
            if not subject:
                await callback.message.answer("Ошибка: предмет не найден.")  # type: ignore[union-attr]
                return

            assignment = Assignment(
                group_id=group_id,
                subject_id=subject_id,
                title=data["t"],
                description=None,
                deadline=deadline,
                priority="normal",
                author_id=user_id,
            )
            session.add(assignment)
            await session.commit()
            await session.refresh(assignment)

        deadline_str = deadline.strftime("%d.%m.%Y") if deadline else "без дедлайна"
        await callback.message.edit_text(  # type: ignore[union-attr]
            f"✅ Задание создано!\n\n📌 <b>{data['t']}</b>\n📚 {data['sn']}\n⏰ {deadline_str}",
            parse_mode="HTML",
        )
    except Exception as e:
        logger.exception("Failed to create assignment from forward: %s", e)
        await callback.message.answer(f"Ошибка при создании: {e}")  # type: ignore[union-attr]


# ── callback: cancel ──────────────────────────────────────────────────────────


@router.callback_query(F.data == "fw_cancel")
async def cb_forward_cancel(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer("Отменено")
    await state.clear()
    try:
        await callback.message.delete()  # type: ignore[union-attr]
    except Exception:
        await callback.message.edit_text("❌ Отменено.")  # type: ignore[union-attr]


# ── callback: edit (entry point) ─────────────────────────────────────────────


@router.callback_query(F.data.startswith("fw_edit:"))
async def cb_forward_edit(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    raw = callback.data.split(":", 1)[1]  # type: ignore[union-attr]
    data = _decode_payload(raw)
    await state.update_data(fw_payload=data)
    await state.set_state(ForwardEdit.waiting_for_title)
    await callback.message.answer(  # type: ignore[union-attr]
        f"✏️ <b>Редактирование</b>\n\n"
        f"Текущее название: <b>{data['t']}</b>\n\n"
        "Введи новое название (или отправь «-» чтобы оставить текущее):",
        parse_mode="HTML",
    )


@router.message(ForwardEdit.waiting_for_title)
async def fw_edit_title(message: Message, state: FSMContext) -> None:
    from src.core.repositories.schedule import SubjectRepository
    from src.gateways.telegram.deps import get_session

    if not message.text:
        return

    state_data = await state.get_data()
    payload = state_data["fw_payload"]

    new_title = message.text.strip()
    if new_title != "-":
        payload["t"] = new_title[:200]

    await state.update_data(fw_payload=payload)

    # Load subjects for inline keyboard
    async with get_session() as session:
        subject_repo = SubjectRepository(session)
        subjects = await subject_repo.get_group_subjects(uuid.UUID(payload["g"]))

    # Store subjects names temporarily, show keyboard
    encoded_base = _encode_payload(payload)
    await state.set_state(ForwardEdit.waiting_for_subject)
    await message.answer(
        "📚 Выбери предмет:",
        reply_markup=_subject_keyboard(subjects, encoded_base),
    )


@router.callback_query(F.data.startswith("fw_subj:"))
async def cb_forward_subject(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    _, subj_id_str, payload_raw = callback.data.split(":", 2)  # type: ignore[union-attr]

    from src.core.repositories.schedule import SubjectRepository
    from src.gateways.telegram.deps import get_session

    async with get_session() as session:
        subject_repo = SubjectRepository(session)
        subject = await subject_repo.get(uuid.UUID(subj_id_str))

    if not subject:
        await callback.message.answer("Предмет не найден, попробуй ещё раз.")  # type: ignore[union-attr]
        return

    payload = _decode_payload(payload_raw)
    payload["s"] = subj_id_str
    payload["sn"] = subject.name

    await state.update_data(fw_payload=payload)
    await state.set_state(ForwardEdit.waiting_for_deadline)
    deadline_str = (
        datetime.fromisoformat(payload["d"]).strftime("%d.%m.%Y")
        if payload.get("d")
        else "не задан"
    )
    await callback.message.answer(  # type: ignore[union-attr]
        f"⏰ Текущий дедлайн: <b>{deadline_str}</b>\n\n"
        "Введи новый дедлайн (например: 25.05, 25 мая, пятницу) или «-» чтобы оставить:",
        parse_mode="HTML",
    )


@router.message(ForwardEdit.waiting_for_deadline)
async def fw_edit_deadline(message: Message, state: FSMContext) -> None:
    if not message.text:
        return

    state_data = await state.get_data()
    payload = state_data["fw_payload"]

    text = message.text.strip()
    if text != "-":
        new_deadline = extract_deadline(text)
        payload["d"] = new_deadline.isoformat() if new_deadline else None

    await state.clear()

    deadline_dt = datetime.fromisoformat(payload["d"]) if payload.get("d") else None
    encoded = _encode_payload(payload)
    preview = _format_preview(payload["t"], payload.get("sn"), deadline_dt)
    await message.answer(preview, parse_mode="HTML", reply_markup=_preview_keyboard(encoded))
