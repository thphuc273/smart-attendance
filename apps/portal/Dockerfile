# ───────────────────────────────────────────────────────
# Smart Attendance — Portal Dockerfile (multi-stage)
# Build context: workspace root. Next.js 15 `output: 'standalone'`.
# ───────────────────────────────────────────────────────

ARG NODE_VERSION=20.18-alpine

# ───── 1) Deps: install all workspace deps ─────
FROM node:${NODE_VERSION} AS deps
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/portal/package.json apps/portal/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ───── 2) Build ─────
FROM node:${NODE_VERSION} AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/portal/node_modules ./apps/portal/node_modules
COPY . .

# Build-time: bake the API URL into the Next static chunks (NEXT_PUBLIC_*)
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

WORKDIR /workspace/apps/portal
RUN pnpm build

# ───── 3) Runtime ─────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0

# Standalone output contains a minimal server.js + just the node_modules it needs
COPY --from=build /workspace/apps/portal/.next/standalone ./
COPY --from=build /workspace/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=build /workspace/apps/portal/public ./apps/portal/public

EXPOSE 3100
CMD ["node", "apps/portal/server.js"]
