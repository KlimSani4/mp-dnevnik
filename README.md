<div align="center">

# nexoraPoly

**Единое место правды о расписании и заданиях для студентов Московского Политеха**

[Открыть приложение](https://nexora.digitaldrugs.tech) · [Документация](docs/README.md) · [Roadmap](docs/roadmap.md) · [Сообщить о баге](../../issues/new?template=bug_report.yml)

![status](https://img.shields.io/badge/status-alpha-orange)
![version](https://img.shields.io/badge/version-0.1.0--alpha-blue)
![license](https://img.shields.io/badge/license-MIT-green)

</div>

---

## О проекте

nexoraPoly (ранее `mp-dnevnik`) — веб-приложение, которое собирает расписание, задания, дедлайны и уведомления группы в одном месте. Цель — убрать зависимость от разрозненных чатов, таблиц и скриншотов расписания.

Вход и уведомления — через Telegram-бота.

## Возможности

### Уже работает

| Модуль | Возможности |
|---|---|
| Расписание | День / неделя, числитель и знаменатель, «окна» между парами, онлайн-пары с кнопкой подключения, свои занятия, скрытие занятий |
| Задания | Канбан (нужно сделать → на проверке → зачтено), приоритет, дедлайн, ссылка на сдачу, контакт преподавателя, личные и групповые задания |
| Групповые задания | Голосование группы: подтвердить / оспорить задание |
| Предметы | Прогресс по заданиям, статус ДОПУСК / НЕДОПУСК по требуемому числу работ |
| Группы | Поиск и вступление, заявки, роли: студент, модератор, староста |
| Уведомления | Изменения расписания, новые задания, дедлайны, голосования, вечерний дайджест — в Telegram |
| Интерфейс | Светлая и тёмная тема, адаптивная вёрстка |

### В планах

Расписание сессии и пересдач, интеграции с зачётной книжкой, ПД, физкультурой и ДПО, PWA и офлайн-режим, экспорт в календарь, интерфейс преподавателя. Подробно — в [roadmap](docs/roadmap.md).

## Роли

| Роль | Возможности |
|---|---|
| Студент | Расписание, личные задания, участие в голосованиях по заданиям группы |
| Модератор | Помогает старосте управлять группой |
| Староста | Подтверждает участников, назначает роли, публикует задания для группы |
| Преподаватель | *Планируется* — задания, оценки, посещаемость, управление занятиями |

## Структура репозитория

```
.
├── backend/    # FastAPI: API /api/v1, Telegram-бот, миграции, тесты
├── frontend/   # pnpm-монорепо: shared, desktop (сайт), miniapp (Telegram Mini App)
│   └── k8s/    # манифесты Kubernetes
├── deploy/     # заметки по развёртыванию
├── docs/       # документация проекта
└── .github/    # CI, шаблоны issues и PR, импорт roadmap
```

## Быстрый старт

```bash
# Бэкенд — Python 3.12, Docker
cd backend
docker compose up -d postgres redis
pip install -e ".[dev,test]"
alembic upgrade head
uvicorn src.main:app --reload --port 8000

# Фронтенд — Node.js 20, pnpm 9
cd frontend
pnpm install
pnpm --filter @nexora/desktop dev   # http://localhost:5173
```

Подробнее — [backend/README.md](backend/README.md) и [frontend/README.md](frontend/README.md).

## CI/CD

| Workflow | Когда запускается | Что делает |
|---|---|---|
| Backend CI | изменения в `backend/` | ruff, mypy, bandit, тесты с PostgreSQL и Redis, сборка Docker-образа |
| Frontend CI | изменения в `frontend/` | typecheck, сборка, сборка Docker-образа |

Деплой пока идёт из старых репозиториев `KlimSani4/Nexora` и `KlimSani4/nexora-frontend`. План переключения — [docs/deploy-migration.md](docs/deploy-migration.md).

## Документация

| Документ | Содержание |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Компоненты, стек, API, авторизация |
| [docs/roadmap.md](docs/roadmap.md) | План развития по фазам |
| [docs/deploy-migration.md](docs/deploy-migration.md) | Переключение деплоя на этот репозиторий |
| [backend/docs/](backend/docs/) | API, архитектура и схема БД бэкенда |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Как вести ветки, коммиты, issues и PR |
| [SECURITY.md](SECURITY.md) | Как сообщить об уязвимости |
| [CHANGELOG.md](CHANGELOG.md) | История изменений |

## Команда

Проект создан в рамках проектной деятельности Московского Политеха под руководством Чернова В. М.

Идея и реализация: [thehaffk](https://github.com/thehaffk), [whynotfu](https://github.com/whynotfu), [plaguess](https://github.com/plaguess), [KlimSani4](https://github.com/KlimSani4), [PiuiP](https://github.com/PiuiP), [Ilyaaa-a](https://github.com/Ilyaaa-a).

## Лицензия

[MIT](LICENSE)
