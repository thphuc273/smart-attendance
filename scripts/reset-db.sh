#!/bin/bash
set -e

echo "🛑 Stopping and removing containers..."
docker compose down -v

echo "🚀 Starting Postgres and Redis..."
docker compose up postgres redis -d

echo "⏳ Waiting for Postgres to be ready..."
sleep 3

cd apps/api

echo "🧹 Resetting database & applying migrations..."
npx prisma migrate reset --force

echo "🌱 Seeding database with 7 days of attendance history..."
npx ts-node --transpile-only prisma/seed.ts

echo "✅ Dev environment is fresh and ready!"
echo "Run 'cd apps/api && pnpm dev' to start the server."
