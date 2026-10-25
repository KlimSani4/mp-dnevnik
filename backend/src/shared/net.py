"""Определение IP клиента за цепочкой прокси."""

from __future__ import annotations

from fastapi import Request

from src.config import settings


def get_client_ip(request: Request) -> str | None:
    """IP клиента.

    Каждый доверенный прокси дописывает в конец X-Forwarded-For адрес, от которого получил
    запрос. Поэтому клиентом считается элемент, отсчитанный справа на TRUSTED_PROXY_COUNT;
    всё, что левее, подставляет сам клиент и не учитывается.
    """
    count = settings.TRUSTED_PROXY_COUNT
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded and count > 0:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if len(parts) >= count:
            return parts[-count]
    if request.client:
        return request.client.host
    return None
