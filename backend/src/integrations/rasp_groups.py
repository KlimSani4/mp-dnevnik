"""Список групп с rasp.dmami.ru (#146).

Создать группу у нас можно только с кодом, который есть в расписании Политеха: так
никто не займёт код чужой группы (#112) и не наделает групп с опечатками.

Список (~700 групп) берётся из groups-list.json и кэшируется в процессе на час.
Коды бывают не только «241-327», но и «24А-431», «ДПО-ЦМ2», поэтому формат не
проверяем регуляркой, а ищем код в списке без учёта регистра и латинских двойников
кириллицы (A/А, B/В, …), чтобы «24a-431» нашёл «24А-431».
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from src.integrations.rasp_parser import USER_AGENT

logger = logging.getLogger(__name__)

GROUPS_URL = "https://rasp.dmami.ru/groups-list.json"
TTL_SECONDS = 3600
TIMEOUT = 15.0

# Латинские буквы, которые выглядят как кириллические
_LOOKALIKES = str.maketrans("ABCEHKMOPTXY", "АВСЕНКМОРТХУ")

_cache: tuple[float, dict[str, str]] | None = None


def normalize(code: str) -> str:
    """Ключ для сравнения: без пробелов, верхний регистр, латиница → кириллица."""
    return "".join(code.split()).upper().translate(_LOOKALIKES).replace("—", "-").replace("–", "-")


async def _download() -> dict[str, str]:
    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        headers={"User-Agent": USER_AGENT, "Referer": "https://rasp.dmami.ru/"},
    ) as client:
        resp = await client.get(GROUPS_URL)
        resp.raise_for_status()
        data: Any = resp.json()
    groups = data.get("groups") if isinstance(data, dict) else None
    if not isinstance(groups, dict) or not groups:
        raise ValueError("groups-list.json has no groups")
    return {normalize(code): code for code in groups}


async def rasp_groups() -> dict[str, str] | None:
    """{нормализованный код: код как на rasp} или None, если rasp недоступен."""
    global _cache
    now = time.monotonic()
    if _cache and now - _cache[0] < TTL_SECONDS:
        return _cache[1]
    try:
        groups = await _download()
    except Exception:  # noqa: BLE001 — сеть, формат: решает вызывающий
        logger.warning("rasp groups list unavailable", exc_info=True)
        # Устаревший список лучше, чем никакого
        return _cache[1] if _cache else None
    _cache = (now, groups)
    return groups


async def resolve_group_code(code: str) -> str | None:
    """Код группы как на rasp, или None, если такой группы нет.

    Если rasp недоступен — ExternalServiceError: создавать группу вслепую нельзя.
    """
    from src.shared.exceptions import ExternalServiceError

    groups = await rasp_groups()
    if groups is None:
        raise ExternalServiceError("Schedule service is unavailable, try again later")
    return groups.get(normalize(code))
