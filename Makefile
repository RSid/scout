# Thin dev orchestrator (DEC-011, M1-T15).

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
COMPOSE := $(ROOT)/infra/docker-compose.yml
# `--project-directory` aimed at repo root so Compose picks up the canonical
# `.env` (sibling of this Makefile) instead of looking inside `infra/`. That
# means SCOUT_DB_HOST_PORT et al. live in the same .env as backend settings.
COMPOSE_FLAGS := --project-directory "$(ROOT)" -f "$(COMPOSE)"

.DEFAULT_GOAL := help

.PHONY: help bootstrap sync dev test lint typecheck fmt format migrate ingest ingest-write ingest-dc-addresses ingest-dc-pois docker-up docker-up-stubbed-run docker-up-realistic-run docker-down docker-reset-web-deps docker-reset-backend-deps  dev-mobile-lan dev-mobile-tunnel

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

ingest-dc-addresses: ## load bundled DC MAR addresses into Postgres (migration 0002 + data/dc_addresses.jsonl)
	@test -f "$(ROOT)/scripts/ingest_dc_addresses.py" || { echo 'missing scripts/ingest_dc_addresses.py'; exit 1; }
	@# Runs inside the Compose bridge network so `db:5432` resolves and the
	@# host-side .env / SCOUT_DB_HOST_PORT remap never enter the picture.
	@# Pass extra args after `--`, e.g. `make ingest-dc-addresses ARGS='--dry-run'`.
	docker compose $(COMPOSE_FLAGS) --profile ingest run --rm ingest $(ARGS)

ingest-dc-pois: ## load bundled DC MAR points-of-interest into Postgres (migration 0003 + data/dc_points_of_interest.jsonl); run ingest-dc-addresses first
	@test -f "$(ROOT)/scripts/ingest_dc_points_of_interest.py" || { echo 'missing scripts/ingest_dc_points_of_interest.py'; exit 1; }
	@# Same Compose-network rationale as ingest-dc-addresses; this ingest
	@# depends on dc_addresses already being populated (it joins by MAR_ID).
	docker compose $(COMPOSE_FLAGS) --profile ingest run --rm ingest-poi $(ARGS)

ingest: ## dry-run DC GeoJSON ingest tally (parses files; no Postgres write)
	@if [ -f "$(ROOT)/scripts/ingest_dc.py" ]; then \
		PYTHONPATH="$(ROOT)/apps/backend" uv run --directory "$(ROOT)/apps/backend" python "$(ROOT)/scripts/ingest_dc.py" --dry-run; \
	else \
		echo 'skipping ingest: scripts/ingest_dc.py not present yet (M1-F11 / M1-T03)'; \
	fi

ingest-write: ## UPSERT DC GeoJSON (+ optional OSM amenities) into PostGIS features
	@test -f "$(ROOT)/scripts/ingest_dc.py" || { echo 'missing scripts/ingest_dc.py'; exit 1; }
	PYTHONPATH="$(ROOT)/apps/backend" uv run --directory "$(ROOT)/apps/backend" python "$(ROOT)/scripts/ingest_dc.py"

docker-up: ## docker compose up — all third parties stubbed (alias: docker-up-stubbed-run)
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	docker compose $(COMPOSE_FLAGS) up

docker-up-stubbed-run: docker-up ## alias of docker-up — boots stack with stub providers (no outbound calls)

# NOTE (MAR geocoding, DEC-023): the realistic stack keeps geocoding on the
# bundled District of Columbia MAR snapshot (`dc_addresses` in Postgres —
# hydrated with `make ingest-dc-addresses` whenever you recreate the pgdata volume).
#
# ORS / Refuge integrations still hit upstream services per this overlay — see
# `infra/docker-compose.realistic.yml`. When adding a net-new vendor adapter,
# extend that overlay first (scripts/AGENTS.md Tool registry reminder).
docker-up-realistic-run: ## docker compose up with real ORS/Refuge + MAR-backed autocomplete
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	@test -f "$(ROOT)/infra/docker-compose.realistic.yml" || { echo 'missing infra/docker-compose.realistic.yml'; exit 1; }
	@test -f "$(ROOT)/apps/web/public/tiles/dc.pmtiles" || printf '%s\n' 'note: apps/web/public/tiles/dc.pmtiles is missing — the interactive basemap will render empty until you run scripts/build_pmtiles.sh.'
	docker compose $(COMPOSE_FLAGS) -f "$(ROOT)/infra/docker-compose.realistic.yml" up

docker-down: ## docker compose down (infra/docker-compose.yml)
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	docker compose $(COMPOSE_FLAGS) down

docker-reset-web-deps: ## wipe web node_modules/.next volumes (pgdata untouched); use after deps change — then compose up --build
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	docker compose $(COMPOSE_FLAGS) stop web 2>/dev/null || true
	docker compose $(COMPOSE_FLAGS) rm -sf web 2>/dev/null || true
	docker volume rm -f scout_web-node_modules scout_web-next 2>/dev/null || true
	@printf '%s\n' 'Next: docker compose $(COMPOSE_FLAGS) up --build   (Rebuild web image when package*.json changed; volumes re-seed from the image.)'

# Backend deps (slowapi, httpx, etc.) live in the image-baked /app/.venv,
# not a named volume — so the only way to refresh them is to drop the image
# and rebuild. Symptom that this is the target you want: container crash-loops
# with `ModuleNotFoundError` after a `uv add` / lockfile bump.
docker-reset-backend-deps: ## drop scout-backend:dev image so next up rebuilds /app/.venv; use after backend deps change
	@test -f "$(COMPOSE)" || { echo 'missing $(COMPOSE) (M1-T05a)'; exit 1; }
	docker compose $(COMPOSE_FLAGS) stop backend 2>/dev/null || true
	docker compose $(COMPOSE_FLAGS) rm -sf backend 2>/dev/null || true
	docker image rm -f scout-backend:dev 2>/dev/null || true
	@printf '%s\n' 'Next: docker compose $(COMPOSE_FLAGS) up --build   (Rebuilds scout-backend:dev so /app/.venv picks up new uv.lock entries.)'

dev-mobile-lan: ## Compose + overlay for LAN HTTP phone testing (`docker-compose.mobile.yml`); see infra/README.md
	@"$(ROOT)/scripts/dev-mobile-lan.sh"

dev-mobile-tunnel: ## detached Compose + cloudflared quick tunnel for HTTPS phone testing (geolocation/PWA parity)
	@"$(ROOT)/scripts/dev-mobile-tunnel.sh"
