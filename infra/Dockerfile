# Multi-stage build for Scout.
#
# Stages:
#   - deps-backend : install backend Python deps with uv (cached)
#   - builder-web  : build Next.js standalone bundle with npm
#   - builder-tiles: produce dc.pmtiles (placeholder until M1-F02 ships
#                    scripts/build_pmtiles.sh — swap the RUN line then)
#   - dev-backend  : Compose dev target; expects source bind-mounted at /app/backend
#   - dev-web      : Compose dev target; expects source bind-mounted at /app/web
#   - runtime      : production image — backend + Next standalone + tiles
#
# Build context: repo root (`docker build -f infra/Dockerfile .`).


# --------------------------------------------------------------------------
# deps-backend: install backend deps into /app/.venv via uv (cached).
#
# The repo is a uv workspace — root pyproject.toml + uv.lock define the
# environment for member `apps/backend`. We mirror that layout inside the
# image so `uv sync --frozen` picks up the canonical (workspace-root)
# lockfile, not the member directory.
# --------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS deps-backend

# uv version is the only uncommitted pin for this stage; keep it explicit so
# image rebuilds remain reproducible across machines / CI runs.
ENV UV_VERSION=0.5.18 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir "uv==${UV_VERSION}"

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY apps/backend/pyproject.toml ./apps/backend/
RUN uv sync --frozen --no-install-workspace


# --------------------------------------------------------------------------
# builder-web: install web deps + build Next.js standalone output.
# --------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder-web

WORKDIR /app/web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/web/ ./

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# --------------------------------------------------------------------------
# builder-tiles: produce /out/dc.pmtiles.
# Placeholder until scripts/build_pmtiles.sh lands with M1-F02. Swap the
# `RUN` line below to invoke the script and embed the real DC PMTiles file.
# --------------------------------------------------------------------------
FROM debian:bookworm-slim AS builder-tiles

WORKDIR /out
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && : > /out/dc.pmtiles


# --------------------------------------------------------------------------
# dev-backend: Compose dev target. The workspace venv at /app/.venv lives
# OUTSIDE the bind-mount path (/app/apps/backend) so it never gets
# shadowed by the host source mount.
#
# WATCHFILES_FORCE_POLLING handles macOS-host ⇄ linux-container inotify
# gaps so `--reload` fires on host edits.
# --------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS dev-backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/apps/backend \
    PATH="/app/.venv/bin:/usr/local/bin:/usr/bin:/bin" \
    WATCHFILES_FORCE_POLLING=true

WORKDIR /app/apps/backend

# Pull the populated workspace venv from deps-backend.
COPY --from=deps-backend /app/.venv /app/.venv

EXPOSE 8080

# uvicorn is on PATH via /app/.venv/bin; --reload watches the bind-mounted
# source at /app/apps/backend.
CMD ["uvicorn", "scout.main:app", \
     "--host", "0.0.0.0", "--port", "8080", "--reload"]


# --------------------------------------------------------------------------
# dev-web: Compose dev target. Source is bind-mounted; node_modules baked in
# so first-boot avoids a slow npm install on the host.
# --------------------------------------------------------------------------
FROM node:20-bookworm-slim AS dev-web

WORKDIR /app/web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund

ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]


# --------------------------------------------------------------------------
# runtime: production image (backend + Next standalone + tiles).
# Runs `alembic upgrade head` then starts uvicorn + Next via start.sh.
# --------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/apps/backend \
    PATH="/app/.venv/bin:/usr/local/bin:${PATH}" \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Node runtime needed for the Next.js standalone server. The NodeSource
# apt repo pulls ~200MB of recommended packages; the official tarball is
# ~50MB and reproducible by SHA. Major version pin matches the build stage.
ARG TARGETARCH
ENV NODE_VERSION=20.20.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && case "${TARGETARCH}" in \
        amd64) NODE_ARCH=x64;   NODE_SHA256=df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d ;; \
        arm64) NODE_ARCH=arm64; NODE_SHA256=73093db209e4e9e09dd7d15a47aeaab1b74833830df03efa5f942a1122c5fa71 ;; \
        *)     echo "unsupported TARGETARCH=${TARGETARCH}"; exit 1 ;; \
    esac \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz \
 && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
        --exclude='*.md' --exclude='LICENSE' --exclude='CHANGELOG.md' --exclude='include' \
 && rm /tmp/node.tar.xz \
 && apt-get purge -y --auto-remove curl xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 scout \
 && useradd  --system --uid 1001 --gid scout --home /app scout

WORKDIR /app

# `--chown` on every COPY avoids a final `chown -R /app` layer that would
# duplicate every file (~170MB on this stack). Workspace layout mirrors
# the repo so uv's workspace assumptions hold inside the image.
COPY --chown=scout:scout --from=deps-backend /app/.venv               /app/.venv
COPY --chown=scout:scout --from=deps-backend /app/pyproject.toml      /app/uv.lock /app/
COPY --chown=scout:scout --from=deps-backend /app/apps/backend/pyproject.toml /app/apps/backend/pyproject.toml
COPY --chown=scout:scout apps/backend/scout/                          /app/apps/backend/scout/
COPY --chown=scout:scout apps/backend/alembic/                        /app/apps/backend/alembic/
COPY --chown=scout:scout apps/backend/alembic.ini                     /app/apps/backend/

# Web: Next.js standalone bundle. The standalone server expects siblings:
#   server.js       <- next standalone
#   .next/static    <- hashed assets
#   public/         <- public assets (incl. /tiles/dc.pmtiles)
COPY --chown=scout:scout --from=builder-web /app/web/.next/standalone /app/web/
COPY --chown=scout:scout --from=builder-web /app/web/.next/static     /app/web/.next/static
COPY --chown=scout:scout --from=builder-web /app/web/public           /app/web/public

# Tiles: placeholder until M1-F02 ships the real builder script.
COPY --chown=scout:scout --from=builder-tiles /out/dc.pmtiles /app/web/public/tiles/dc.pmtiles

COPY --chown=scout:scout --chmod=0755 infra/start.sh /app/start.sh

USER scout

EXPOSE 8080 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3).status==200 else 1)"]

ENTRYPOINT ["/app/start.sh"]
