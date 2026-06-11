#!/usr/bin/env bash
# Start Scout dev stack with same-origin `/api/*` proxies for LAN phone testing.
#
# Usage:
#   scripts/dev-mobile-lan.sh
#
# Prerequisites: Docker, same Wi-Fi on phone + laptop (for HTTP LAN flow).
#
# Outputs: Prints http://<LAN_IP>:<port> plus an ASCII QR if `qrencode` exists.
#
# Notes: Plain HTTP means Geolocation API + “Add to Home Screen” expectations
# from the PRD may not behave like production — use scripts/dev-mobile-tunnel.sh for HTTPS.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${SCOUT_WEB_HOST_PORT:-3000}"
COMPOSE_BASE="${ROOT}/infra/docker-compose.yml"
COMPOSE_MOBILE="${ROOT}/infra/docker-compose.mobile.yml"

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

detect_lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    local iface ip
    for iface in en0 en1 en2; do
      ip="$(ipconfig getifaddr "${iface}" 2>/dev/null || true)"
      if [[ -n "${ip}" ]]; then
        echo "${ip}"
        return 0
      fi
    done
  fi
  if [[ "$(uname -s)" == Linux ]]; then
    local ip_li
    ip_li="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [[ -n "${ip_li}" ]]; then
      echo "${ip_li}"
      return 0
    fi
  fi
  echo "unknown"
}

LAN_IP="$(detect_lan_ip)"
if [[ "${LAN_IP}" == "unknown" ]]; then
  echo "WARNING: Could not infer LAN IP automatically; browse to http://<your-host-LAN-ip>:${WEB_PORT}" >&2
else
  URL="http://${LAN_IP}:${WEB_PORT}"
  printf '\n%s\n' "Phone (same Wi-Fi): ${URL}"
  if command -v qrencode >/dev/null 2>&1; then
    qrencode -t ansiutf8 "${URL}"
  fi
fi

docker compose \
  --project-directory "${ROOT}" \
  -f "${COMPOSE_BASE}" \
  -f "${COMPOSE_MOBILE}" \
  up
