"""Application entrypoint."""

import asyncio
import logging
import signal
import sys

from src.api.app import create_app
from src.config import settings
from src.gateways.telegram import create_bot, create_dispatcher

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)


async def run_bot() -> None:
    """Run Telegram bot in polling mode."""
    bot = create_bot()
    if not bot:
        logger.warning("Bot not configured, skipping")
        return

    dp = create_dispatcher()

    logger.info("Starting bot polling...")
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await bot.session.close()


async def shutdown(sig: signal.Signals, loop: asyncio.AbstractEventLoop) -> None:
    """Graceful shutdown handler."""
    logger.info(f"Received exit signal {sig.name}")

    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]

    for task in tasks:
        task.cancel()

    logger.info(f"Cancelling {len(tasks)} tasks")
    await asyncio.gather(*tasks, return_exceptions=True)

    loop.stop()


def main() -> None:
    """Main entrypoint for running the bot standalone."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def create_shutdown_handler(sig: signal.Signals) -> None:
        """Create shutdown task for signal."""
        asyncio.create_task(shutdown(sig, loop))

    # Register signal handlers
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, create_shutdown_handler, sig)

    try:
        loop.run_until_complete(run_bot())
    finally:
        loop.close()
        logger.info("Shutdown complete")


# FastAPI application
app = create_app()


if __name__ == "__main__":
    # Run bot in polling mode when executed directly
    main()
