# Architecture

## Overview

Nexora is a platform-agnostic student management system built with FastAPI. The core architecture separates concerns into distinct layers, enabling easy extension to multiple messaging platforms.

## Components

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Web App   │     │  Mini App   │     │   Bot CLI   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────┬───────┴───────────────────┘
                   │
           ┌───────▼───────┐
           │   API Layer   │ ← FastAPI + JWT Auth
           └───────┬───────┘
                   │
           ┌───────▼───────┐
           │  Service Layer│ ← Business Logic
           └───────┬───────┘
                   │
           ┌───────▼───────┐
           │ Repository    │ ← Data Access
           └───────┬───────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼──────┐ ┌──▼──┐ ┌──────▼──────┐
│  PostgreSQL │ │Redis│ │  Gateways   │
└─────────────┘ └─────┘ └─────────────┘
```

## Layers

### API Layer (`src/api/`)

- HTTP endpoints
- Request validation (Pydantic)
- JWT authentication
- Rate limiting middleware
- CORS configuration

### Service Layer (`src/core/services/`)

- Business logic
- Authorization checks
- Audit logging
- Transaction management

### Repository Layer (`src/core/repositories/`)

- Database operations
- Query building
- Caching integration

### Gateway Layer (`src/gateways/`)

- Platform adapters (Telegram, VK, MAX)
- Authentication providers
- Notification dispatchers

## Data Flow

### Schedule Request

```
Client → API → ScheduleService → ScheduleEntryRepository → PostgreSQL
                     ↓
              ScheduleOverrideRepository
                     ↓
              Redis Cache (1h TTL)
```

### Authentication

```
Telegram → validate_init_data() → AuthService → UserRepository
                                        ↓
                                  create_tokens()
                                        ↓
                                  JWT (access + refresh)
```

## Key Decisions

### Platform Agnostic Core

All business logic lives in `src/core/`. Gateway adapters implement abstract interfaces (`AuthProvider`, `Notifier`, `MembershipChecker`). This allows adding new platforms without changing core code.

### Repository Pattern

Direct SQLAlchemy usage in repositories keeps queries flexible while maintaining testability. No ORM abstraction layer - queries are explicit.

### Async Everywhere

Full async/await throughout the stack. No blocking I/O. Database via asyncpg, HTTP via httpx, Redis via redis-py async.

### JWT with Refresh Tokens

Stateless auth with short-lived access tokens (1 hour) and long-lived refresh tokens (30 days). No token blacklist required for simple invalidation scenarios.

## Scaling Considerations

### Horizontal Scaling

- Stateless API servers behind load balancer
- Redis for session affinity (if needed)
- Read replicas for PostgreSQL

### Caching Strategy

- Schedule data: 1 hour TTL in Redis
- User preferences: On-demand caching
- Rate limits: In-memory with Redis fallback

### Background Tasks

- APScheduler for periodic jobs
- Deadline notifications
- Schedule sync from rasp.dmami.ru
