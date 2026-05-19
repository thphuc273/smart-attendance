# ───────────────────────────────────────────────────────
# Smart Attendance — API Dockerfile (multi-stage)
# Build context: workspace root (pnpm workspace packages resolve from there)
# ───────────────────────────────────────────────────────

ARG NODE_VERSION=20.18-alpine

# ───── 1) Deps: install all workspace deps ─────
FROM node:${NODE_VERSION} AS deps
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

# Manifests only first for maximal cache reuse
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ───── 2) Build ─────
FROM node:${NODE_VERSION} AS build
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.33.0 --activate
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
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.33.0 --activate

ENV NODE_ENV=production

# pnpm workspace + `shamefully-hoist=true`: deps are hoisted into the root
# /workspace/node_modules, and apps/api/node_modules holds relative symlinks
# (../../node_modules/.pnpm/...) into it. The /workspace layout must be kept
# intact for those symlinks — and the prisma/ts-node CLIs — to resolve.
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/api/package.json   /workspace/apps/api/package.json
COPY --from=build /workspace/apps/api/tsconfig.json  /workspace/apps/api/tsconfig.json
COPY --from=build /workspace/apps/api/node_modules   /workspace/apps/api/node_modules
COPY --from=build /workspace/apps/api/prisma         /workspace/apps/api/prisma
COPY --from=build /workspace/apps/api/dist           /workspace/apps/api/dist

WORKDIR /workspace/apps/api

EXPOSE 3000

# Entrypoint: sync schema → seed (upsert-based) → start.
# Project has no prisma/migrations — schema is kept in sync via `db push`
# (idempotent). `--skip-generate`: client is already generated at build time.
# If db push fails the container exits — visible in compose logs.
CMD ["sh", "-c", "pnpm prisma db push --skip-generate && pnpm prisma:seed && node dist/main.js"]
