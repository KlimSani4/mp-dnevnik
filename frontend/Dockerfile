# ---- Stage 1: Сборка ----
FROM node:20-alpine AS builder

# Установка pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Копируем файлы зависимостей отдельно для кэширования слоёв
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/desktop/package.json ./packages/desktop/
COPY packages/miniapp/package.json ./packages/miniapp/

# Устанавливаем все зависимости (включая devDependencies для сборки)
RUN pnpm install --frozen-lockfile

# Копируем исходники
COPY packages/shared/ ./packages/shared/
COPY packages/desktop/ ./packages/desktop/

# Build-time env для Vite (могут быть переданы через --build-arg)
ARG VITE_API_URL=https://nexora.digitaldrugs.tech/api/v1
ARG VITE_TELEGRAM_BOT_USERNAME=nexora_mospolytech_bot
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME

# Собираем desktop-пакет
RUN pnpm --filter @nexora/desktop build

# ---- Stage 2: Nginx для раздачи статики ----
# Образ без root: nginx слушает 8080 и работает от пользователя nginx (uid 101)
FROM nginxinc/nginx-unprivileged:alpine AS runtime

# Копируем собственный конфиг
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

# Копируем собранные файлы из стадии сборки
COPY --from=builder /app/packages/desktop/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
