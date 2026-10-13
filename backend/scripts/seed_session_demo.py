"""Локальная демонстрация расписания сессии на тестовых данных, пока нет сессии тестим на этом

Запускать из папки backend, когда база поднята (`alembic upgrade head`), а группа уже
существует:

    python scripts/seed_session_demo.py 241-327            # добавить демо-занятия сессии
    python scripts/seed_session_demo.py 241-327 --clear    # убрать ВСЕ записи сессии группы

Демо-занятия ставятся на текущую неделю, чтобы сразу появиться в расписании.
Скрипт отказывается работать, если DATABASE_URL указывает не на локальную базу.
"""

import argparse
import asyncio
import sys
from datetime import date, timedelta
from urllib.parse import urlparse

from src.config import settings
from src.core.services.schedule import ScheduleService
from src.shared.database import get_db
from src.shared.exceptions import NotFoundError

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "db"}


def demo_items(monday: date) -> list[dict[str, str]]:
    """Три демо-занятия на текущей неделе: консультация, зачёт и экзамен."""

    def day(offset: int) -> str:
        return (monday + timedelta(days=offset)).isoformat()

    return [
        {
            "subject": "[ДЕМО] Базы данных",
            "date": day(2),
            "start_time": "12:20",
            "end_time": "13:50",
            "lesson_type": "Консультация",
            "room": "Демо-аудитория 1",
        },
        {
            "subject": "[ДЕМО] Операционные системы",
            "date": day(3),
            "start_time": "14:30",
            "end_time": "16:00",
            "lesson_type": "Зачёт",
            "room": "Демо-аудитория 3",
        },
        {
            "subject": "[ДЕМО] Базы данных",
            "date": day(4),
            "start_time": "10:40",
            "end_time": "12:10",
            "lesson_type": "Экзамен",
            "room": "Демо-аудитория 2",
        },
    ]


async def run(group_code: str, *, clear: bool) -> int:
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    items = [] if clear else demo_items(monday)

    sessions = get_db()
    session = await anext(sessions)
    try:
        saved = await ScheduleService(session).import_session_schedule(group_code, items)
    except NotFoundError:
        print(f"Группа {group_code} не найдена. Сначала войдите и вступите в неё (local.http).")
        return 1
    finally:
        await sessions.aclose()

    if clear:
        print(f"Записи сессии группы {group_code} удалены.")
    else:
        print(f"Добавлено демо-занятий: {saved}. Откройте расписание группы {group_code}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Демо-данные расписания сессии (только локально)")
    parser.add_argument("group_code", help="код группы, например 241-327")
    parser.add_argument("--clear", action="store_true", help="удалить все записи сессии группы")
    args = parser.parse_args()

    database_url = str(getattr(settings, "DATABASE_URL", ""))
    host = urlparse(database_url).hostname
    if host not in LOCAL_HOSTS:
        print(f"Отказ: база {host!r} не похожа на локальную. Скрипт нужен только для демо.")
        return 2

    return asyncio.run(run(args.group_code, clear=args.clear))


if __name__ == "__main__":
    sys.exit(main())
