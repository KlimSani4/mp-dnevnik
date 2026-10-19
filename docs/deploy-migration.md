# Деплой из монорепозитория

Код бэкенда и фронтенда перенесён сюда с полной историей:

| Было | Стало |
|---|---|
| `KlimSani4/Nexora` | `backend/` |
| `KlimSani4/nexora-frontend` | `frontend/` |

## Как устроен деплой

```
merge в main → Deploy (.github/workflows/deploy.yml) → ghcr.io/klimsani4/nexora-{backend,frontend}:latest
             → Keel в кластере опрашивает latest раз в минуту → перезапуск подов
             → бэкенд при старте выполняет alembic upgrade head (backend/entrypoint.sh)
```

- Собирается только изменённая часть: `backend/**` → образ бэкенда, `frontend/**` → образ фронтенда.
- Теги: `latest` и SHA коммита. Откат — поменять образ в деплойменте на нужный SHA.
- Ручной запуск: Actions → Deploy → Run workflow → `all` / `backend` / `frontend`.
- Имена образов прежние, поэтому Keel перенастраивать не нужно.

## Что осталось сделать вручную

Выполняет владелец `KlimSani4` (нужен доступ к GitHub Packages и кластеру).

### 1. Доступ к образам — до первого запуска

Образы привязаны к старым репозиториям, без этого шага Deploy упадёт на push с `denied: permission_denied`.

Для каждого пакета — `nexora-backend` и `nexora-frontend`:
GitHub → профиль KlimSani4 → Packages → пакет → Package settings → Manage Actions access → Add repository → `mp-dnevnik` → роль **Write**.

### 2. Отключить деплой в старых репозиториях

Иначе случайный пуш туда перезапишет `latest` старым кодом.

`KlimSani4/Nexora` и `KlimSani4/nexora-frontend` → Actions → каждый workflow → ⋯ → Disable workflow.

### 3. Проверить

Actions → Deploy → Run workflow → `all`. Затем:

- [ ] Оба job зелёные
- [ ] В ghcr.io у `latest` свежая дата
- [ ] Через 1–2 минуты поды перезапущены: `kubectl -n nexora get pods`
- [ ] В логах бэкенда миграции прошли: `kubectl -n nexora logs deploy/<бэкенд> | grep alembic`
- [ ] Сайт открывается, вход через Telegram работает

### 4. ArgoCD

`frontend/k8s/argocd-app.yaml` переведён на `mp-dnevnik`, ветка `main`, путь `frontend/k8s`. Раньше он смотрел на ветку `dev` старого репозитория, которой нет, — значит, в кластере манифесты применялись не через него или приложение висит в ошибке. Проверить:

```bash
kubectl -n argocd get application nexora-frontend-dev
```

- Приложение есть → применить новую версию: `kubectl apply -f frontend/k8s/argocd-app.yaml`. Имя не менялось, поэтому обновится источник, а ресурсы не пересоздадутся.
- Приложения нет → манифесты применялись вручную, ArgoCD можно не трогать.

### 5. Заархивировать старые репозитории

После успешной проверки: в README старых репозиториев оставить ссылку на `mp-dnevnik`, затем Settings → Archive this repository.
