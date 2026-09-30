# Переключение деплоя на монорепозиторий

Код бэкенда и фронтенда перенесён сюда с полной историей:

| Было | Стало |
|---|---|
| `KlimSani4/Nexora` | `backend/` |
| `KlimSani4/nexora-frontend` | `frontend/` |

**Прод пока собирается из старых репозиториев.** Здесь работает только CI без публикации образов. С момента переноса изменения вносятся только в этот репозиторий; старые — только для чтения до завершения переключения.

Выполняет тот, у кого есть доступ к GitHub Packages и кластеру.

## 1. Доступ к образам

Образы привязаны к старым репозиториям, поэтому `GITHUB_TOKEN` этого репозитория не сможет их обновить.

Для каждого пакета — `nexora-backend` и `nexora-frontend`:
GitHub → профиль KlimSani4 → Packages → пакет → Package settings → Manage Actions access → Add repository → `mp-dnevnik` → роль **Write**.

## 2. Workflow деплоя

Создать `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths: ["backend/**", "frontend/**"]
  workflow_dispatch:

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.f.outputs.backend }}
      frontend: ${{ steps.f.outputs.frontend }}
    steps:
      - uses: actions/checkout@v4
      - id: f
        uses: dorny/paths-filter@v3
        with:
          filters: |
            backend: ["backend/**"]
            frontend: ["frontend/**"]

  backend:
    needs: changes
    if: needs.changes.outputs.backend == 'true' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions: {contents: read, packages: write}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          context: backend
          push: true
          tags: |
            ghcr.io/klimsani4/nexora-backend:latest
            ghcr.io/klimsani4/nexora-backend:${{ github.sha }}

  frontend:
    needs: changes
    if: needs.changes.outputs.frontend == 'true' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions: {contents: read, packages: write}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          context: frontend
          push: true
          tags: |
            ghcr.io/klimsani4/nexora-frontend:latest
            ghcr.io/klimsani4/nexora-frontend:${{ github.sha }}
          build-args: |
            VITE_API_URL=https://nexora.digitaldrugs.tech/api/v1
            VITE_TELEGRAM_BOT_USERNAME=nexora_mpu_bot
```

Имена образов не меняются, поэтому Keel в кластере ничего перенастраивать не нужно.

## 3. ArgoCD

`frontend/k8s/argocd-app.yaml` смотрит на `klimsani4/nexora-frontend`, ветку **`dev`, которой в репозитории нет**. Уточнить, как на самом деле применяются манифесты в кластере. Если через ArgoCD:

```yaml
  source:
    repoURL: https://github.com/KlimSani4/mp-dnevnik.git
    targetRevision: main
    path: frontend/k8s
```

## 4. Отключить старые репозитории

1. В `KlimSani4/Nexora` и `KlimSani4/nexora-frontend` удалить или отключить workflow деплоя (Actions → workflow → Disable workflow).
2. Сделать тестовый коммит сюда и убедиться, что образы собрались и Keel обновил поды.
3. В README старых репозиториев оставить ссылку на `mp-dnevnik`, затем Settings → Archive this repository.

## Проверка после переключения

- [ ] Workflow Deploy зелёный для обоих образов
- [ ] В ghcr.io у `latest` свежая дата
- [ ] Сайт открывается, вход через Telegram работает
- [ ] Старые репозитории заархивированы
