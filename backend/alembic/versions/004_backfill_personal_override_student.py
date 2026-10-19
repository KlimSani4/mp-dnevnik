"""Backfill student_id for personal schedule overrides.

Personal overrides used to be saved without student_id, so they were never matched
when the schedule was read (hidden lessons reappeared after a reload). Link the
existing ones to the author's student in the group of the overridden entry.

Revision ID: 004
Revises: 003
"""

from collections.abc import Sequence

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    # upper(): enum members may be stored by name ("PERSONAL") or by value ("personal")
    op.execute(
        """
        UPDATE schedule_overrides AS o
        SET student_id = s.id
        FROM schedule_entries AS e, students AS s
        WHERE e.id = o.entry_id
          AND s.user_id = o.author_id
          AND s.group_id = e.group_id
          AND o.student_id IS NULL
          AND upper(o.scope) = 'PERSONAL'
        """
    )


def downgrade() -> None:
    # Data-only migration: the filled student_id values are correct, nothing to undo.
    pass
