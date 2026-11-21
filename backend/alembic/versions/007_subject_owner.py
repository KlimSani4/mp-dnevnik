"""Владелец личного предмета (#101).

subjects.owner_id: личный предмет, созданный пользователем, теперь видит только он,
а не вся группа. Для предметов из расписания и для личных предметов, созданных до этой
миграции, owner_id остаётся NULL — их по-прежнему видят все в группе: автора старых
предметов в базе не сохраняли.

Миграция идемпотентна.

Revision ID: 007
Revises: 006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None

INDEX = "ix_subjects_owner_id"
FK = "subjects_owner_id_fkey"


def _columns() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("subjects")}


def upgrade() -> None:
    if "owner_id" not in _columns():
        op.add_column("subjects", sa.Column("owner_id", postgresql.UUID(as_uuid=True)))
        op.create_foreign_key(FK, "subjects", "users", ["owner_id"], ["id"], ondelete="CASCADE")
    op.execute(f"CREATE INDEX IF NOT EXISTS {INDEX} ON subjects (owner_id)")


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDEX}")
    if "owner_id" in _columns():
        op.drop_constraint(FK, "subjects", type_="foreignkey")
        op.drop_column("subjects", "owner_id")
