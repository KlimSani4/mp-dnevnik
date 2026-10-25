"""Очистка ссылок заданий, не являющихся http(s) (#98, F-04).

Revision ID: 006
Revises: 005
"""

from collections.abc import Sequence

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # javascript:, data: и любые другие схемы небезопасны в href; допустимы только http(s)
    op.execute(
        "UPDATE assignments SET link = NULL "
        "WHERE link IS NOT NULL AND link !~* '^https?://[^[:space:]]+$'"
    )


def downgrade() -> None:
    # Удалённые ссылки восстановить нельзя
    pass
