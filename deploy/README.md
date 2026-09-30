# deploy

| Что | Где |
|---|---|
| Манифесты Kubernetes фронтенда | [frontend/k8s/](../frontend/k8s/) |
| Docker-образы | [backend/Dockerfile](../backend/Dockerfile), [frontend/Dockerfile](../frontend/Dockerfile) |
| Локальная инфраструктура бэкенда | [backend/docker-compose.yml](../backend/docker-compose.yml) |
| Переключение деплоя на этот репозиторий | [docs/deploy-migration.md](../docs/deploy-migration.md) |

Production: https://nexora.digitaldrugs.tech (Cloudflare → Kubernetes, образы в ghcr.io, автообновление через Keel).
