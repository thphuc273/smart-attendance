#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "⚠️  .env not found — copying from .env.example"
  cp .env.example .env
fi

# Export root .env so Prisma (run from apps/api) sees DATABASE_URL
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "🛑 Stopping and removing containers..."
docker compose down -v

echo "🚀 Starting Postgres and Redis..."
docker compose up postgres redis -d

echo "⏳ Waiting for Postgres to be ready..."
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-sa_user}" >/dev/null 2>&1; do
  sleep 1
done

cd apps/api

echo "🧹 Resetting database & applying schema..."
npx prisma db push --force-reset --accept-data-loss

echo "🌱 Seeding database with 7 days of attendance history..."
npx ts-node --transpile-only prisma/seed.ts

echo "✅ Dev environment is fresh and ready!"
echo "Run 'cd apps/api && pnpm dev' to start the server."
