"""Порядок очереди на сдачу ЛР (#62): чистая логика без базы."""

import random
from datetime import UTC, datetime, timedelta

from src.core.models.queue import QueueMode
from src.core.queue_order import OrderItem, insert_index, order_at_start

T0 = datetime(2026, 11, 25, 9, 0, tzinfo=UTC)


def item(name: str, minute: int, labs: list[int]) -> OrderItem:
    return OrderItem(key=name, user_id=name, joined_at=T0 + timedelta(minutes=minute), labs=labs)


ITEMS = [item("a", 0, [3]), item("b", 1, [1, 2]), item("c", 2, [2]), item("d", 3, [1])]


def keys(items: list[OrderItem]) -> list[object]:
    return [i.key for i in items]


def test_first_come_keeps_current_order() -> None:
    # Порядок до старта уже учитывает пропуски и обмены — не пересортировываем
    assert keys(order_at_start(list(reversed(ITEMS)), QueueMode.FIRST_COME)) == ["d", "c", "b", "a"]


def test_lab_number_lowest_first_stable() -> None:
    assert keys(order_at_start(ITEMS, QueueMode.LAB_NUMBER)) == ["b", "d", "c", "a"]
    swapped = [ITEMS[0], ITEMS[3], ITEMS[2], ITEMS[1]]  # d поменялся с b до старта
    assert keys(order_at_start(swapped, QueueMode.LAB_NUMBER)) == ["d", "b", "c", "a"]


def test_debtors_fewest_done_first() -> None:
    debts = {"a": 5, "b": 2, "c": 0, "d": 2}
    assert keys(order_at_start(ITEMS, QueueMode.DEBTORS, debts)) == ["c", "b", "d", "a"]


def test_debtors_without_progress_count_as_zero() -> None:
    assert keys(order_at_start(ITEMS, QueueMode.DEBTORS, {"a": 1})) == ["b", "c", "d", "a"]


def test_random_is_a_permutation() -> None:
    out = order_at_start(ITEMS, QueueMode.RANDOM, rng=random.Random(1))
    assert sorted(keys(out)) == ["a", "b", "c", "d"]  # type: ignore[type-var]


def test_late_join_first_come_and_random_go_last() -> None:
    late = item("e", 10, [1])
    for mode in (QueueMode.FIRST_COME, QueueMode.RANDOM):
        assert insert_index(ITEMS, late, mode) == len(ITEMS)


def test_late_join_lab_number_after_same_key() -> None:
    waiting = order_at_start(ITEMS, QueueMode.LAB_NUMBER)  # b(1) d(1) c(2) a(3)
    assert insert_index(waiting, item("e", 10, [1]), QueueMode.LAB_NUMBER) == 2
    assert insert_index(waiting, item("e", 10, [2]), QueueMode.LAB_NUMBER) == 3
    assert insert_index(waiting, item("e", 10, [7]), QueueMode.LAB_NUMBER) == 4


def test_late_join_debtors() -> None:
    debts = {"a": 5, "b": 2, "c": 0, "d": 2, "e": 1}
    waiting = order_at_start(ITEMS, QueueMode.DEBTORS, debts)  # c b d a
    assert insert_index(waiting, item("e", 10, [1]), QueueMode.DEBTORS, debts) == 1
