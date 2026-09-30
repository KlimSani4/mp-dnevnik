"""Telegram membership checker."""

import logging

from aiogram import Bot
from aiogram.enums import ChatMemberStatus
from aiogram.exceptions import TelegramBadRequest

from src.gateways.base import MembershipChecker

logger = logging.getLogger(__name__)


class TelegramMembershipChecker(MembershipChecker):
    """Check user membership in Telegram chats."""

    def __init__(self, bot: Bot) -> None:
        self.bot = bot

    async def check_membership(self, chat_id: str, external_id: str) -> bool:
        """Check if user is member of a chat."""
        try:
            member = await self.bot.get_chat_member(
                chat_id=int(chat_id),
                user_id=int(external_id),
            )

            return member.status in (
                ChatMemberStatus.MEMBER,
                ChatMemberStatus.ADMINISTRATOR,
                ChatMemberStatus.CREATOR,
            )

        except TelegramBadRequest as e:
            logger.warning(
                "Failed to check membership",
                extra={
                    "chat_id": chat_id,
                    "user_id": external_id,
                    "error": str(e),
                },
            )
            return False

        except Exception:
            logger.exception(
                "Membership check error",
                extra={"chat_id": chat_id, "user_id": external_id},
            )
            return False
