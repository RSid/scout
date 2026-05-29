#!/usr/bin/env bash
# Production entrypoint for the Scout runtime image.
#
# Applies Alembic migrations, then runs three processes side-by-side:
#   - uvicorn  (FastAPI)            on loopback 127.0.0.1:8081
#   - Next.js  (standalone server)  on loopback 127.0.0.1:3000
#   - Caddy    (reverse proxy)      on the public ${PORT:-8080}
#
# Caddy routes /api/* to uvicorn and everything else to Next, so the image is
# self-contained behind a single public port and runs unchanged on any host
# (VPS, Cloud Run, Render, ...) — see DEC-025. TLS is terminated by whatever
# platform sits in front; we serve plain HTTP here.
#
# Exits on the first child failure so the orchestrator can restart the unit.

set -euo pipefail

cd /app/apps/backend
echo "[scout] alembic upgrade head"
alembic upgrade head

echo "[scout] starting uvicorn on 127.0.0.1:8081"
uvicorn scout.main:app --host 127.0.0.1 --port 8081 &
backend_pid=$!

echo "[scout] starting next standalone on 127.0.0.1:3000"
cd /app/web
HOSTNAME=127.0.0.1 PORT=3000 node server.js &
web_pid=$!

echo "[scout] starting caddy on 0.0.0.0:${PORT:-8080}"
caddy run --config /app/Caddyfile --adapter caddyfile &
proxy_pid=$!

# Forward INT/TERM so docker stop / orchestrator drains gracefully.
shutdown() {
  echo "[scout] received signal, stopping children"
  kill -TERM "${backend_pid}" "${web_pid}" "${proxy_pid}" 2>/dev/null || true
}
trap shutdown INT TERM

# Exit as soon as any process dies; the orchestrator will restart us.
wait -n
exit_code=$?
shutdown
wait "${backend_pid}" 2>/dev/null || true
wait "${web_pid}"     2>/dev/null || true
wait "${proxy_pid}"   2>/dev/null || true
exit "${exit_code}"
