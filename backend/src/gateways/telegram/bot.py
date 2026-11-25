"""Telegram bot setup and configuration."""

import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from src.config import settings
from src.gateways.telegram.handlers import callbacks, forward, guide, schedule, start
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
    # Очередь на сдачу ЛР (#62)
    from src.gateways.telegram.handlers import queue as queue_handlers

    dp.include_router(queue_handlers.router)
    dp.include_router(schedule.router)
    dp.include_router(settings_handler.router)
    dp.include_router(guide.router)
    dp.include_router(callbacks.router)
    dp.include_router(forward.router)

    dp.startup.register(set_commands)
    return dp


async def set_commands(bot: Bot) -> None:
    """Команды в меню Telegram (#158). Ошибка не мешает боту стартовать."""
    from aiogram.types import BotCommand

    from src.gateways.telegram.handlers.start import COMMANDS

    try:
        await bot.set_my_commands([BotCommand(command=c, description=d) for c, d in COMMANDS])
    except Exception:  # noqa: BLE001
        logger.warning("set_my_commands failed", exc_info=True)


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
