"""Очередь на сдачу лабораторных (#62).

Таблицы lab_queues, lab_queue_entries, lab_queue_swaps. На одну пару в один день
может быть только одна незакрытая очередь (частичный уникальный индекс).

Миграция идемпотентна.

Revision ID: 009
Revises: 008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None

UUID = postgresql.UUID(as_uuid=True)


def _ts() -> list[sa.Column[object]]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())

    if "lab_queues" not in tables:
        op.create_table(
            "lab_queues",
            sa.Column("id", UUID, primary_key=True),
            sa.Column("group_id", UUID, sa.ForeignKey("groups.id", ondelete="CASCADE"), nullable=False),
            sa.Column("subject_id", UUID, sa.ForeignKey("subjects.id", ondelete="SET NULL")),
            sa.Column("entry_id", UUID, sa.ForeignKey("schedule_entries.id", ondelete="SET NULL")),
            sa.Column("lesson_date", sa.Date, nullable=False),
            sa.Column("start_time", sa.Time),
            sa.Column("title", sa.String(256), nullable=False),
            sa.Column("mode", sa.String(16), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("max_labs", sa.Integer, nullable=False, server_default="3"),
            sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("started_at", sa.DateTime(timezone=True)),
            sa.Column("closed_at", sa.DateTime(timezone=True)),
            *_ts(),
        )
    op.execute("CREATE INDEX IF NOT EXISTS ix_lab_queues_group_id ON lab_queues (group_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lab_queues_status ON lab_queues (status)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_queues_active_lesson "
        "ON lab_queues (entry_id, lesson_date) WHERE status <> 'closed'"
    )

    if "lab_queue_entries" not in tables:
        op.create_table(
            "lab_queue_entries",
            sa.Column("id", UUID, primary_key=True),
            sa.Column("queue_id", UUID, sa.ForeignKey("lab_queues.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("student_id", UUID, sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
            sa.Column("labs", sa.JSON, nullable=False),
            sa.Column("position", sa.Integer, nullable=False, server_default="0"),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("skips", sa.Integer, nullable=False, server_default="0"),
            sa.Column("finished_at", sa.DateTime(timezone=True)),
            *_ts(),
            sa.UniqueConstraint("queue_id", "user_id", name="uq_lab_queue_entry_user"),
        )
    op.execute("CREATE INDEX IF NOT EXISTS ix_lab_queue_entries_queue_id ON lab_queue_entries (queue_id)")

    if "lab_queue_swaps" not in tables:
        op.create_table(
            "lab_queue_swaps",
            sa.Column("id", UUID, primary_key=True),
            sa.Column("queue_id", UUID, sa.ForeignKey("lab_queues.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "from_entry_id", UUID, sa.ForeignKey("lab_queue_entries.id", ondelete="CASCADE"), nullable=False
            ),
            sa.Column(
                "to_entry_id", UUID, sa.ForeignKey("lab_queue_entries.id", ondelete="CASCADE"), nullable=False
            ),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("resolved_at", sa.DateTime(timezone=True)),
            *_ts(),
        )
    op.execute("CREATE INDEX IF NOT EXISTS ix_lab_queue_swaps_queue_id ON lab_queue_swaps (queue_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS lab_queue_swaps")
    op.execute("DROP TABLE IF EXISTS lab_queue_entries")
    op.execute("DROP TABLE IF EXISTS lab_queues")
