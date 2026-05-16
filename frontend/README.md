# Nexora Frontend

React + TypeScript frontend for Nexora.

## Stack
- React 18, TypeScript, Vite, Tailwind CSS
- Zustand, TanStack Query, @dnd-kit
- pnpm monorepo: @nexora/shared, @nexora/desktop, @nexora/miniapp

## Local Setup

```bash
# Prerequisites: Node.js 20+, pnpm 9

pnpm install
pnpm --filter @nexora/desktop dev     # Desktop at localhost:5173
pnpm --filter @nexora/miniapp dev     # Mini App at localhost:5174

# Type check
pnpm --filter @nexora/desktop typecheck

# Build
pnpm --filter @nexora/desktop build
```

## Docker

```bash
docker build --build-arg VITE_API_URL=/api/v1 --build-arg VITE_TELEGRAM_BOT_USERNAME=nexora_mpu_bot -t nexora-frontend .
```
