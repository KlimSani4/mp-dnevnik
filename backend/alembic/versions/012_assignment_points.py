"""Баллы за задания (#165).

assignments.max_points — максимум за задание (NULL — без баллов).
task_statuses.points — сколько получил студент (NULL — не проставлено).

Миграция идемпотентна.

Revision ID: 012
Revises: 011
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None

COLUMNS = (("assignments", "max_points"), ("task_statuses", "points"))


def _has(table: str, column: str) -> bool:
    return column in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table, column in COLUMNS:
        if not _has(table, column):
            op.add_column(table, sa.Column(column, sa.Float))


def downgrade() -> None:
    for table, column in COLUMNS:
        if _has(table, column):
            op.drop_column(table, column)
