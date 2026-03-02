# ---- Stage 1: Сборка ----
FROM node:20-alpine AS builder

# Установка pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

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

# Собираем desktop-пакет
RUN pnpm --filter @nexora/desktop build

# ---- Stage 2: Nginx для раздачи статики ----
FROM nginx:alpine AS runtime

# Удаляем дефолтный конфиг nginx
RUN rm /etc/nginx/conf.d/default.conf

# Копируем собственный конфиг
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранные файлы из стадии сборки
COPY --from=builder /app/packages/desktop/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
