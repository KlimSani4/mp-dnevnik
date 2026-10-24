"""Выдача и снятие роли модератора платформы (#99).

Это ЕДИНСТВЕННЫЙ способ изменить роль: в API, интерфейсе и боте его нет намеренно.
Запускается на сервере, где есть доступ к базе, например в поде бэкенда:

    kubectl -n nexora exec deploy/nexora-backend -- python -m src.cli.moderator add 123456789
    kubectl -n nexora exec deploy/nexora-backend -- python -m src.cli.moderator remove 123456789
    kubectl -n nexora exec deploy/nexora-backend -- python -m src.cli.moderator list

Аргумент — Telegram ID пользователя (он должен хотя бы раз войти на сайт).
Каждое изменение пишется в журнал аудита (moderator_granted / moderator_revoked).
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from src.core.services.moderation import ModerationService, grant_moderator, revoke_moderator
from src.shared.database import async_session_maker
from src.shared.exceptions import NotFoundError


async def run(action: str, telegram_id: str | None) -> int:
    operator = getpass.getuser()
    async with async_session_maker() as session:
        if action == "list":
            mods = await ModerationService(session).list_moderators()
            if not mods:
                print("Модераторов нет")
            for m in mods:
                granted = m.granted_at.strftime("%d.%m.%Y") if m.granted_at else "—"
                print(f"{m.id}  {m.display_name or '(без имени)'}  с {granted}")
            return 0
        assert telegram_id is not None
        try:
            if action == "add":
                user = await grant_moderator(session, telegram_id, operator=operator)
                print(f"Модератор: {user.display_name or user.id}")
            else:
                user = await revoke_moderator(session, telegram_id, operator=operator)
                print(f"Роль снята: {user.display_name or user.id}")
        except NotFoundError as e:
            print(f"Ошибка: {e}", file=sys.stderr)
            return 1
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m src.cli.moderator", description=__doc__.splitlines()[0]
    )
    sub = parser.add_subparsers(dest="action", required=True)
    for name, help_text in (("add", "выдать роль"), ("remove", "снять роль")):
        p = sub.add_parser(name, help=help_text)
        p.add_argument("telegram_id", help="Telegram ID пользователя")
    sub.add_parser("list", help="показать модераторов")
    args = parser.parse_args()
    sys.exit(asyncio.run(run(args.action, getattr(args, "telegram_id", None))))


if __name__ == "__main__":
    main()
