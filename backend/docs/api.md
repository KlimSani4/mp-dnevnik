# API Reference

Base URL: `/api/v1`

## Authentication

All authenticated endpoints require `Authorization: Bearer <token>` header.

### POST /auth/telegram

Authenticate via Telegram Mini App or Login Widget.

**Request:**
```json
{
  "init_data": "string (Mini App)",
  "widget_data": { "id": 123, "hash": "..." }
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### POST /auth/refresh

Refresh access token.

**Request:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response:** `200 OK` (same as /auth/telegram)

### POST /auth/logout

Log out current user. Requires authentication.

**Response:** `204 No Content`

---

## Users

### GET /users/me

Get current user profile.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "display_name": "string",
  "settings": {},
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### PATCH /users/me

Update current user profile.

**Request:**
```json
{
  "display_name": "string",
  "settings": {}
}
```

### DELETE /users/me

Delete user account and all data (FZ-152 compliance).

**Response:** `204 No Content`

### GET /users/me/data

Export all user data (FZ-152 right to access).

**Response:** `200 OK`
```json
{
  "user": { ... },
  "consents": [ ... ],
  "audit_logs_count": 42
}
```

### GET /users/me/consents

Get active consent records.

### POST /users/me/consents

Grant new consent.

**Request:**
```json
{
  "consent_type": "data_processing"
}
```

---

## Groups

### GET /groups

List groups with optional search.

**Query params:**
- `search` - Search by group code
- `offset` - Pagination offset
- `limit` - Page size (1-100)

### POST /groups

Create new group. Creator becomes starosta.

**Request:**
```json
{
  "code": "231-329",
  "name": "Optional name"
}
```

### GET /groups/my

Get groups current user is member of.

### GET /groups/{code}

Get group by code.

### PATCH /groups/{code}

Update group settings (starosta only).

### POST /groups/{code}/join

Join a group as unverified student.

### POST /groups/{code}/verify/{user_id}

Verify student membership (starosta only).

---

## Schedule

### GET /schedule

Get week schedule.

**Query params:**
- `group` (required) - Group code
- `start_date` - Week start date

**Response:** `200 OK`
```json
[
  {
    "date": "2024-01-15",
    "weekday": 1,
    "entries": [
      {
        "id": "uuid",
        "pair_number": 1,
        "start_time": "09:00:00",
        "end_time": "10:30:00",
        "subject": { "id": "uuid", "name": "Math" },
        "location": "Building A",
        "room": "101",
        "teacher": "Prof. Smith"
      }
    ]
  }
]
```

### GET /schedule/day/{date}

Get schedule for specific date.

### GET /schedule/group/{code}

Get full schedule (all days) for a group.

### POST /schedule/override

Create schedule override.

**Request:**
```json
{
  "entry_id": "uuid",
  "scope": "group|personal",
  "override_type": "cancel|online|link|room|note|skip",
  "value": "string",
  "date": "2024-01-15"
}
```

### DELETE /schedule/override/{id}

Delete schedule override.

---

## Assignments

### GET /assignments

List assignments.

**Query params:**
- `group_id` (required) - Group UUID
- `subject_id` - Filter by subject
- `upcoming_only` - Only show future deadlines
- `offset`, `limit` - Pagination

### POST /assignments

Create assignment.

**Request:**
```json
{
  "group_id": "uuid",
  "subject_id": "uuid",
  "title": "Lab 1",
  "description": "...",
  "deadline": "2024-01-20T23:59:00Z",
  "priority": "normal|low|high|urgent",
  "link": "https://..."
}
```

### GET /assignments/{id}

Get assignment by ID.

### PATCH /assignments/{id}

Update assignment (author or starosta only).

### DELETE /assignments/{id}

Delete assignment (author or starosta only).

### POST /assignments/{id}/vote

Vote on assignment.

**Request:**
```json
{
  "vote": 1
}
```

---

## Tasks

### GET /tasks

Get user's task statuses.

**Query params:**
- `group_id` (required) - Group UUID
- `state` - Filter by state (todo, doing, review, done)

### PATCH /tasks/{assignment_id}

Update task status.

**Request:**
```json
{
  "state": "doing"
}
```

---

## Health Checks

### GET /health

Liveness probe.

**Response:** `200 OK`
```json
{ "status": "ok" }
```

### GET /ready

Readiness probe.

**Response:** `200 OK`
```json
{
  "status": "ready",
  "db": "ok",
  "redis": "ok"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message"
}
```

Status codes:
- `400` - Bad request
- `401` - Authentication required
- `403` - Access denied
- `404` - Not found
- `409` - Conflict
- `422` - Validation error
- `429` - Rate limit exceeded
- `500` - Internal error
