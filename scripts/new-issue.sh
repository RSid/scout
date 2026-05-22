#!/usr/bin/env bash
# Allocate the next scaffold ticket id for a milestone and create a GH issue,
# or print the proposed issue without creating (dry-run is the default).
#
# Prefer running this wrapper over inventing gh issue/create invocations; see
# the "Tool registry" in scripts/AGENTS.md.
#
# Usage:
#   scripts/new-issue.sh -m M1 -t T -T "Short subject line"
#   scripts/new-issue.sh --milestone M2 --type T --title "…" --label area:docs
#   scripts/new-issue.sh -m M1 -t F -T "Subject" --id M1-F04
#   scripts/new-issue.sh ... --dry-run                     # explicit (same as default)
#   scripts/new-issue.sh ... --yes                         # creates on GitHub
#   scripts/new-issue.sh ... --repo other/repo             # overrides RSid/scout
#
# Output: Prints title + body to stderr when dry-running. Requires gh auth
# for --yes. Mutates remote issue state only with --yes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PRD="$ROOT/docs/02-prd.md"

REPO="${REPO:-RSid/scout}"
MILESTONE=""
TYPE=""
SUBJECT=""
EXPLICIT_ID=""
DRY_RUN=1
LABELS=()

print_usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//' >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--milestone) MILESTONE="$2"; shift 2;;
    -t|--type)      TYPE="$2"; shift 2;;
    -T|--title)     SUBJECT="$2"; shift 2;;
    --id)           EXPLICIT_ID="$2"; shift 2;;
    --label)        LABELS+=("$2"); shift 2;;
    --repo)         REPO="$2"; shift 2;;
    --dry-run)      DRY_RUN=1; shift;;
    --yes)          DRY_RUN=0; shift;;
    -h|--help)      print_usage; exit 0;;
    *) echo "ERROR: unknown arg: $1" >&2; print_usage; exit 2;;
  esac
done

[[ -n "$MILESTONE" ]] || { echo "ERROR: --milestone is required" >&2; print_usage; exit 2; }
[[ "$MILESTONE" =~ ^M[123]$ ]] || { echo "ERROR: milestone must look like M1, M2, or M3 (got: $MILESTONE)" >&2; exit 2; }
[[ -n "$TYPE" ]] || { echo "ERROR: --type (-t) F or T is required" >&2; print_usage; exit 2; }
TYPE_LOWER="$(printf '%s' "$TYPE" | tr '[:upper:]' '[:lower:]')"
[[ "${TYPE_LOWER}" =~ ^[ft]$ ]] || { echo "ERROR: --type must be F or T (got: $TYPE)" >&2; print_usage; exit 2; }
TYPE_UPPER="$(printf '%s' "$TYPE_LOWER" | tr '[:lower:]' '[:upper:]')"
[[ -n "$SUBJECT" ]] || { echo "ERROR: --title / -T is required" >&2; print_usage; exit 2; }

if [[ "$TYPE_UPPER" == "F" ]]; then
  [[ -n "$EXPLICIT_ID" ]] || { echo "ERROR: --type F requires --id (e.g. --id M1-F04)" >&2; exit 2; }
  TICKET_ID="$(printf '%s' "$EXPLICIT_ID" | tr 'a-z' 'A-Z')"
  if [[ ! "$TICKET_ID" =~ ^${MILESTONE}-F[0-9]+[a-z]?$ ]]; then
    echo "ERROR: --id must match ${MILESTONE}-Fnn with optional single letter suffix (got: $EXPLICIT_ID)" >&2
    exit 2
  fi
else
  [[ -z "$EXPLICIT_ID" ]] || { echo "ERROR: --type T does not accept --id (next id is computed)" >&2; exit 2; }
fi

# Max numeric part after M{n}-T in titles / PRD (e.g. M1-T05a → 5, M1-T20 → 20).
max_t_index() {
  local milestone="$1"
  local text="$2"
  local max=0
  local match num
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    num="${match#*-T}"
    num="${num%%[!0-9]*}"
    [[ "$num" =~ ^[0-9]+$ ]] || continue
    if ((10#$num > max)); then
      max=$((10#$num))
    fi
  done < <(printf '%s' "$text" | grep -oiE "${milestone}-t[0-9]+[a-z]?" || true)
  printf '%s' "$max"
}

next_t_number() {
  local milestone="$1"
  local blob="" x t

  if command -v gh >/dev/null 2>&1 && gh auth status -h github.com >/dev/null 2>&1; then
    x="$(gh issue list --repo "$REPO" --milestone "$milestone" --state all --limit 1000 --json title -q '.[].title' 2>/dev/null || true)"
    blob="${blob}"$'\n'"${x}"
  fi

  if [[ -f "$PRD" ]]; then
    blob="${blob}"$'\n'"$(grep -oE "${milestone}-[Tt][0-9]+[a-z]?" "$PRD" 2>/dev/null || true)"
  fi

  t="$(max_t_index "$milestone" "$blob")"
  printf '%02d' "$((10#${t:-0} + 1))"
}

if [[ "$TYPE_UPPER" == "T" ]]; then
  n="$(next_t_number "$MILESTONE")"
  TICKET_ID="${MILESTONE}-T${n}"
fi

TITLE="${TICKET_ID} — ${SUBJECT}"

if [[ "$TYPE_UPPER" == "F" ]]; then
  BODY_TYPE_LABEL="feature (PRD id)"
elif [[ "$TYPE_UPPER" == "T" ]]; then
  BODY_TYPE_LABEL="scaffold / technical task"
else
  BODY_TYPE_LABEL=""
fi

BODY="$(cat <<EOF_BODY
> Type: ${BODY_TYPE_LABEL}. Milestone: ${MILESTONE}.
> Conventions: AGENTS.md "Commits and PRs"; cite ${TICKET_ID} in commits and PR titles.

## Context

-

## Acceptance criteria

-
EOF_BODY
)"

summarize_stderr() {
  printf '%s\n' "TITLE: ${TITLE}" "" "BODY:" "$BODY" >&2
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '%s\n' "Dry-run (--yes not passed); no GitHub mutation." >&2
  summarize_stderr
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh is not installed. See https://cli.github.com/." >&2
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "ERROR: gh not authenticated. Run: gh auth login" >&2
  exit 1
fi

GH_ARGS=( issue create --repo "$REPO" --title "$TITLE" --body "$BODY" --milestone "$MILESTONE" )
for lab in "${LABELS[@]}"; do
  GH_ARGS+=( --label "$lab" )
done

printf '%s\n' "Creating issue on ${REPO}..." >&2
gh "${GH_ARGS[@]}"
