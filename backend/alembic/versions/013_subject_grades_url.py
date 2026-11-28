"""Ссылка на таблицу с оценками у предмета (#165).

Revision ID: 013
Revises: 012
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def _has() -> bool:
    cols = sa.inspect(op.get_bind()).get_columns("subjects")
    return "grades_url" in {c["name"] for c in cols}


def upgrade() -> None:
    if not _has():
        op.add_column("subjects", sa.Column("grades_url", sa.String(512)))


def downgrade() -> None:
    if _has():
        op.drop_column("subjects", "grades_url")
