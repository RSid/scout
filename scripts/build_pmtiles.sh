#!/usr/bin/env bash
# build_pmtiles.sh — Extract a District of Columbia subset from daily Protomaps basemaps.
#
# Outputs `apps/web/public/tiles/dc.pmtiles` (or an explicit path argument) suitable
# for MapLibre + pmtiles:// same-origin tiles (DEC-002, PRD NF-PERF-05).
#
# Requires the Protomaps `pmtiles` CLI (go-pmtiles) on PATH.
# Install: download from https://github.com/protomaps/go-pmtiles/releases
#
# Usage:
#   scripts/build_pmtiles.sh                # skip if artifact exists unless --force
#   scripts/build_pmtiles.sh /out/dc.pmtiles [--force]
#   scripts/build_pmtiles.sh --force        # overwrite default target
#   scripts/build_pmtiles.sh --help         # print this header
#
# Environment:
#   SCOUT_PROTOMAPS_BUILD_DATE — YYYYMMDD slug for https://build.protomaps.com/YYYYMMDD.pmtiles
#     (pinned in Dockerfile ARG for reproducibility; bump when old builds expire).
#
# Inputs: HTTPS range requests against build.protomaps.com (during extract).
# Outputs: single .pmtiles file (atomic rename from .tmp).
#
# Idempotent: re-run with artifact present skips unless --force.
#
# License: extractor output derives from © OpenStreetMap contributors (ODbL); follow
# Protomaps + OSM attribution in the rendered map UI.

set -euo pipefail

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

FORCE=0
OUTPUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help) usage 0 ;;
    --force)
      FORCE=1
      shift
      ;;
    -*)
      echo "build_pmtiles.sh: unknown option: $1" >&2
      usage 2
      ;;
    *)
      if [[ -n "${OUTPUT}" ]]; then
        echo "build_pmtiles.sh: too many arguments (expected zero or one output path)." >&2
        usage 2
      fi
      OUTPUT="$1"
      shift
      ;;
  esac
done

command -v pmtiles >/dev/null 2>&1 || {
  echo "build_pmtiles.sh: \`pmtiles\` CLI not found." >&2
  echo "Install from https://github.com/protomaps/go-pmtiles/releases" >&2
  exit 1
}

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
default_target="${repo_root}/apps/web/public/tiles/dc.pmtiles"
OUTPUT="${OUTPUT:-$default_target}"
mkdir -p "$(dirname "${OUTPUT}")"

if [[ ${FORCE} -eq 0 && -s "${OUTPUT}" ]]; then
  echo "build_pmtiles.sh: built=0 skipped=1 target=${OUTPUT}"
  exit 0
fi

PROTOMAPS_BUILD_DATE="${SCOUT_PROTOMAPS_BUILD_DATE:-20260521}"
PROTOMAPS_URL="https://build.protomaps.com/${PROTOMAPS_BUILD_DATE}.pmtiles"
# Washington, DC — min_lon,min_lat,max_lon,max_lat
BBOX="${SCOUT_PMTILES_BBOX:--77.1198,38.7916,-76.9094,38.9956}"
MAX_ZOOM="${SCOUT_PMTILES_MAX_ZOOM:-15}"

tmp="${OUTPUT}.tmp"
rm -f "${tmp}"

echo "build_pmtiles.sh: extracting bbox=${BBOX} maxzoom=${MAX_ZOOM} source=${PROTOMAPS_URL}"

pmtiles extract "${PROTOMAPS_URL}" "${tmp}" \
  --bbox="${BBOX}" \
  --maxzoom="${MAX_ZOOM}" \
  --download-threads="${SCOUT_PMTILES_DOWNLOAD_THREADS:-4}"

mv -f "${tmp}" "${OUTPUT}"
echo "build_pmtiles.sh: built=1 skipped=0 target=${OUTPUT}"
