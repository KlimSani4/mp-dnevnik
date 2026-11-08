"""Убрать дубли предметов и пар, запретить новые дубли предметов (#139).

Параллельные импорты расписания (автоимпорт на каждый пустой день + синхронизация)
создавали одни и те же предметы и пары по несколько раз. Из-за дублей предметов
следующий импорт падал на MultipleResultsFound, синхронизация группы больше никогда
не проходила, и на сайте пары показывались по два-три раза.

Что делает:
1. Дубли предметов из расписания (одинаковые group_id и name, не личные) сливаются
   в один: задания, записи расписания и семестровые требования переносятся на него.
2. Полностью одинаковые записи расписания сливаются в одну, переопределения
   (скрытие, отмена, ссылки) переносятся на оставшуюся запись.
3. Уникальный индекс на (group_id, name) для неличных предметов.

Повторный запуск безопасен: при отсутствии дублей шаги 1–2 ничего не меняют.

Revision ID: 006
Revises: 005
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None

INDEX = "uq_subjects_group_name_official"

# Для каждого дубля — какой предмет оставить (наименьший id в группе дублей)
SUBJECT_MAP = """
    SELECT id AS dup, keep FROM (
        SELECT id, first_value(id) OVER (
            PARTITION BY group_id, name ORDER BY id::text
        ) AS keep
        FROM subjects
        WHERE NOT is_custom AND group_id IS NOT NULL
    ) s WHERE id <> keep
"""

# Полностью одинаковые записи расписания (после слияния предметов)
ENTRY_MAP = """
    SELECT id AS dup, keep FROM (
        SELECT id, first_value(id) OVER (
            PARTITION BY group_id, weekday, pair_number, subject_id, start_time, end_time,
                date_from, date_to, week_parity, lesson_type, room, location, teacher
            ORDER BY id::text
        ) AS keep
        FROM schedule_entries
    ) e WHERE id <> keep
"""


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Предметы
    conn.execute(sa.text(f"CREATE TEMP TABLE subject_map AS {SUBJECT_MAP}"))
    conn.execute(
        sa.text(
            "UPDATE assignments a SET subject_id = m.keep FROM subject_map m "
            "WHERE a.subject_id = m.dup"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE schedule_entries e SET subject_id = m.keep FROM subject_map m "
            "WHERE e.subject_id = m.dup"
        )
    )
    # Требования к семестру уникальны по (предмет, семестр, студент): конфликтующие
    # строки дубля удаляем, остальные переносим
    conn.execute(
        sa.text(
            "DELETE FROM subject_semesters d USING subject_map m, subject_semesters k "
            "WHERE d.subject_id = m.dup AND k.subject_id = m.keep "
            "AND k.semester_id = d.semester_id "
            "AND k.student_id IS NOT DISTINCT FROM d.student_id"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE subject_semesters s SET subject_id = m.keep FROM subject_map m "
            "WHERE s.subject_id = m.dup"
        )
    )
    conn.execute(sa.text("DELETE FROM subjects WHERE id IN (SELECT dup FROM subject_map)"))
    conn.execute(sa.text("DROP TABLE subject_map"))

    # 2. Записи расписания
    conn.execute(sa.text(f"CREATE TEMP TABLE entry_map AS {ENTRY_MAP}"))
    conn.execute(
        sa.text(
            "UPDATE schedule_overrides o SET entry_id = m.keep FROM entry_map m "
            "WHERE o.entry_id = m.dup"
        )
    )
    conn.execute(sa.text("DELETE FROM schedule_entries WHERE id IN (SELECT dup FROM entry_map)"))
    conn.execute(sa.text("DROP TABLE entry_map"))

    # 3. Новых дублей предметов больше не будет
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {INDEX} ON subjects (group_id, name) "
        "WHERE NOT is_custom AND group_id IS NOT NULL"
    )


def downgrade() -> None:
    # Удалённые дубли не восстанавливаем: это были копии
    op.execute(f"DROP INDEX IF EXISTS {INDEX}")
