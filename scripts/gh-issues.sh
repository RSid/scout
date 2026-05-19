#!/usr/bin/env bash
# List GitHub issues for the Scout repo, optionally filtered by milestone.
#
# This is the canonical, deterministic way for agents and humans to fetch
# issue metadata in this repo. Prefer running this script over
# re-implementing the underlying `gh issue list` invocation; see the
# "Tool registry" in scripts/AGENTS.md.
#
# Usage:
#   scripts/gh-issues.sh                          # all issues, JSON
#   scripts/gh-issues.sh -m M1                    # only the M1 milestone
#   scripts/gh-issues.sh --milestone M1 --state open
#   scripts/gh-issues.sh --format table
#   scripts/gh-issues.sh --limit 50 --repo other/repo
#
# Output: JSON array on stdout (default) or `gh`'s table format. Logs to
# stderr. Read-only and idempotent — safe to re-run.
set -euo pipefail

REPO="${REPO:-RSid/scout}"
STATE="all"
MILESTONE=""
FORMAT="json"
LIMIT=1000
FIELDS="number,title,state,milestone,labels,assignees,url,createdAt,updatedAt,closedAt"

print_usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--milestone) MILESTONE="$2"; shift 2;;
    --state)        STATE="$2";     shift 2;;
    --format)       FORMAT="$2";    shift 2;;
    --limit)        LIMIT="$2";     shift 2;;
    --repo)         REPO="$2";      shift 2;;
    -h|--help)      print_usage; exit 0;;
    *) echo "ERROR: unknown arg: $1" >&2; print_usage; exit 2;;
  esac
done

case "$STATE" in
  open|closed|all) ;;
  *) echo "ERROR: --state must be one of: open, closed, all (got: $STATE)" >&2; exit 2;;
esac

case "$FORMAT" in
  json|table) ;;
  *) echo "ERROR: --format must be one of: json, table (got: $FORMAT)" >&2; exit 2;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh is not installed. See https://cli.github.com/." >&2
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "ERROR: gh not authenticated. Run: gh auth login" >&2
  exit 1
fi

args=( --repo "$REPO" --state "$STATE" --limit "$LIMIT" )
[[ -n "$MILESTONE" ]] && args+=( --milestone "$MILESTONE" )

case "$FORMAT" in
  json)  gh issue list "${args[@]}" --json "$FIELDS" ;;
  table) gh issue list "${args[@]}" ;;
esac
