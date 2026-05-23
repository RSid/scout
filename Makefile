# Thin dev orchestrator (DEC-011, M1-T15).

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
COMPOSE := $(ROOT)/infra/docker-compose.yml
# `--project-directory` aimed at repo root so Compose picks up the canonical
# `.env` (sibling of this Makefile) instead of looking inside `infra/`. That
# means SCOUT_DB_HOST_PORT et al. live in the same .env as backend settings.
COMPOSE_FLAGS := --project-directory "$(ROOT)" -f "$(COMPOSE)"

.DEFAULT_GOAL := help

.PHONY: help bootstrap sync dev test lint typecheck fmt format migrate ingest docker-up docker-down docker-reset-web-deps dev-mobile-lan dev-mobile-tunnel

help: ## print Make targets with short descriptions
	@grep -hE '^[a-zA-Z_-]+:.*?##' "$(ROOT)/Makefile" | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@printf '\033[36m%-16s\033[0m %s\n' 'fmt' 'alias of make format'

bootstrap: ## verify uv (+ pnpm) and print installer hints when missing
	@command -v uv >/dev/null 2>&1 || { printf '%s\n' 'Install uv: https://docs.astral.sh/uv/getting-started/installation/'; exit 1; }
	@if ! command -v pnpm >/dev/null 2>&1; then printf '%s\n' 'pnpm not on PATH yet (OK until apps/web/package.json lands). Install: https://pnpm.io/installation'; fi
	@test -f "$(ROOT)/apps/backend/pyproject.toml" || { echo 'expected apps/backend/pyproject.toml'; exit 1; }

sync: ## install Python deps for apps/backend (run from repo root)
	uv sync --directory "$(ROOT)/apps/backend"

dev: ## run full-stack dev via Compose
	@test -f "$(COMPOSE)" || { printf '%s\n' 'missing infra/docker-compose.yml (M1-T05a). After it lands: `make docker-up`.'; exit 1; }
	docker compose $(COMPOSE_FLAGS) up

test: ## run backend and frontend test suites when scaffolded
	@if [ -d "$(ROOT)/apps/backend/tests" ]; then \
		uv run --directory "$(ROOT)/apps/backend" pytest; \
	else \
		echo 'skipping backend tests: apps/backend/tests not scaffolded yet (M1-T01)'; \
	fi
	@if [ -f "$(ROOT)/apps/web/package.json" ]; then \
		cd "$(ROOT)/apps/web" && pnpm test; \
	else \
		echo 'skipping web tests: apps/web/package.json not scaffolded yet (M1-T02)'; \
	fi

lint: ## run ruff (backend) and pnpm lint (frontend) when present
	@if [ -d "$(ROOT)/apps/backend/scout" ]; then \
		cd "$(ROOT)/apps/backend" && uv run ruff check scout; \
		for f in "$(ROOT)/scripts/"*.py; do \
			if [ -f "$$f" ]; then \
				cd "$(ROOT)/apps/backend" && uv run ruff check "$$f"; \
			fi; \
		done; \
	else \
		echo 'skipping backend lint: apps/backend/scout not scaffolded yet (M1-T01)'; \
	fi
	@if [ -f "$(ROOT)/apps/web/package.json" ]; then \
		cd "$(ROOT)/apps/web" && pnpm lint; \
	else \
		echo 'skipping web lint: apps/web/package.json not scaffolded yet (M1-T02)'; \
	fi

typecheck: ## run mypy (backend) and pnpm typecheck (frontend) when present
	@if [ -d "$(ROOT)/apps/backend/scout" ]; then \
		uv run --directory "$(ROOT)/apps/backend" mypy scout; \
	else \
		echo 'skipping backend typecheck: apps/backend/scout not scaffolded yet (M1-T01)'; \
	fi
	@if [ -f "$(ROOT)/apps/web/package.json" ]; then \
		cd "$(ROOT)/apps/web" && pnpm typecheck; \
	else \
		echo 'skipping web typecheck: apps/web/package.json not scaffolded yet (M1-T02)'; \
	fi

format: ## run ruff format (backend) and frontend formatter when present
	@if [ -d "$(ROOT)/apps/backend/scout" ]; then \
		cd "$(ROOT)/apps/backend" && uv run ruff format scout; \
		for f in "$(ROOT)/scripts/"*.py; do \
			if [ -f "$$f" ]; then \
				cd "$(ROOT)/apps/backend" && uv run ruff format "$$f"; \
			fi; \
		done; \
	else \
		echo 'skipping backend format: apps/backend/scout not scaffolded yet (M1-T01)'; \
	fi
	@if [ -f "$(ROOT)/apps/web/package.json" ]; then \
		cd "$(ROOT)/apps/web" && pnpm format; \
	else \
		echo 'skipping web format: apps/web/package.json not scaffolded yet (M1-T02)'; \
	fi

fmt: format

migrate: ## run alembic upgrade head when backend scaffold is present
	@if [ -f "$(ROOT)/apps/backend/alembic.ini" ]; then \
		uv run --directory "$(ROOT)/apps/backend" alembic upgrade head; \
	else \
		echo 'skipping migrations: apps/backend/alembic.ini not present yet (M1-T01)'; \
	fi

ingest: ## dry-run DC ingest (scripts/ingest_dc.py) when present
	@if [ -f "$(ROOT)/scripts/ingest_dc.py" ]; then \
		uv run --directory "$(ROOT)/apps/backend" python "$(ROOT)/scripts/ingest_dc.py" --dry-run; \
	else \
		echo 'skipping ingest: scripts/ingest_dc.py not present yet (M1-F11 / M1-T03)'; \
	fi

docker-up: ## docker compose up (infra/docker-compose.yml)
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	docker compose $(COMPOSE_FLAGS) up

docker-up-interactive-map:
	docker compose --project-directory . -f infra/docker-compose.yml \
	run --rm --service-ports \
	-e NEXT_PUBLIC_SCOUT_MAP_MODE=interactive web

docker-down: ## docker compose down (infra/docker-compose.yml)
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	docker compose $(COMPOSE_FLAGS) down

docker-reset-web-deps: ## wipe web node_modules/.next volumes (pgdata untouched); use after deps change — then compose up --build
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	docker compose $(COMPOSE_FLAGS) stop web 2>/dev/null || true
	docker compose $(COMPOSE_FLAGS) rm -sf web 2>/dev/null || true
	docker volume rm -f scout_web-node_modules scout_web-next 2>/dev/null || true
	@printf '%s\n' 'Next: docker compose $(COMPOSE_FLAGS) up --build   (Rebuild web image when package*.json changed; volumes re-seed from the image.)'

dev-mobile-lan: ## Compose + overlay for LAN HTTP phone testing (`docker-compose.mobile.yml`); see infra/README.md
	@"$(ROOT)/scripts/dev-mobile-lan.sh"

dev-mobile-tunnel: ## detached Compose + cloudflared quick tunnel for HTTPS phone testing (geolocation/PWA parity)
	@"$(ROOT)/scripts/dev-mobile-tunnel.sh"
