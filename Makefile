# Smart Attendance — root Makefile
# Convenience targets over pnpm workspaces + docker compose.
# Run `make help` to list everything.

SHELL := /bin/bash
PNPM  := pnpm
API   := $(PNPM) --filter @sa/api
PORTAL:= $(PNPM) --filter @sa/portal
MOBILE:= $(PNPM) --filter @sa/mobile

.DEFAULT_GOAL := help
.PHONY: help install clean \
        dev dev-api dev-portal dev-mobile \
        build build-api build-portal \
        test test-api test-portal test-e2e \
        typecheck typecheck-api typecheck-portal typecheck-mobile \
        lint format \
        docker-up docker-down docker-logs docker-reset \
        db-migrate db-generate db-seed db-reset db-studio \
        mobile-prebuild mobile-ios mobile-android \
        logo verify

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ── setup ──────────────────────────────────────────────────────────────
install: ## Install all workspace dependencies
	$(PNPM) install

clean: ## Remove node_modules + build artifacts (keeps .env)
	find . -type d \( -name node_modules -o -name dist -o -name .next -o -name .expo \) -prune -exec rm -rf {} +

## ── dev servers ────────────────────────────────────────────────────────
dev-api: ## Run API (NestJS) in watch mode
	$(API) dev

dev-portal: ## Run portal (Next.js) dev server
	$(PORTAL) dev

dev-mobile: ## Run mobile (Expo) dev server
	$(MOBILE) start

dev: ## Run API + portal in parallel (mobile uses its own terminal)
	$(PNPM) -r --parallel --filter @sa/api --filter @sa/portal dev

## ── build ──────────────────────────────────────────────────────────────
build-api: ## Compile API to dist/
	$(API) build

build-portal: ## Build portal (standalone output)
	$(PORTAL) build

build: build-api build-portal ## Build API + portal

## ── quality gates ──────────────────────────────────────────────────────
test-api: ## Jest specs for API
	$(API) test

test-portal: ## Vitest/Jest for portal
	$(PORTAL) test

test-e2e: ## API e2e suite (needs docker-up)
	$(API) test:e2e

test: test-api test-portal ## Run all unit tests

typecheck-api:     ; $(API) typecheck
typecheck-portal:  ; $(PORTAL) typecheck
typecheck-mobile:  ; $(MOBILE) typecheck
typecheck: typecheck-api typecheck-portal typecheck-mobile ## tsc --noEmit across all workspaces

lint: ## Lint all workspaces
	$(PNPM) -r lint

format: ## Prettier write across repo
	$(PNPM) format

verify: typecheck lint test ## Full pre-push check (typecheck + lint + test)

## ── docker ─────────────────────────────────────────────────────────────
docker-up: ## Start Postgres + Redis + MinIO
	docker compose up -d

docker-down: ## Stop infra containers
	docker compose down

docker-logs: ## Tail infra logs
	docker compose logs -f

docker-reset: ## Nuke volumes and restart (DESTROYS DB DATA)
	docker compose down -v && docker compose up -d

## ── prisma / db ────────────────────────────────────────────────────────
db-generate: ## Prisma generate client
	$(API) prisma:generate

db-migrate: ## Apply pending migrations (dev)
	$(API) prisma:migrate

db-seed: ## Seed demo data
	$(API) prisma:seed

db-reset: ## Reset DB + reapply migrations + seed (DESTRUCTIVE)
	$(API) exec prisma migrate reset --force

db-studio: ## Open Prisma Studio
	$(API) exec prisma studio

## ── mobile native ──────────────────────────────────────────────────────
mobile-prebuild: ## Regenerate ios/ + android/ from app.json
	cd apps/mobile && npx expo prebuild --clean

mobile-ios: ## Run on iOS simulator (requires prebuild)
	cd apps/mobile && npx expo run:ios

mobile-android: ## Run on Android emulator (requires prebuild)
	cd apps/mobile && npx expo run:android

## ── assets ─────────────────────────────────────────────────────────────
logo: ## Sync finos-smart-attendance.png → portal + mobile asset slots
	cp finos-smart-attendance.png apps/portal/public/finos-logo.png
	cp finos-smart-attendance.png apps/mobile/assets/finos-logo.png
	@echo "logo synced → portal/public + mobile/assets"
