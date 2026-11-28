"""Работы предметов становятся заданиями.

Раньше лабу можно было завести двумя способами: работой на странице предмета или
заданием. Теперь сущность одна: задание с типом (лаба, практика, ДЗ, КР…),
номером и семестром.

- assignments: kind (NULL — обычное задание), number, semester.
- subject_works → assignments: id сохраняется, дедлайн-дата → 23:59 МСК,
  «на проверке» → не подтверждено голосами; работы своих предметов — личные.
- subject_work_progress → task_statuses: «сдал» → done, баллы переносятся.
- Таблицы subject_works и subject_work_progress удаляются.

downgrade возвращает пустые таблицы работ; перенесённые задания остаются заданиями.

Revision ID: 014
Revises: 013
"""

import importlib.util
from collections.abc import Sequence
from pathlib import Path

import sqlalchemy as sa

from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None

NEW_COLUMNS = (
    ("kind", sa.String(16)),
    ("number", sa.Integer),
    ("semester", sa.Integer),
)

COPY_WORKS = """
INSERT INTO assignments (
    id, group_id, subject_id, title, description, deadline, priority, link,
    author_id, votes_up, votes_down, is_verified, is_personal, max_points,
    kind, number, semester, created_at, updated_at
)
SELECT
    w.id,
    g.group_id,
    w.subject_id,
    w.title,
    w.description,
    CASE WHEN w.deadline IS NULL THEN NULL
         ELSE (w.deadline::timestamp + interval '20 hours 59 minutes') AT TIME ZONE 'UTC'
    END,
    'normal',
    LEFT(w.url, 512),
    COALESCE(w.author_id, w.approved_by, s.owner_id, gr.owner_id),
    0,
    0,
    w.status = 'approved',
    s.is_custom,
    w.max_points,
    w.kind,
    w.number,
    w.semester,
    w.created_at,
    w.updated_at
FROM subject_works w
JOIN subjects s ON s.id = w.subject_id
CROSS JOIN LATERAL (
    SELECT COALESCE(
        s.group_id,
        (SELECT st.group_id FROM students st WHERE st.user_id = s.owner_id LIMIT 1)
    ) AS group_id
) g
JOIN groups gr ON gr.id = g.group_id
WHERE COALESCE(w.author_id, w.approved_by, s.owner_id, gr.owner_id) IS NOT NULL
ON CONFLICT (id) DO NOTHING
"""

COPY_PROGRESS = """
INSERT INTO task_statuses (id, student_id, assignment_id, state, points, created_at, updated_at)
SELECT
    gen_random_uuid(),
    st.id,
    a.id,
    -- Enum(TaskState, native_enum=False) хранит имена: DONE / TODO
    CASE WHEN p.passed THEN 'DONE' ELSE 'TODO' END,
    p.points,
    p.created_at,
    p.updated_at
FROM subject_work_progress p
JOIN assignments a ON a.id = p.work_id
JOIN students st ON st.user_id = p.user_id AND st.group_id = a.group_id
ON CONFLICT ON CONSTRAINT uq_task_status_student_assignment DO NOTHING
"""


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    have = _columns("assignments")
    for name, type_ in NEW_COLUMNS:
        if name not in have:
            op.add_column("assignments", sa.Column(name, type_))

    tables = _tables()
    if "subject_works" in tables:
        op.execute(COPY_WORKS)
        if "subject_work_progress" in tables:
            op.execute(COPY_PROGRESS)
            op.drop_table("subject_work_progress")
        op.drop_table("subject_works")


def downgrade() -> None:
    # Схему таблиц работ берём из 011, чтобы не дублировать
    spec = importlib.util.spec_from_file_location(
        "m011", Path(__file__).with_name("011_subject_content.py")
    )
    assert spec and spec.loader
    m011 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m011)
    tables = _tables()
    if "subject_works" not in tables or "subject_work_progress" not in tables:
        # 011.upgrade идемпотентна: создаст только недостающие таблицы
        m011.upgrade()

    have = _columns("assignments")
    for name, _ in NEW_COLUMNS:
        if name in have:
            op.drop_column("assignments", name)
