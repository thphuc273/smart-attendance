# ───────────────────────────────────────────────────────
# Smart Attendance — API Dockerfile (multi-stage)
# Build context: workspace root (pnpm workspace packages resolve from there)
# ───────────────────────────────────────────────────────

ARG NODE_VERSION=20.18-alpine

# ───── 1) Deps: install all workspace deps ─────
FROM node:${NODE_VERSION} AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

# Manifests only first for maximal cache reuse
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ───── 2) Build ─────
FROM node:${NODE_VERSION} AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

# Bring in deps + source. Copying full /workspace avoids guessing which
# app-level node_modules pnpm hoisted vs nested.
COPY --from=deps /workspace/node_modules ./node_modules
COPY . .
# apps/api/node_modules may or may not exist depending on hoisting; copy
# only if it does. `|| true` tolerates the missing-dir case cleanly.
COPY --from=deps /workspace/apps/api ./apps/api

WORKDIR /workspace/apps/api
RUN pnpm prisma generate
RUN pnpm build

# ───── 3) Runtime ─────
FROM node:${NODE_VERSION} AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

ENV NODE_ENV=production

# Runtime needs: compiled dist, prisma schema + CLI + client, package.json
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/prisma ./prisma
COPY --from=build /workspace/apps/api/node_modules ./node_modules

EXPOSE 3000

# Entrypoint: migrate (idempotent) → seed (upsert-based) → start
# If migrate fails the container exits — visible in compose logs.
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm prisma:seed && node dist/main.js"]
