# Database Schema

## Overview

PostgreSQL 16 with async access via asyncpg. All tables use UUID primary keys and timestamp tracking.

## Entity Relationship Diagram

```
┌──────────┐       ┌────────────┐
│  users   │──1:N──│ identities │
└────┬─────┘       └────────────┘
     │
     ├──1:N── consent_records
     ├──1:N── audit_logs
     │
     │         ┌──────────┐
     └──M:N────│ students │────M:N────┐
               └────┬─────┘           │
                    │                 │
                    │          ┌──────▼─────┐
                    └──────────│   groups   │
                               └──────┬─────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
       ┌──────▼──────┐        ┌───────▼───────┐       ┌──────▼──────┐
       │ group_chats │        │schedule_entries│       │ assignments │
       └─────────────┘        └───────┬───────┘       └──────┬──────┘
                                      │                      │
                              ┌───────▼───────┐       ┌──────▼──────┐
                              │schedule_overrides│     │assignment_votes│
                              └───────────────┘       └─────────────┘
                                                             │
                                                      ┌──────▼──────┐
                                                      │task_statuses │
                                                      └─────────────┘
```

## Tables

### users

Main user table.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| display_name | VARCHAR(255) | User's display name |
| settings | JSONB | User preferences |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

### identities

External identity links (Telegram, VK, etc).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| provider | VARCHAR(32) | "telegram", "vk", "max" |
| external_id | VARCHAR(64) | Platform user ID |
| username | VARCHAR(64) | Platform username |
| raw_data | JSONB | Original auth data |

**Constraints:**
- UNIQUE(provider, external_id)

### consent_records

FZ-152 consent tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| consent_type | VARCHAR(64) | Type of consent |
| granted | BOOLEAN | Whether granted |
| ip_address | VARCHAR(45) | Client IP |
| user_agent | VARCHAR(512) | Client UA |
| consent_text_hash | VARCHAR(64) | SHA-256 of text |
| created_at | TIMESTAMP | Grant time |
| revoked_at | TIMESTAMP | Revocation time |

### audit_logs

GOST R 57580 audit trail.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users (nullable) |
| action | VARCHAR(64) | Action type |
| resource | VARCHAR(64) | Resource type |
| resource_id | VARCHAR(64) | Resource ID |
| ip_address | VARCHAR(45) | Client IP |
| user_agent | VARCHAR(512) | Client UA |
| created_at | TIMESTAMP | Event time |

**Indexes:**
- ix_audit_logs_user_id
- ix_audit_logs_created_at

### groups

Academic groups.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| code | VARCHAR(16) | Group code (unique) |
| name | VARCHAR(255) | Optional name |
| owner_id | UUID | FK → users |
| settings | JSONB | Group settings |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

### group_chats

Linked messenger chats.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID | FK → groups |
| provider | VARCHAR(32) | Platform |
| chat_id | VARCHAR(64) | Platform chat ID |

**Constraints:**
- UNIQUE(provider, chat_id)

### students

Group membership.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| group_id | UUID | FK → groups |
| role | ENUM | student, starosta, deputy |
| verified | BOOLEAN | Membership verified |
| created_at | TIMESTAMPTZ | Join time |
| updated_at | TIMESTAMPTZ | Last update |

**Constraints:**
- UNIQUE(user_id, group_id)

### subjects

Academic subjects.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Subject name |
| short_name | VARCHAR(64) | Abbreviation |
| group_id | UUID | FK → groups (nullable) |
| is_custom | BOOLEAN | User-created |

### schedule_entries

Schedule entries.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID | FK → groups |
| subject_id | UUID | FK → subjects |
| weekday | INT | 1-6 (Mon-Sat) |
| pair_number | INT | 1-7 |
| start_time | TIME | Start time |
| end_time | TIME | End time |
| location | VARCHAR(255) | Building |
| room | VARCHAR(64) | Room number |
| teacher | VARCHAR(255) | Teacher name |
| lesson_type | VARCHAR(64) | Lecture/Practice/Lab |
| date_from | DATE | Valid from |
| date_to | DATE | Valid until |
| week_parity | VARCHAR(16) | odd/even/null |
| external_link | VARCHAR(512) | Video link |
| raw_data | JSONB | Original parser data |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

**Indexes:**
- ix_schedule_entries_group_weekday

### schedule_overrides

Schedule modifications.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| entry_id | UUID | FK → schedule_entries |
| scope | ENUM | group, personal |
| override_type | ENUM | cancel, online, link, room, note, skip |
| value | TEXT | Override value |
| date | DATE | Specific date (nullable) |
| author_id | UUID | FK → users |
| student_id | UUID | FK → students (for personal) |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

### assignments

Homework and assignments.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| group_id | UUID | FK → groups |
| subject_id | UUID | FK → subjects |
| title | VARCHAR(255) | Assignment title |
| description | TEXT | Details |
| deadline | TIMESTAMPTZ | Due date |
| priority | VARCHAR(16) | low/normal/high/urgent |
| link | VARCHAR(512) | External link |
| author_id | UUID | FK → users |
| votes_up | INT | Confirmations |
| votes_down | INT | Disputes |
| is_verified | BOOLEAN | Verified by starosta |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

**Indexes:**
- ix_assignments_group_deadline

### assignment_votes

User votes on assignments.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| assignment_id | UUID | FK → assignments |
| user_id | UUID | FK → users |
| vote | INT | 1 or -1 |

**Constraints:**
- UNIQUE(assignment_id, user_id)

### task_statuses

Personal task progress.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| student_id | UUID | FK → students |
| assignment_id | UUID | FK → assignments |
| state | ENUM | todo, doing, review, done |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update |

**Constraints:**
- UNIQUE(student_id, assignment_id)

## Migrations

Managed via Alembic. Run:

```bash
# Apply all migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Rollback one migration
alembic downgrade -1
```
