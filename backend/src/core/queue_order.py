"""Порядок очереди на сдачу лабораторных (#62). Только логика, без базы.

Режимы:
- first_come — по времени записи (с учётом пропусков и обменов до старта);
- random — перемешать всех записавшихся в момент старта (честно для тех, кто не
  успел к открытию записи); кто записался после старта — в конец;
- lab_number — сначала те, кто сдаёт ЛР с меньшим номером (догоняющие), внутри —
  в текущем порядке очереди;
- debtors — сначала те, у кого по предмету сдано меньше лаб, внутри — в текущем порядке.

На вход всегда подаётся текущий порядок очереди: пропуски и обмены, сделанные до
старта, не теряются — сортировка стабильная.
"""

from __future__ import annotations

import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import TypeVar

from src.core.models.queue import QueueMode

T = TypeVar("T")

_rng = random.SystemRandom()


@dataclass(frozen=True)
class OrderItem:
    """То, что нужно для сортировки одной записи."""

    key: object  # id записи
    user_id: object
    joined_at: datetime
    labs: Sequence[int]


def _sort_key(mode: str, debts: Mapping[object, int]) -> Callable[[OrderItem], int] | None:
    if mode == QueueMode.LAB_NUMBER:
        return lambda i: min(i.labs) if i.labs else 10**6
    if mode == QueueMode.DEBTORS:
        return lambda i: debts.get(i.user_id, 0)
    return None


def order_at_start(
    items: Sequence[OrderItem],
    mode: str,
    debts: Mapping[object, int] | None = None,
    rng: random.Random | None = None,
) -> list[OrderItem]:
    """Порядок всех записавшихся в момент старта. items — в текущем порядке очереди."""
    out = list(items)
    if mode == QueueMode.RANDOM:
        (rng or _rng).shuffle(out)
        return out
    key = _sort_key(mode, debts or {})
    return sorted(out, key=key) if key else out


def insert_index(
    waiting: Sequence[OrderItem],
    new: OrderItem,
    mode: str,
    debts: Mapping[object, int] | None = None,
) -> int:
    """Куда встаёт тот, кто записался после старта.

    В режимах по номеру ЛР и должникам — на своё место по ключу (после всех с тем же
    ключом, чтобы никого не обойти), в остальных — в конец.
    """
    key = _sort_key(mode, debts or {})
    if key is None:
        return len(waiting)
    new_key = key(new)
    for i, item in enumerate(waiting):
        if key(item) > new_key:
            return i
    return len(waiting)
