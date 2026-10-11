# Локальный запуск nexoraPoly

Инструкция для Windows и PowerShell. Backend и frontend запускаются отдельно, поэтому для работы понадобятся два терминала.

# Локальный запуск backend на Windows

Backend запускается локально через Python. В Docker работают только PostgreSQL и Redis. 

Внимание!! Локальный PostgreSQL Windows может у вас занять порт `5432`, нужно будет в Docker Copmose сменить порт и в env ссылку на БД PosgreSQL 
Так же формат `CORS_ORIGINS` ( в файле .env ) должен быть JSON, а примерный Telegram-токен нужно очистить, чтобы все запустилось без бота.

## 1. Откройте PowerShell в папке backend

## 2. Настройте `.env`

Если файла `backend\.env` ещё нет, создайте его из примера:

```powershell
Copy-Item .env.example .env
```

Откройте `.env` и проверьте/установите следующие значения:


```env
APP_ENV=development

APP_SECRET_KEY=вставьте-длинный-случайный-секрет

# тут порт ставим 5433 если у вас есть локальный PosgreSQL и он мешает.
DATABASE_URL=postgresql+asyncpg://nexora:nexora@127.0.0.1:5433/nexora

REDIS_URL=redis://localhost:6379/0

JWT_SECRET_KEY=вставьте-другой-длинный-случайный-секрет

TELEGRAM_BOT_TOKEN=

CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
```

Укажите собственные длинные значения для `APP_SECRET_KEY` и `JWT_SECRET_KEY`; не используйте эти секреты в production. Токен Telegram оставьте пустым, если настоящего токена бота нет. Значение `your-bot-token` — не настоящий токен: если его оставить, запуск приложения завершится с ошибкой `Token is invalid!`.

`CORS_ORIGINS` укажите именно JSON-массивом в квадратных скобках, не списком адресов через запятую. Для desktop frontend проекта используется порт `3000`.

## 3. Перенесите порт Docker PostgreSQL на 5433 (только если есть локальный PostgreSQL и он мешает запуску)

На компьютере может быть установлен PostgreSQL для Windows, который занимает порт `5432`. Чтобы Docker PostgreSQL не конфликтовал с ним, откройте `backend\docker-compose.yml` и в секции сервиса `db` измените проброс порта на:

```yaml
ports:
  - "5433:5432"
```

Левое число — порт на компьютере Windows; правое — порт PostgreSQL внутри контейнера. В `.env` выше уже указан адрес `127.0.0.1:5433`.

## 4. Запустите PostgreSQL и Redis

Всё ещё из папки `backend` выполните:

```powershell
docker compose up -d db redis
docker compose ps
```

У сервисов `db` и `redis` должен быть статус `Up` или `healthy`. Проверьте опубликованный порт базы:

```powershell
docker compose port db 5432
```

Ожидаемый адрес должен оканчиваться на `:5433`. Если он всё ещё показывает `:5432`, проверьте, что изменили порт именно в секции `db`, затем пересоздайте контейнеры:

```powershell
docker compose down
docker compose up -d db redis
```

Не добавляйте `-v` к `docker compose down`: `-v` удалит volumes с данными базы.

## 5. Создайте и активируйте Python-окружение

Команды выполняются в папке `backend`:

```powershell
python -m venv .venv
.venv\Scripts\activate
```

Проверьте, что приглашение PowerShell начинается с `(.venv)`. Если окружение уже создано, повторно создавать его не нужно — достаточно активировать.

## 6. Установите зависимости и примените миграции

С активным `(.venv)` и из папки `backend` выполните:

```powershell
pip install -e ".[dev,test]"
alembic upgrade head
```

Если подключение не проходит, проверьте:

- `DATABASE_URL` указывает на `127.0.0.1:5433`, а не на `127.0.0.1:5432` (если меняли порт).
- `docker compose port db 5432` показывает опубликованный порт `5433`.
- контейнер `db` запущен: `docker compose ps`.

## 7. Запустите backend

```powershell
uvicorn src.main:app --reload --port 8000
```

Не закрывайте этот терминал, пока пользуетесь приложением. При успешном старте откройте:

- API: `http://localhost:8000`
- Документация API: `http://localhost:8000/docs`
- Проверка состояния: `http://localhost:8000/health`

В логах старта ожидаются сообщения об инициализации базы данных и Redis. При пустом `TELEGRAM_BOT_TOKEN` бот будет отключён, но API должно продолжить запуск.

