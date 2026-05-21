#!/usr/bin/env bash
# Production entrypoint for the Scout runtime image.
#
# Applies Alembic migrations, then runs uvicorn (FastAPI on :8080) and the
# Next.js standalone server (:3000) side-by-side. Exits on the first failure
# so the container orchestrator can restart the unit.
#
# A reverse proxy in front of this image is expected to route /api/* to
# :8080 and everything else to :3000. That proxy is provisioned by M1-T05b
# (Fly.io) or whatever host we ultimately commit to.

set -euo pipefail

cd /app/apps/backend
echo "[scout] alembic upgrade head"
alembic upgrade head

echo "[scout] starting uvicorn on 0.0.0.0:8080"
uvicorn scout.main:app --host 0.0.0.0 --port 8080 &
backend_pid=$!

echo "[scout] starting next standalone on 0.0.0.0:3000"
cd /app/web
HOSTNAME=0.0.0.0 PORT=3000 node server.js &
web_pid=$!

# Forward INT/TERM so docker stop / orchestrator drains gracefully.
shutdown() {
  echo "[scout] received signal, stopping children"
  kill -TERM "${backend_pid}" "${web_pid}" 2>/dev/null || true
}
trap shutdown INT TERM

# Exit as soon as either process dies; the orchestrator will restart us.
wait -n
exit_code=$?
shutdown
wait "${backend_pid}" 2>/dev/null || true
wait "${web_pid}"     2>/dev/null || true
exit "${exit_code}"
