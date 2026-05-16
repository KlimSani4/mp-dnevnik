# Nexora Backend

FastAPI backend for Nexora — student planning platform for Moscow Polytechnic.

## Stack
- Python 3.12, FastAPI, SQLAlchemy 2.0 async
- PostgreSQL 16, Redis 7
- aiogram 3.x (Telegram bot)
- APScheduler (notifications)

## Local Setup

```bash
# Prerequisites: Docker, Python 3.12

# 1. Start infrastructure
docker compose up -d postgres redis

# 2. Install dependencies  
pip install -e ".[dev,test]"

# 3. Run migrations
alembic upgrade head

# 4. Start server
uvicorn src.main:app --reload --port 8000

# 5. Run tests
pytest --cov=src --cov-report=term-missing
```

## Environment Variables
See `.env.example` or `docker-compose.yml` for required variables.

## CI/CD
- **Test**: pytest with PostgreSQL + Redis services
- **Lint**: ruff check + ruff format + mypy --strict  
- **Deploy**: GitHub Actions → ghcr.io → Keel auto-deploy on K8s

[![codecov](https://codecov.io/gh/KlimSani4/Nexora/branch/main/graph/badge.svg)](https://codecov.io/gh/KlimSani4/Nexora)
