"""Seed demo data for Nexora.

Idempotent: truncates and re-inserts all demo data.
Usage: cd Nexora && python -m scripts.seed_demo
"""

import asyncio
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.ext.asyncio import async_sessionmaker

from src.config import settings
from src.core.models import (
    Assignment,
    AssignmentVote,
    Base,
    Group,
    Identity,
    Notification,
    NotificationPreference,
    NotificationType,
    ScheduleEntry,
    Semester,
    Student,
    StudentRole,
    Subject,
    SubjectSemester,
    TaskState,
    TaskStatus,
    User,
)

# ─── Fixed UUIDs for deterministic references ───

USER_ID = uuid.UUID("00000000-0000-4000-a000-000000000001")
USER2_ID = uuid.UUID("00000000-0000-4000-a000-000000000002")
USER3_ID = uuid.UUID("00000000-0000-4000-a000-000000000003")
USER4_ID = uuid.UUID("00000000-0000-4000-a000-000000000004")
USER5_ID = uuid.UUID("00000000-0000-4000-a000-000000000005")
GROUP_ID = uuid.UUID("00000000-0000-4000-a000-000000000010")
STUDENT_ID = uuid.UUID("00000000-0000-4000-a000-000000000020")
STUDENT2_ID = uuid.UUID("00000000-0000-4000-a000-000000000021")
STUDENT3_ID = uuid.UUID("00000000-0000-4000-a000-000000000022")
STUDENT4_ID = uuid.UUID("00000000-0000-4000-a000-000000000023")
STUDENT5_ID = uuid.UUID("00000000-0000-4000-a000-000000000024")
SEMESTER_ID = uuid.UUID("00000000-0000-4000-a000-000000000030")

SUBJECT_IDS = {
    "pd": uuid.UUID("00000000-0000-4000-b000-000000000001"),
    "ml": uuid.UUID("00000000-0000-4000-b000-000000000002"),
    "qa": uuid.UUID("00000000-0000-4000-b000-000000000003"),
    "hist": uuid.UUID("00000000-0000-4000-b000-000000000004"),
    "eng": uuid.UUID("00000000-0000-4000-b000-000000000005"),
    "comp": uuid.UUID("00000000-0000-4000-b000-000000000006"),
}

now = datetime.now(timezone.utc)


def days(n: int) -> datetime:
    return now + timedelta(days=n)


