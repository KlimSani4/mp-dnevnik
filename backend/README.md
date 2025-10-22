# Nexora

Студенческая платформа для Московского Политеха. Собирает расписание, задания и дедлайны в одном месте.

## Зачем

У студентов данные разбросаны: расписание на одном сайте, ПД и физра в разное время, лекции то очно, то в Zoom, задания теряются в чатах. Nexora решает это.

## Возможности

- Расписание с персонализацией (парсинг rasp.dmami.ru)
- Задания от одногруппников с голосованием
- Личный канбан
- Уведомления в Telegram

## Требования

- Python 3.12+
- PostgreSQL 16
- Redis 7
- Docker

## Запуск

```bash
# Клонировать
git clone https://github.com/KlimSani4/Nexora.git
cd Nexora

# Настроить
cp .env.example .env
# Отредактировать .env

# БД
docker compose up -d db redis

# Зависимости
uv sync

# Миграции
uv run alembic upgrade head

# Запуск
uv run uvicorn src.main:app --reload
```

## Структура

```
src/
├── api/          # HTTP endpoints
├── core/         # Бизнес-логика
├── gateways/     # Telegram, VK, MAX
├── integrations/ # Внешние сервисы
└── shared/       # Общие утилиты
```

## Документация

- [Архитектура](docs/architecture.md)
- [API](docs/api.md)
- [База данных](docs/database.md)

## Разработка

```bash
# Тесты
uv run pytest

# Линтеры
uv run black src tests
uv run ruff check src tests
uv run mypy src
```

## Лицензия

MIT
