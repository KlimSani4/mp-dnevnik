# deploy

| Что | Где |
|---|---|
| Манифесты Kubernetes фронтенда | [frontend/k8s/](../frontend/k8s/) |
| Docker-образы | [backend/Dockerfile](../backend/Dockerfile), [frontend/Dockerfile](../frontend/Dockerfile) |
| Локальная инфраструктура бэкенда | [backend/docker-compose.yml](../backend/docker-compose.yml) |
| Переключение деплоя на этот репозиторий | [docs/deploy-migration.md](../docs/deploy-migration.md) |

Production: https://nexora.digitaldrugs.tech (Cloudflare → Kubernetes, образы в ghcr.io, автообновление через Keel).

## Переменные окружения безопасности бэкенда (#98)

| Переменная | Значение в production |
|---|---|
| `APP_ENV` | `production` (значение по умолчанию). Любое другое значение отключает проверки секретов; `development` включает `/auth/dev` и `/docs` |
| `APP_SECRET_KEY`, `JWT_SECRET_KEY` | Случайные, разные, не короче 32 символов. С примерными или короткими значениями приложение не запустится. Из `APP_SECRET_KEY` выводится секрет вызовов бота во внутренние маршруты |
| `TRUSTED_PROXY_COUNT` | Число прокси перед приложением, дописывающих адрес в `X-Forwarded-For`, включая nginx. Для цепочки Cloudflare → Traefik → nginx → бэкенд это `3`. Если значение занижено, все пользователи выглядят как один IP и упираются в общие лимиты запросов; если завышено, IP можно подделать |
| `AUDIT_RETENTION_DAYS` | Срок хранения IP и User-Agent в журналах, по умолчанию 365 |

Фронтенд-образ работает от пользователя `nginx` (uid 101) и слушает порт `8080`, корневая файловая система только для чтения, для `/tmp` нужен `emptyDir` (см. `frontend/k8s/deployment.yaml`).
