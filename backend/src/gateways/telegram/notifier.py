"""Telegram notification sender."""

import logging

from aiogram import Bot
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

from src.gateways.base import Notifier

logger = logging.getLogger(__name__)


class TelegramNotifier(Notifier):
    """Send notifications via Telegram."""

    def __init__(self, bot: Bot) -> None:
        self.bot = bot

    async def send_message(
        self,
        external_id: str,
        text: str,
        *,
        parse_mode: str | None = None,
    ) -> None:
        """Send message to user by their Telegram ID."""
        pm = ParseMode.HTML if parse_mode == "html" else None

        try:
            await self.bot.send_message(
                chat_id=int(external_id),
                text=text,
                parse_mode=pm,
            )
        except TelegramForbiddenError:
            logger.warning(
                "User blocked the bot",
                extra={"user_id": external_id},
            )
        except TelegramBadRequest as e:
            logger.error(
                "Failed to send message",
                extra={"user_id": external_id, "error": str(e)},
            )
        except Exception:
            logger.exception(
                "Message send error",
                extra={"user_id": external_id},
            )

    async def send_to_chat(
        self,
        chat_id: str,
        text: str,
        *,
        parse_mode: str | None = None,
    ) -> None:
        """Send message to chat."""
        pm = ParseMode.HTML if parse_mode == "html" else None

        try:
            await self.bot.send_message(
                chat_id=int(chat_id),
                text=text,
                parse_mode=pm,
            )
        except TelegramForbiddenError:
            logger.warning(
                "Bot removed from chat",
                extra={"chat_id": chat_id},
            )
        except TelegramBadRequest as e:
            logger.error(
                "Failed to send to chat",
                extra={"chat_id": chat_id, "error": str(e)},
            )
        except Exception:
            logger.exception(
                "Chat message error",
                extra={"chat_id": chat_id},
            )
