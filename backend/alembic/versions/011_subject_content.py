"""Предметы: семестры, работы, материалы, личный учёт (#165).

- subjects.first_semester / last_semester — в каких семестрах шёл предмет. Для уже
  существующих предметов групп проставляется текущий семестр группы (по коду группы
  и дате миграции): истории раньше не было.
- subject_works — работы (лабы, практики…) с макс. баллом и дедлайном.
- subject_materials — материалы ссылками; file_key — задел под загрузку файлов.
- subject_work_progress — личные отметки «сдал» и баллы.

Миграция идемпотентна.

Revision ID: 011
Revises: 010
"""

from collections.abc import Sequence
from datetime import date

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _content_columns() -> list[sa.Column]:
    return [
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "subject_id",
            UUID(as_uuid=True),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("semester", sa.Integer),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("url", sa.String(1024)),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column(
            "approved_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    for col in ("first_semester", "last_semester"):
        if col not in _columns("subjects"):
            op.add_column("subjects", sa.Column(col, sa.Integer))

    tables = _tables()
    if "subject_works" not in tables:
        op.create_table(
            "subject_works",
            *_content_columns(),
            sa.Column("number", sa.Integer),
            sa.Column("max_points", sa.Float),
            sa.Column("deadline", sa.Date),
            sa.Column("description", sa.Text),
        )
    if "subject_materials" not in tables:
        op.create_table(
            "subject_materials",
            *_content_columns(),
            sa.Column("file_key", sa.String(512)),
            sa.Column("lecture_date", sa.Date),
        )
    if "subject_work_progress" not in tables:
        op.create_table(
            "subject_work_progress",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "work_id",
                UUID(as_uuid=True),
                sa.ForeignKey("subject_works.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "user_id",
                UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("passed", sa.Boolean, nullable=False, server_default=sa.false()),
            sa.Column("points", sa.Float),
            sa.Column("passed_at", sa.DateTime(timezone=True)),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint("work_id", "user_id", name="uq_work_progress_user"),
        )

    _backfill_semesters()


def _backfill_semesters() -> None:
    """Предметам групп без семестра — текущий семестр группы."""
    from src.core.academic import term_for

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT DISTINCT g.id, g.code FROM groups g "
            "JOIN subjects s ON s.group_id = g.id WHERE s.first_semester IS NULL"
        )
    ).all()
    today = date.today()
    for group_id, code in rows:
        term = term_for(code, today)
        if term is None:
            continue
        bind.execute(
            sa.text(
                "UPDATE subjects SET first_semester = :s, last_semester = :s "
                "WHERE group_id = :g AND first_semester IS NULL"
            ),
            {"s": term.semester, "g": group_id},
        )


def downgrade() -> None:
    tables = _tables()
    for table in ("subject_work_progress", "subject_materials", "subject_works"):
        if table in tables:
            op.drop_table(table)
    for col in ("last_semester", "first_semester"):
        if col in _columns("subjects"):
            op.drop_column("subjects", col)