async def seed(session: AsyncSession) -> None:
    # ─── Truncate all tables ───
    await session.execute(text("""
        TRUNCATE TABLE
            notification_preferences,
            notifications,
            subject_semesters,
            semesters,
            task_statuses,
            assignment_votes,
            assignments,
            schedule_overrides,
            schedule_entries,
            subjects,
            group_chats,
            students,
            groups,
            consent_records,
            audit_logs,
            identities,
            users
        CASCADE
    """))

    # ─── Users (5 total) ───
    users_data = [
        (USER_ID, "Анастасия Кузнецова", "12345", "anastasia_k"),
        (USER2_ID, "Дмитрий Волков", "12346", "dima_volkov"),
        (USER3_ID, "Мария Соколова", "12347", "masha_s"),
        (USER4_ID, "Алексей Морозов", "12348", "alex_m"),
        (USER5_ID, "Елена Попова", "12349", "lena_p"),
    ]

    for uid, name, ext_id, uname in users_data:
        session.add(User(id=uid, display_name=name, settings={}))
        fname, lname = name.split(" ", 1)
        session.add(Identity(
            user_id=uid,
            provider="telegram",
            external_id=ext_id,
            username=uname,
            raw_data={"first_name": fname, "last_name": lname},
        ))

    # ─── Group ───
    group = Group(id=GROUP_ID, code="241-237", name="241-237", owner_id=USER_ID, settings={})
    session.add(group)

    # ─── Students (5 with different roles) ───
    students_data = [
        (STUDENT_ID, USER_ID, StudentRole.STAROSTA, True),
        (STUDENT2_ID, USER2_ID, StudentRole.DEPUTY, True),
        (STUDENT3_ID, USER3_ID, StudentRole.STUDENT, True),
        (STUDENT4_ID, USER4_ID, StudentRole.STUDENT, True),
        (STUDENT5_ID, USER5_ID, StudentRole.STUDENT, False),  # unverified
    ]

    for sid, uid, role, verified in students_data:
        session.add(Student(
            id=sid,
            user_id=uid,
            group_id=GROUP_ID,
            role=role,
            verified=verified,
        ))

    # ─── Subjects ───
    subjects = {
        "pd": Subject(id=SUBJECT_IDS["pd"], name="Проектная деятельность", short_name="ПД", group_id=GROUP_ID),
        "ml": Subject(id=SUBJECT_IDS["ml"], name="Методы машинного обучения", short_name="Методы МО", group_id=GROUP_ID),
        "qa": Subject(id=SUBJECT_IDS["qa"], name="Обеспечение качества и тестирование ПО", short_name="Тестирование ПО", group_id=GROUP_ID),
        "hist": Subject(id=SUBJECT_IDS["hist"], name="История России", short_name="ИстРос", group_id=GROUP_ID),
        "eng": Subject(id=SUBJECT_IDS["eng"], name="Иностранный язык", short_name="Ин. яз", group_id=GROUP_ID),
        "comp": Subject(id=SUBJECT_IDS["comp"], name="Методы трансляции и компиляции", short_name="Трансляция", group_id=GROUP_ID),
    }
    for s in subjects.values():
        session.add(s)

    # ─── Schedule (Mon-Sat) ───
    PAIR_TIMES = [
        (time(9, 0), time(10, 30)),
        (time(10, 40), time(12, 10)),
        (time(12, 20), time(13, 50)),
        (time(14, 30), time(16, 0)),
        (time(16, 10), time(17, 40)),
    ]

    schedule_data = [
        # Monday
        (1, 1, "pd", "практика", "Н-406", "Иванов И.И.", None),
        (1, 2, "ml", "лекция", "Н-406", "Петров В.С.", None),
        (1, 3, "qa", "лаб", "Н-310", "Сидорова Е.А.", None),
        # Tuesday
        (2, 1, "hist", "лекция", "А-100", "Козлов Д.М.", None),
        (2, 2, "eng", "практика", "Б-205", "Smith J.", None),
        (2, 3, "comp", "лекция", "Н-406", "Николаев А.П.", None),
        (2, 4, "comp", "лаб", "Н-310", "Николаев А.П.", None),
        # Wednesday
        (3, 1, "ml", "лаб", "Н-310", "Петров В.С.", None),
        (3, 2, "ml", "практика", "Н-406", "Петров В.С.", None),
        (3, 3, "pd", "лекция", "А-100", "Иванов И.И.", None),
        # Thursday
        (4, 1, "qa", "лекция", "Н-406", "Сидорова Е.А.", None),
        (4, 2, "qa", "практика", "Н-310", "Сидорова Е.А.", None),
        (4, 3, "hist", "практика", "А-100", "Козлов Д.М.", None),
        # Friday
        (5, 1, "eng", "практика", "Б-205", "Smith J.", None),
        (5, 2, "comp", "практика", "Н-406", "Николаев А.П.", None),
        (5, 3, "pd", "практика", "Н-310", "Иванов И.И.", None),
        # Saturday (only 2 pairs)
        (6, 1, "ml", "лекция", "Онлайн", "Петров В.С.", "https://meet.google.com/abc-defg-hij"),
        (6, 2, "hist", "лекция", "Онлайн", "Козлов Д.М.", "https://zoom.us/j/123456789"),
    ]

    for weekday, pair, subj_key, ltype, room, teacher, link in schedule_data:
        start, end = PAIR_TIMES[pair - 1]
        entry = ScheduleEntry(
            group_id=GROUP_ID,
            subject_id=SUBJECT_IDS[subj_key],
            weekday=weekday,
            pair_number=pair,
            start_time=start,
            end_time=end,
            location="Московский Политех" if room != "Онлайн" else "Онлайн",
            room=room,
            teacher=teacher,
            lesson_type=ltype,
            date_from=date(2025, 9, 1),
            date_to=date(2026, 6, 30),
            week_parity="both",
            external_link=link,
            raw_data={},
        )
        session.add(entry)

    # ─── Assignments ───
    assignments_data = [
        ("a01", "pd", "Спринт 3 — CI/CD пайплайн", "Настроить GitHub Actions: lint, test, build, deploy. Написать Dockerfile и docker-compose.", days(2), "urgent", True, 5, 1),
        ("a02", "ml", "ЛР №3 — Градиентный спуск", "Реализовать стохастический градиентный спуск для линейной регрессии. Python + NumPy.", days(5), "high", True, 3, 0),
        ("a03", "eng", "Эссе — My Future Profession", "Написать эссе на 250-300 слов. Present Simple и Future Simple.", days(10), "normal", False, 1, 0),
        ("a04", "qa", "ЛР №2 — Unit-тестирование", "Покрыть unit-тестами модуль авторизации. pytest + coverage >= 80%.", days(1), "urgent", True, 7, 2),
        ("a05", "hist", "Реферат — Реформы Петра I", "Реферат 15-20 страниц. Введение, 3 главы, заключение. Источники >= 10.", days(14), "high", True, 4, 0),
        ("a06", "comp", "ЛР №4 — Лексический анализатор", "Реализовать лексер для подмножества C. Токенизация.", days(-1), "normal", False, 2, 1),
        ("a07", "pd", "Спринт 2 — MVP бэкенд", "REST API для CRUD заданий. FastAPI + SQLAlchemy async + PostgreSQL.", days(3), "normal", True, 3, 0),
        ("a08", "qa", "ЛР №1 — Smoke-тестирование", "Smoke-тесты для веб-приложения. Selenium + Python.", days(-5), "normal", True, 2, 0),
        ("a09", "ml", "ЛР №2 — Деревья решений", "Decision Tree на Iris. Confusion matrix, accuracy.", days(-10), "high", True, 6, 1),
        ("a10", "comp", "ЛР №3 — Синтаксический анализ", "Рекурсивный нисходящий парсер для арифметических выражений.", days(-3), "normal", True, 4, 0),
        ("a11", "eng", "Презентация — British Education", "Презентация 10 слайдов о системе образования Великобритании.", days(-7), "low", False, 1, 0),
        ("a12", "hist", "ПЗ — Холодная война", "Доклад 5-7 минут. Карибский кризис, гонка вооружений.", days(-2), "high", True, 3, 0),
    ]

    assignment_ids = {}
    for aid, subj_key, title, desc, deadline, priority, verified, vup, vdown in assignments_data:
        a_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"nexora.assignment.{aid}")
        assignment_ids[aid] = a_id
        link_val = "https://lms.mospolytech.ru/mod/assign/view.php?id=12345" if aid == "a02" else (
            "https://github.com/student/nexora-api" if aid == "a07" else (
                "https://github.com/student/parser-lab" if aid == "a10" else None
            )
        )
        a = Assignment(
            id=a_id,
            group_id=GROUP_ID,
            subject_id=SUBJECT_IDS[subj_key],
            title=title,
            description=desc,
            deadline=deadline,
            priority=priority,
            link=link_val,
            author_id=USER_ID,
            votes_up=vup,
            votes_down=vdown,
            is_verified=verified,
        )
        session.add(a)

    # ─── Task Statuses ───
    task_states = {
        "a01": TaskState.TODO,
        "a02": TaskState.DOING,
        "a03": TaskState.DOING,
        "a04": TaskState.TODO,
        "a05": TaskState.REVIEW,
        "a06": TaskState.REVIEW,
        "a07": TaskState.REVIEW,
        "a08": TaskState.DONE,
        "a09": TaskState.DONE,
        "a10": TaskState.DONE,
        "a11": TaskState.DONE,
        "a12": TaskState.TODO,
    }

    for aid, state in task_states.items():
        ts = TaskStatus(
            student_id=STUDENT_ID,
            assignment_id=assignment_ids[aid],
            state=state,
        )
        session.add(ts)

    # ─── Votes ───
    for aid in ["a01", "a04", "a05", "a07", "a09"]:
        vote = AssignmentVote(
            assignment_id=assignment_ids[aid],
            user_id=USER_ID,
            vote=1,
        )
        session.add(vote)

    # ─── Semester ───
    semester = Semester(
        id=SEMESTER_ID,
        name="Весна 2025-2026",
        start_date=date(2026, 2, 1),
        end_date=date(2026, 6, 30),
        is_current=True,
    )
    session.add(semester)

    # ─── SubjectSemester progress ───
    progress_data = [
        ("pd", 0, 0, 5, 3, "zachet"),
        ("ml", 4, 2, 3, 1, "exam"),
        ("qa", 3, 1, 4, 2, "diff_zachet"),
        ("hist", 0, 0, 6, 3, "zachet"),
        ("eng", 0, 0, 8, 5, "zachet"),
        ("comp", 4, 3, 3, 2, "exam"),
    ]

    for subj_key, total_labs, done_labs, total_pz, done_pz, control in progress_data:
        ss = SubjectSemester(
            subject_id=SUBJECT_IDS[subj_key],
            semester_id=SEMESTER_ID,
            student_id=STUDENT_ID,
            total_labs=total_labs,
            done_labs=done_labs,
            total_pz=total_pz,
            done_pz=done_pz,
            control_type=control,
        )
        session.add(ss)

    # ─── Notifications ───
    notif_data = [
        (NotificationType.SCHEDULE_CHANGE, "Изменение расписания", "Пара по ПД в понедельник перенесена в ауд. А-200", False, days(-1)),
        (NotificationType.NEW_ASSIGNMENT, "Новое задание", "ЛР №3 — Градиентный спуск добавлено в Методы МО", True, days(-2)),
        (NotificationType.DEADLINE, "Дедлайн завтра", "ЛР №2 — Unit-тестирование: сдать до завтра", False, days(0)),
        (NotificationType.VOTE, "Голосование", "5 студентов подтвердили задание: Спринт 3 — CI/CD пайплайн", True, days(-3)),
        (NotificationType.DIGEST, "Вечерний дайджест", "Завтра 3 пары: ПД, Методы МО, Тестирование ПО. 2 дедлайна горят.", True, days(-1)),
    ]

    for ntype, title, message, is_read, created in notif_data:
        n = Notification(
            user_id=USER_ID,
            type=ntype,
            title=title,
            message=message,
            is_read=is_read,
            created_at=created,
        )
        session.add(n)

    # ─── Notification Preferences ───
    for ntype in NotificationType:
        enabled = ntype != NotificationType.VOTE
        pref = NotificationPreference(
            user_id=USER_ID,
            type=ntype,
            enabled=enabled,
        )
        session.add(pref)

    await session.commit()
    print("Demo data seeded successfully!")
    print(f"  User: {USER_ID} (Анастасия Кузнецова, telegram:12345)")
    print(f"  Group: {GROUP_ID} (241-237)")
    print(f"  Subjects: {len(subjects)}")
    print(f"  Schedule entries: {len(schedule_data)}")
    print(f"  Assignments: {len(assignments_data)}")
    print(f"  Task statuses: {len(task_states)}")
    print(f"  Notifications: {len(notif_data)}")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await seed(session)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
