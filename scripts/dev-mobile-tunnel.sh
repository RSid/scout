#!/usr/bin/env bash
# Start Scout stack (detached) + cloudflared quick tunnel over the web dev port.
#
# Usage:
#   scripts/dev-mobile-tunnel.sh
#
# Prerequisites: Docker, cloudflared (brew install cloudflare/cloudflare/cloudflared).
#
# Prints the https://*.trycloudflare.com URL (+ QR if qrencode exists). On EXIT the
# script tears down Compose and stops cloudflared.
#
# SECURITY: exposes your local Next dev origin to whoever has the ephemeral URL —
# acceptable for deliberate dev QA; revoke by Ctrl+C here.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${SCOUT_WEB_HOST_PORT:-3000}"
COMPOSE_BASE="${ROOT}/infra/docker-compose.yml"
COMPOSE_MOBILE="${ROOT}/infra/docker-compose.mobile.yml"
COMPOSE=(docker compose --project-directory "${ROOT}" -f "${COMPOSE_BASE}" -f "${COMPOSE_MOBILE}")
LOG=""
CLOUD_PID=""

print_usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) print_usage; exit 0;;
    *) echo "ERROR: unknown arg: $1" >&2; print_usage; exit 2;;
  esac
done

if [[ ! -f "${COMPOSE_BASE}" ]] || [[ ! -f "${COMPOSE_MOBILE}" ]]; then
  echo "ERROR: missing Compose file(s) under ${ROOT}/infra" >&2
  exit 2
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  printf '%s\n' \
    "ERROR: cloudflared not found. Install: brew install cloudflare/cloudflare/cloudflared" \
    "(or https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)." >&2
  exit 2
fi

cleanup() {
  if [[ -n "${CLOUD_PID}" ]] && kill -0 "${CLOUD_PID}" 2>/dev/null; then
    kill "${CLOUD_PID}" 2>/dev/null || true
    wait "${CLOUD_PID}" 2>/dev/null || true
  fi
  rm -f "${LOG}"
  "${COMPOSE[@]}" down --remove-orphans || "${COMPOSE[@]}" down || true
}

trap cleanup EXIT

"${COMPOSE[@]}" up -d

printf '%s\n' "Waiting for web on http://127.0.0.1:${WEB_PORT}/ …"
attempt=1
until curl -sf --max-time 2 "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; do
  if [[ "${attempt}" -ge 120 ]]; then
    echo "ERROR: web server did not become ready within ~4 minutes." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 2
done

LOG="$(mktemp "${TMPDIR:-/tmp}/scout-cloudflared.XXXXXX")"
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:${WEB_PORT}" >"${LOG}" 2>&1 &
CLOUD_PID=$!

TUNNEL_URL=""
for ((i = 1; i <= 90; i++)); do
  TUNNEL_URL="$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "${LOG}" 2>/dev/null | head -1 || true)"
  if [[ -n "${TUNNEL_URL}" ]]; then
    break
  fi
  if ! kill -0 "${CLOUD_PID}" 2>/dev/null; then
    echo "ERROR: cloudflared exited before publishing a tunnel URL." >&2
    cat "${LOG}" >&2 || true
    exit 1
  fi
  sleep 1
done

if [[ -z "${TUNNEL_URL}" ]]; then
  echo "ERROR: timed out waiting for trycloudflare.com URL." >&2
  cat "${LOG}" >&2 || true
  exit 1
fi

printf '\n%s\n' "HTTPS tunnel URL: ${TUNNEL_URL}"
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ansiutf8 "${TUNNEL_URL}"
fi
printf '%s\n' '(Ctrl+C stops cloudflared and runs docker compose down.)'

wait "${CLOUD_PID}" || true
