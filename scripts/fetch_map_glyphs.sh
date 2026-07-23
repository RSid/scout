#!/usr/bin/env bash
# fetch_map_glyphs.sh — Self-host MapLibre SDF glyphs for basemap labels.
#
# Downloads the Latin PBF glyph ranges of "Noto Sans Regular" from the
# protomaps/basemaps-assets GitHub repo into
# `apps/web/public/fonts/glyphs/Noto Sans Regular/`. The basemap style
# (`apps/web/lib/map/basemap-style.ts`) points its `glyphs` key at the
# same-origin path `/fonts/glyphs/{fontstack}/{range}.pbf`, so labels render
# without ever touching a third-party CDN at runtime (NF-PRIV-01, DEC-018,
# DEC-028). Mirrors the fetch_fonts.sh pattern for Atkinson Hyperlegible.
#
# Only Latin + General Punctuation ranges are fetched: DC street names are
# English, and MapLibre silently skips any glyph range it cannot load, so a
# curated subset keeps the committed asset small.
#
# Usage:
#   scripts/fetch_map_glyphs.sh            # download missing ranges; skip existing
#   scripts/fetch_map_glyphs.sh --force    # re-download every range
#   scripts/fetch_map_glyphs.sh --help     # print this header
#
# Inputs:  network access to raw.githubusercontent.com.
# Outputs: apps/web/public/fonts/glyphs/Noto Sans Regular/{0-255,256-511,8192-8447}.pbf
#
# Idempotent: re-runs with all files present print "skipped: N" and exit 0.
#
# License: the glyphs are compiled from Noto Sans, distributed by
# protomaps/basemaps-assets under the SIL Open Font License v1.1. The license
# text is fetched alongside the glyphs. Free for self-hosted redistribution.

set -euo pipefail

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

case "${1:-}" in
  -h|--help) usage 0 ;;
esac

FORCE=0
case "${1:-}" in
  --force) FORCE=1 ;;
  "") ;;
  *) echo "fetch_map_glyphs.sh: unknown argument: $1" >&2; usage 2 ;;
esac

command -v curl >/dev/null 2>&1 || {
  echo "fetch_map_glyphs.sh: curl is not installed." >&2
  echo "Install curl or fetch the glyphs manually from" >&2
  echo "  https://github.com/protomaps/basemaps-assets/tree/main/fonts" >&2
  exit 1
}

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
fontstack="Noto Sans Regular"
target_dir="${repo_root}/apps/web/public/fonts/glyphs/${fontstack}"
mkdir -p "${target_dir}"

base_url="https://raw.githubusercontent.com/protomaps/basemaps-assets/main"
# URL-encoded fontstack directory ("Noto Sans Regular" -> "Noto%20Sans%20Regular").
glyph_dir="${base_url}/fonts/Noto%20Sans%20Regular"

ranges=(
  "0-255"      # Basic Latin + Latin-1 Supplement (covers "14th St NW")
  "256-511"    # Latin Extended-A
  "8192-8447"  # General Punctuation (en/em dashes, curly quotes)
)

downloaded=0
skipped=0
for r in "${ranges[@]}"; do
  out="${target_dir}/${r}.pbf"
  if [[ -f "${out}" && ${FORCE} -eq 0 ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "fetching ${r}.pbf..."
  curl -fsSL --connect-timeout 10 --max-time 60 -o "${out}.tmp" "${glyph_dir}/${r}.pbf"
  size=$(wc -c < "${out}.tmp" | tr -d ' ')
  if [[ "${size}" -lt 100 ]]; then
    rm -f "${out}.tmp"
    echo "fetch_map_glyphs.sh: ${r}.pbf downloaded but size ${size} B is implausibly small; aborting" >&2
    exit 1
  fi
  mv "${out}.tmp" "${out}"
  downloaded=$((downloaded + 1))
done

license_out="${repo_root}/apps/web/public/fonts/glyphs/OFL.txt"
if [[ ! -f "${license_out}" || ${FORCE} -eq 1 ]]; then
  curl -fsSL --connect-timeout 10 --max-time 30 -o "${license_out}" \
    "${base_url}/fonts/OFL.txt"
fi

echo "fetch_map_glyphs.sh: downloaded=${downloaded} skipped=${skipped} target=${target_dir}"
