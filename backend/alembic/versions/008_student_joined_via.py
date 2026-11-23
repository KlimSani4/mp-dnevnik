"""Способ вступления в группу (#148).

students.joined_via: site / bot / invite. Староста видит в заявке, как человек
её подал. Для существующих участников NULL — способ неизвестен.

Миграция идемпотентна.

Revision ID: 008
Revises: 007
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def _columns() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("students")}


def upgrade() -> None:
    if "joined_via" not in _columns():
        op.add_column("students", sa.Column("joined_via", sa.String(16)))


def downgrade() -> None:
    if "joined_via" in _columns():
        op.drop_column("students", "joined_via")
