"""Модерация платформы (#99).

- users.is_moderator, users.is_teacher;
- таблицы support_requests и teacher_applications;
- роль группы «moderator» переименована в «assistant» (помощник старосты),
  чтобы не путать её с модератором платформы.

Миграция идемпотентна: повторный запуск ничего не ломает.

Revision ID: 005
Revises: 004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    cols = _columns("users")
    if "is_moderator" not in cols:
        op.add_column(
            "users", sa.Column("is_moderator", sa.Boolean(), nullable=False, server_default="false")
        )
    if "is_teacher" not in cols:
        op.add_column(
            "users", sa.Column("is_teacher", sa.Boolean(), nullable=False, server_default="false")
        )

    tables = _tables()
    if "support_requests" not in tables:
        op.create_table(
            "support_requests",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False, server_default="NEW"),
            sa.Column("reply", sa.Text()),
            sa.Column(
                "handled_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            sa.Column("replied_at", sa.DateTime(timezone=True)),
            *_timestamps(),
        )
        op.create_index("ix_support_requests_user_id", "support_requests", ["user_id"])
        op.create_index("ix_support_requests_status", "support_requests", ["status"])

    if "teacher_applications" not in tables:
        op.create_table(
            "teacher_applications",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("full_name", sa.String(255), nullable=False),
            sa.Column("department", sa.String(255)),
            sa.Column("comment", sa.Text()),
            sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
            sa.Column(
                "reviewed_by",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            sa.Column("reviewed_at", sa.DateTime(timezone=True)),
            *_timestamps(),
        )
        op.create_index("ix_teacher_applications_user_id", "teacher_applications", ["user_id"])
        op.create_index("ix_teacher_applications_status", "teacher_applications", ["status"])

    # Enum хранится строкой: имя члена ("MODERATOR") или значение ("moderator") — учитываем оба.
    op.execute(
        "UPDATE students SET role = CASE WHEN role = 'moderator' THEN 'assistant' ELSE 'ASSISTANT' END "
        "WHERE role IN ('MODERATOR', 'moderator')"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE students SET role = CASE WHEN role = 'assistant' THEN 'moderator' ELSE 'MODERATOR' END "
        "WHERE role IN ('ASSISTANT', 'assistant')"
    )
    tables = _tables()
    if "teacher_applications" in tables:
        op.drop_table("teacher_applications")
    if "support_requests" in tables:
        op.drop_table("support_requests")
    cols = _columns("users")
    if "is_teacher" in cols:
        op.drop_column("users", "is_teacher")
    if "is_moderator" in cols:
        op.drop_column("users", "is_moderator")
