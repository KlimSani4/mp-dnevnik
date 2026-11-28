"""Ссылка-приглашение в группу (#147).

groups.invite_token: случайный токен для /join/<токен> и t.me/<бот>?start=join_<токен>.
NULL — ссылку ещё не запрашивали, создаётся при первом запросе.

Миграция идемпотентна.

Revision ID: 010
Revises: 009
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None

INDEX = "uq_groups_invite_token"


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def upgrade() -> None:
    if "invite_token" not in {c["name"] for c in _inspector().get_columns("groups")}:
        op.add_column("groups", sa.Column("invite_token", sa.String(32)))
    if INDEX not in {i["name"] for i in _inspector().get_indexes("groups")}:
        op.create_index(INDEX, "groups", ["invite_token"], unique=True)


def downgrade() -> None:
    if INDEX in {i["name"] for i in _inspector().get_indexes("groups")}:
        op.drop_index(INDEX, table_name="groups")
    if "invite_token" in {c["name"] for c in _inspector().get_columns("groups")}:
        op.drop_column("groups", "invite_token")
