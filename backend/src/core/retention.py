"""Срок хранения сетевых данных (ФЗ-152, #116).

IP-адрес и User-Agent нужны для разбора инцидентов, но не бессрочно. Записи журнала и
согласия остаются (они подтверждают факты), у старых записей обнуляются только сетевые поля.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.models.user import AuditLog, ConsentRecord

logger = logging.getLogger(__name__)


async def purge_old_network_metadata(session: AsyncSession, *, days: int | None = None) -> int:
    """Обнулить ip_address и user_agent у записей старше срока хранения. Возвращает число строк."""
    # столбцы created_at хранятся без часового пояса (UTC)
    cutoff = datetime.now(tz=UTC).replace(tzinfo=None) - timedelta(
        days=days or settings.AUDIT_RETENTION_DAYS
    )
    total = 0
    for model in (AuditLog, ConsentRecord):
        result = await session.execute(
            update(model)
            .where(
                model.created_at < cutoff,
                or_(model.ip_address.is_not(None), model.user_agent.is_not(None)),
            )
            .values(ip_address=None, user_agent=None)
        )
        total += getattr(result, "rowcount", 0) or 0
    await session.commit()
    logger.info("Network metadata purged", extra={"rows": total})
    return total