## 8. Остановка и повторный запуск

Остановите сервер сочетанием `Ctrl+C`. Контейнеры базы и Redis можно оставить работающими.

При следующем запуске:

```powershell
cd C:\Users\Илья\Documents\GitHub\mp-dnevnik\backend
.\.venv\Scripts\Activate.ps1
docker compose up -d db redis
uvicorn src.main:app --reload --port 8000
```

Миграции обычно не нужно выполнять заново, если они уже применены. Повторная команда `alembic upgrade head` безопасна и применит только отсутствующие миграции.

# Локальный запуск frontend на Windows

Эта инструкция запускает desktop-сайт Nexora локально в режиме разработки. Frontend работает в браузере, backend запускается отдельно на `localhost:8000`, PostgreSQL и Redis — в Docker. Для полного приложения должны быть запущены все эти части.

## 1. Установите Node.js и pnpm

Проверьте установлены ли Node.js и npm

```powershell
node --version
npm --version
```

Установите Node.js с официального сайта Node.js. Затем откройте PowerShell и снова проверьте:

```powershell
node --version
npm --version
```

Установите pnpm через npm:

```powershell
npm install -g pnpm
```

## 2. Перейдите в папку frontend

Используйте отдельное окно PowerShell для frontend. Backend продолжит работать в своём терминале.

Команды `pnpm` нужно выполнять из `frontend`, где находятся workspace-конфигурация, `package.json` и `pnpm-lock.yaml`.

## 3. Установите зависимости

```powershell
pnpm install
```

Команда скачивает библиотеки frontend в workspace; сам сайт она не запускает. 
При первой установке может появиться сообщение о медленной загрузке отдельных пакетов. Это предупреждение, если установка в конце сообщает, что пакеты добавлены.

### Если pnpm сообщает `ERR_PNPM_IGNORED_BUILDS`

Новые версии pnpm блокируют скрипты установки некоторых зависимостей. Для Vite здесь нужен скрипт пакета `esbuild`.

Запустите:

```powershell
pnpm approve-builds
```

В интерактивном списке отметьте `esbuild` клавишей `Space`, подтвердите `Enter`, затем повторите:

```powershell
pnpm install
```

Не разрешайте скрипты всем пакетам без необходимости. Команда подтверждения может изменить корневой `package.json` согласно политике pnpm.

## 4. Убедитесь, что backend уже запущен

Для работы приложения открой второй терминал и запусти backend по инструкции из `BACKEND_LOCAL_SETUP.md`. В частности, API должен отвечать на `http://localhost:8000/health`.

Локальный frontend по умолчанию использует API `http://localhost:8000/api/v1`. Если frontend открывается, но данные не загружаются, сначала проверь backend и его подключение к базе и Redis.

## 5. Запустите desktop frontend

В PowerShell, находящемся в папке `frontend`, выполните:

```powershell
pnpm --filter @nexora/desktop dev
```

Оставьте терминал открытым. Открой адрес, который Vite напечатает в терминале. В проекте настроен порт `3000`, поэтому обычно это:

```text
http://localhost:3000/
```

Страница входа находится по адресу:

```text
http://localhost:3000/onboarding
```

Важно: `http://localhost:3000/api/v1/auth/dev` — не адрес сайта и не страница входа. Это API-маршрут backend. Интерфейс сайта открывается на корневом адресе `http://localhost:3000/`.

## 6. Вход для локальной разработки

Это Илюша натыкал (я). Пока не понимаю нормально ли...

На локальном адресе `localhost` или `127.0.0.1` на странице onboarding доступна кнопка **«Войти как разработчик»**. Она обращается к backend-маршруту `/api/v1/auth/dev` с тестовым пользователем.

Для успешного входа backend должен быть запущен с настройкой:

```env
APP_ENV=development
```

Это значение задаётся в `backend\.env`. Если backend был запущен до изменения `.env`, останови его `Ctrl+C` и запусти снова. Backend сам проверяет режим: dev-вход не разрешён при `APP_ENV=production`.

Кнопка dev-входа предназначена для локального адреса. Telegram-кнопка открывает настроенного бота; для входа через Telegram нужна соответствующая работающая интеграция. Если Telegram-токен не настроен, используй dev-кнопку.

Если нажата Telegram-кнопка и сайт ожидает подтверждения в боте, нажми **«Отмена»**, чтобы вернуться к выбору входа.

