# ───────────────────────────────────────────────────────
# Smart Attendance — API Dockerfile (multi-stage)
# Context build: workspace root (để pnpm resolve workspace packages)
# ───────────────────────────────────────────────────────

ARG NODE_VERSION=20.18-alpine

# ───── 1) Deps stage: install all deps (dev + prod) for the api package ─────
FROM node:${NODE_VERSION} AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

# Copy only lockfile + manifests for maximal layer cache
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY apps/api/package.json apps/api/
# libs layer (add later when libs exist)

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile || pnpm install

# ───── 2) Build stage ─────
FROM node:${NODE_VERSION} AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/api/node_modules ./apps/api/node_modules
COPY . .

WORKDIR /workspace/apps/api
RUN pnpm prisma generate
RUN pnpm build

# ───── 3) Runtime stage ─────
FROM node:${NODE_VERSION} AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

ENV NODE_ENV=production

# Copy runtime essentials
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/prisma ./prisma
COPY --from=build /workspace/apps/api/node_modules ./node_modules

EXPOSE 3000

# Entrypoint: migrate → seed (idempotent) → start
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm prisma:seed && node dist/main.js"]
