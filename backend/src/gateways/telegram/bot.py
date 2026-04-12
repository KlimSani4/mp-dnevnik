"""Telegram bot setup and configuration."""

import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from src.config import settings
from src.gateways.telegram.handlers import callbacks, schedule, start
from src.gateways.telegram.handlers import settings as settings_handler

logger = logging.getLogger(__name__)

_bot_instance: Bot | None = None


async def get_bot() -> Bot:
    """Get or create the bot singleton instance."""
    global _bot_instance
    if _bot_instance is None:
        _bot_instance = Bot(
            token=settings.TELEGRAM_BOT_TOKEN,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
    return _bot_instance


def create_bot() -> Bot | None:
    """Create Telegram bot instance."""
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("Telegram bot token not configured")
        return None

    return Bot(
        token=settings.TELEGRAM_BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


def create_dispatcher() -> Dispatcher:
    """Create and configure dispatcher with handlers."""
    dp = Dispatcher()

    # Include routers
    dp.include_router(start.router)
    dp.include_router(schedule.router)
    dp.include_router(settings_handler.router)
    dp.include_router(callbacks.router)

    return dp


async def setup_webhook(bot: Bot, webhook_url: str) -> None:
    """Set up webhook for the bot."""
    await bot.set_webhook(
        url=webhook_url,
        secret_token=settings.TELEGRAM_WEBHOOK_SECRET,
        drop_pending_updates=True,
    )
    logger.info("Webhook set", extra={"url": webhook_url})


async def remove_webhook(bot: Bot) -> None:
    """Remove webhook from the bot."""
    await bot.delete_webhook()
    logger.info("Webhook removed")
