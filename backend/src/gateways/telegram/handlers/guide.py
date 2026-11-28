"""/guide — коротко, как устроена Nexora (#158).

Разделы — кнопками, по одному экрану на тему, без простыней. Тексты здесь же,
чтобы /start, /help и подсказки после действий ссылались на одно и то же.
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

router = Router(name="guide")

SITE_URL = "https://nexora.digitaldrugs.tech"

# (ключ, кнопка, текст)
SECTIONS: list[tuple[str, str, str]] = [
    (
        "group",
        "👥 Группа и староста",
        "👥 <b>Группа и староста</b>\n\n"
        "Всё в Nexora крутится вокруг группы: расписание, задания, очередь на сдачу.\n\n"
        "• <b>Вступить</b> — /settings → «Указать группу», номер как на rasp.dmami.ru.\n"
        "• <b>Первый из группы</b> создаёт её и становится старостой.\n"
        "• <b>Остальные</b> подают заявку — староста подтверждает её на сайте и видит, "
        "кто это в Telegram. Так в группу не попадут чужие.\n"
        "• Староста может назначить помощника. Если старосты нет — его назначит модератор.\n"
        "• Группа у человека одна. <b>Сменить</b> — просто напишите номер новой в /settings; "
        "личные события переедут с вами.\n"
        "• <b>Выйти</b> — /settings → «Выйти из …».",
    ),
    (
        "schedule",
        "📅 Расписание",
        "📅 <b>Расписание</b>\n\n"
        "Подтягивается с rasp.dmami.ru само, следить за сайтом Политеха не нужно.\n\n"
        "• /schedule — пары на сегодня, стрелками — другие дни.\n"
        "• Сводку раз в день (утром или вечером) и напоминание перед парой можно включить "
        "в /notify. По умолчанию бот не присылает расписание сам.\n"
        "• На сайте можно скрыть пару только для себя или добавить своё занятие.",
    ),
    (
        "tasks",
        "📝 Задания",
        "📝 <b>Задания</b>\n\n"
        "• Задание добавляет любой участник — для всей группы или только для себя.\n"
        "• Групповое задание подтверждают голосованием: если оно ошибочное, его оспорят.\n"
        "• Свой прогресс отмечаете сами: «нужно сделать → на проверке → зачтено».\n"
        "• /deadlines — что скоро сдавать. За сутки и за 3 часа до срока бот напомнит, если не сдано.\n"
        "• Можно переслать боту сообщение из чата группы — он предложит сделать из него задание.",
    ),
    (
        "queue",
        "🙋 Очередь на сдачу",
        "🙋 <b>Очередь на сдачу лабораторных</b>\n\n"
        "• Староста или помощник открывает очередь на пару и выбирает порядок: кто раньше "
        "записался, случайно, сначала младшие ЛР или сначала должники.\n"
        "• /queue → «Записаться» → отметьте, какие ЛР сдаёте.\n"
        "• Можно пропустить ход, уйти в конец или попросить того, кто впереди, "
        "поменяться местами — он решает сам.\n"
        "• Отметка «сдал» сама прибавляет лабы в «Предметах».\n"
        "• То же на сайте в разделе «Очереди».",
    ),
    (
        "subjects",
        "📊 Предметы и допуск",
        "📊 <b>Предметы и допуск</b>\n\n"
        "На сайте в «Предметах» видно, сколько работ сдано по каждому предмету и хватает ли "
        "их для допуска. Сколько лаб нужно для допуска, задаёт староста.",
    ),
    (
        "site",
        "🌐 Сайт и бот",
        "🌐 <b>Сайт и бот</b>\n\n"
        "Данные общие: что сделали в боте, видно на сайте, и наоборот.\n\n"
        "• <b>Бот</b> — быстрые действия и уведомления.\n"
        "• <b>Сайт</b> — доска заданий, неделя расписания, предметы, управление группой.\n\n"
        "Вход на сайт — через этого бота, без паролей.",
    ),
]

_BY_KEY = {key: (button, text) for key, button, text in SECTIONS}

INTRO = (
    "❓ <b>Как работает Nexora</b>\n\n"
    "1. Указываете группу — подтягивается расписание.\n"
    "2. Староста подтверждает, что вы из группы.\n"
    "3. Группа вместе ведёт задания и дедлайны, бот напоминает.\n\n"
    "Выберите тему:"
)


def menu_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=button, callback_data=f"guide:{key}")]
        for key, button, _ in SECTIONS
    ]
    rows.append([InlineKeyboardButton(text="🌐 Открыть сайт", url=SITE_URL)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def section_keyboard(key: str) -> InlineKeyboardMarkup:
    keys = [k for k, _, _ in SECTIONS]
    i = keys.index(key)
    nav = [InlineKeyboardButton(text="← Все темы", callback_data="guide:menu")]
    if i + 1 < len(keys):
        nxt = keys[i + 1]
        nav.append(InlineKeyboardButton(text=f"{_BY_KEY[nxt][0]} →", callback_data=f"guide:{nxt}"))
    rows = [nav]
    if key == "group":
        rows.insert(
            0, [InlineKeyboardButton(text="📚 Указать группу", callback_data="settings:group")]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(Command("guide"))
async def cmd_guide(message: Message) -> None:
    await message.answer(INTRO, reply_markup=menu_keyboard())


@router.callback_query(F.data.startswith("guide:"))
async def callback_guide(callback: CallbackQuery) -> None:
    key = (callback.data or "").split(":", 1)[1]
    await callback.answer()
    if not isinstance(callback.message, Message):
        return
    if key == "menu":
        await callback.message.edit_text(INTRO, reply_markup=menu_keyboard())
    elif key in _BY_KEY:
        await callback.message.edit_text(_BY_KEY[key][1], reply_markup=section_keyboard(key))
