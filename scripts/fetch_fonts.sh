#!/usr/bin/env bash
# fetch_fonts.sh — Self-host Atkinson Hyperlegible for the frontend.
#
# Downloads the four Atkinson Hyperlegible woff2 weights from the upstream
# googlefonts/atkinson-hyperlegible GitHub repo into
# `apps/web/public/fonts/`. Self-hosting is required by NF-PRIV-01
# (no third-party CDNs).
#
# The frontend's @font-face declarations in
# `apps/web/design/tokens/typography.css` point at `/fonts/<file>.woff2`
# served from the Next.js `public/` root.
#
# Usage:
#   scripts/fetch_fonts.sh            # download missing files; skip existing
#   scripts/fetch_fonts.sh --force    # re-download every file
#   scripts/fetch_fonts.sh --help     # print this header
#
# Inputs:  network access to raw.githubusercontent.com.
# Outputs: apps/web/public/fonts/AtkinsonHyperlegible-{Regular,Bold,Italic,BoldItalic}.woff2
#
# Idempotent: re-runs with all files present print "skipped: 4" and exit 0.
#
# License: Atkinson Hyperlegible is © Braille Institute of America, distributed
# under the SIL Open Font License v1.1. The license text is fetched alongside
# the fonts. Free for self-hosted redistribution.

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
  *) echo "fetch_fonts.sh: unknown argument: $1" >&2; usage 2 ;;
esac

command -v curl >/dev/null 2>&1 || {
  echo "fetch_fonts.sh: curl is not installed." >&2
  echo "Install curl or fetch the fonts manually from" >&2
  echo "  https://github.com/googlefonts/atkinson-hyperlegible/tree/main/fonts/webfonts" >&2
  exit 1
}

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
target_dir="${repo_root}/apps/web/public/fonts"
mkdir -p "${target_dir}"

base_url="https://raw.githubusercontent.com/googlefonts/atkinson-hyperlegible/main"
font_dir="${base_url}/fonts/webfonts"

files=(
  "AtkinsonHyperlegible-Regular.woff2"
  "AtkinsonHyperlegible-Bold.woff2"
  "AtkinsonHyperlegible-Italic.woff2"
  "AtkinsonHyperlegible-BoldItalic.woff2"
)

downloaded=0
skipped=0
for f in "${files[@]}"; do
  out="${target_dir}/${f}"
  if [[ -f "${out}" && ${FORCE} -eq 0 ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "fetching ${f}..."
  curl -fsSL --connect-timeout 10 --max-time 60 -o "${out}.tmp" "${font_dir}/${f}"
  size=$(wc -c < "${out}.tmp" | tr -d ' ')
  if [[ "${size}" -lt 10000 ]]; then
    rm -f "${out}.tmp"
    echo "fetch_fonts.sh: ${f} downloaded but size ${size} B is implausibly small; aborting" >&2
    exit 1
  fi
  mv "${out}.tmp" "${out}"
  downloaded=$((downloaded + 1))
done

license_out="${target_dir}/OFL.txt"
if [[ ! -f "${license_out}" || ${FORCE} -eq 1 ]]; then
  curl -fsSL --connect-timeout 10 --max-time 30 -o "${license_out}" "${base_url}/OFL.txt"
fi

echo "fetch_fonts.sh: downloaded=${downloaded} skipped=${skipped} target=${target_dir}"
