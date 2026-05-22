#!/usr/bin/env bash
# Open a GitHub draft PR with description pre-filled from Conventional-commit
# history and branch name. Dry-run shows the assembled body locally (no network).
#
# Prefer this wrapper when opening PRs; see the Tool registry in scripts/AGENTS.md.
#
# Usage:
#   scripts/gh-pr.sh                              # draft body to stdout (--dry-run)
#   scripts/gh-pr.sh --yes                        # gh pr create --draft (network)
#   scripts/gh-pr.sh --yes --ready                # open non-draft PR
#   scripts/gh-pr.sh --closes 47 --title 'feat(backend): foo (M1-F04)'
#   scripts/gh-pr.sh --base main -- ...           # extra gh pr create flags after --
#
# Output: Writes PR body markdown to stdout. With --dry-run prints the same plus
# a note on stderr about next steps (--yes omitted). Sentinel blocks in the
# template file should not be removed; see scripts/AGENTS.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$ROOT/.github/pull_request_template.md"

REPO="$(git -C "$ROOT" remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/]##; s#\.git$##')" || REPO=""
REPO="${REPO:-RSid/scout}"

DRY_RUN=1
USE_DRAFT=1
TITLE_OVERRIDE=""
CLOSES_IDS=()
BASE_REF="origin/main"
GH_EXTRA=()

print_usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//' >&2
}

extract_ids() {
  printf '%s\n' "$1" | grep -oiE '(M[0-9]+-[FT][0-9]+[a-z]?|DEC-[0-9]+|OQ-[0-9]+)' | tr 'a-z' 'A-Z'
}

uniq_sorted() {
  sort -u
}

branch_ticket_id() {
  local branch="$1"
  local id
  id="$(printf '%s' "$branch" | grep -oiE '(m[0-9]+-[ft][0-9]+[a-z]?|dec-[0-9]+|oq-[0-9]+)' | head -n1)"
  printf '%s' "$id" | tr 'a-z' 'A-Z'
}

collect_summary_bullets() {
  local base="$1"
  local branch="$2"
  local lines
  lines="$(git -C "$ROOT" log --no-merges "$base"..HEAD --format='%s' 2>/dev/null || true)"
  lines="$(printf '%s\n' "$lines" | sed '/^$/d' | uniq_sorted)"
  if [[ -z "$lines" ]] || [[ "$lines" =~ ^[[:space:]]*$ ]]; then
    printf -- '- `%s`\n' "$branch"
    return 0
  fi
  while IFS= read -r subj; do
    [[ -z "$subj" ]] && continue
    printf -- '- %s\n' "$subj"
  done <<< "$lines"
}

collect_ticket_section() {
  local base="$1"
  local branch="$2"
  local ids="" id cl any=0
  ids="$(extract_ids "$(git -C "$ROOT" log --no-merges "$base"..HEAD --format='%s%n%b')" )"
  id="$(branch_ticket_id "$branch")"
  [[ -n "$id" ]] && ids="${ids}"$'\n'"$id"
  ids="$(printf '%s\n' "$ids" | sed '/^$/d' | uniq_sorted)"
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    printf -- '- `%s`\n' "$id"
    any=1
  done <<< "$(printf '%s\n' "$ids")"
  for cl in "${CLOSES_IDS[@]}"; do
    printf -- '- Closes #%s\n' "$cl"
    any=1
  done
  [[ "$any" -eq 0 ]] && printf '%s\n' '-'
}

collect_decisions() {
  local base="$1"
  local blob d
  blob="$(git -C "$ROOT" log --no-merges "$base"..HEAD --format='%s%n%b' 2>/dev/null || true)"
  blob="${blob}"$'\n'"$(git -C "$ROOT" diff "$base"..HEAD --unified=0 2>/dev/null | grep '^\+' || true)"
  blob="$(grep -oiE 'DEC-[0-9]+' <<< "$blob" | tr 'a-z' 'A-Z' | uniq_sorted)"
  if [[ -z "$blob" ]]; then
    printf '%s\n' '-'
    return 0
  fi
  while IFS= read -r d; do
    [[ -z "$d" ]] && continue
    printf -- '- `%s`\n' "$d"
  done <<< "$blob"
}

collect_tests() {
  local base="$1"
  local f any=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    case "$f" in
      tests/*|*/tests/*) ;;
      *.test.tsx|*.test.ts|*.test.jsx|*.test.js)
        ;;
      *.spec.tsx|*.spec.ts|*.spec.js|*.spec.jsx) ;;
      *_test.py) ;;
      *) continue ;;
    esac
    printf -- '- `%s`\n' "$f"
    any=1
  done < <(git -C "$ROOT" diff --name-only --diff-filter=AM "$base"..HEAD 2>/dev/null || true)
  [[ "$any" -eq 0 ]] && printf '%s\n' '-'
}

collect_mocks() {
  local base="$1"
  local line tmpf
  tmpf="$(mktemp "${TMPDIR:-/tmp}/mocks-lines.XXXXXX")"
  while IFS= read -r line; do
    [[ "$line" =~ (#[[:space:]]*MOCK:|//[[:space:]]*MOCK:) ]] || continue
    line="${line#+}"
    line="${line#[[:space:]]}"
    printf '%s\n' "$line"
  done < <(git -C "$ROOT" diff "$base"..HEAD --unified=0 2>/dev/null | grep '^[+]' || true) \
    | uniq_sorted >"$tmpf"
  if [[ ! -s "$tmpf" ]]; then
    printf '%s\n' 'None'
  else
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      printf -- '- `%s`\n' "$line"
    done <"$tmpf"
  fi
  rm -f "$tmpf"
}

apply_prefill_tags() {
  local template="$1"
  local sum="$2"
  local tickets="$3"
  local dec="$4"
  local tests="$5"
  local mocks="$6"

  SUMFILE="$sum" TICKETS="$tickets" DECS="$dec" TESTS="$tests" MOCKS="$mocks" \
    awk '
    /^<!-- prefill:summary:start -->$/ {
      print
      while ((getline line < ENVIRON["SUMFILE"]) > 0) print line
      close(ENVIRON["SUMFILE"])
      skip_summ = 1
      next
    }
    skip_summ == 1 {
      if ($0 ~ /^<!-- prefill:summary:end -->$/) {
        skip_summ = 0
        print
      }
      next
    }
    /^<!-- prefill:tickets:start -->$/ {
      print
      while ((getline line < ENVIRON["TICKETS"]) > 0) print line
      close(ENVIRON["TICKETS"])
      skip_t = 1
      next
    }
    skip_t == 1 {
      if ($0 ~ /^<!-- prefill:tickets:end -->$/) {
        skip_t = 0
        print
      }
      next
    }
    /^<!-- prefill:decisions:start -->$/ {
      print
      while ((getline line < ENVIRON["DECS"]) > 0) print line
      close(ENVIRON["DECS"])
      skip_d = 1
      next
    }
    skip_d == 1 {
      if ($0 ~ /^<!-- prefill:decisions:end -->$/) {
        skip_d = 0
        print
      }
      next
    }
    /^<!-- prefill:tests:start -->$/ {
      print
      while ((getline line < ENVIRON["TESTS"]) > 0) print line
      close(ENVIRON["TESTS"])
      skip_test = 1
      next
    }
    skip_test == 1 {
      if ($0 ~ /^<!-- prefill:tests:end -->$/) {
        skip_test = 0
        print
      }
      next
    }
    /^<!-- prefill:mocks:start -->$/ {
      print
      while ((getline line < ENVIRON["MOCKS"]) > 0) print line
      close(ENVIRON["MOCKS"])
      skip_m = 1
      next
    }
    skip_m == 1 {
      if ($0 ~ /^<!-- prefill:mocks:end -->$/) {
        skip_m = 0
        print
      }
      next
    }
    { print }
  ' "$template"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=1; shift;;
    --yes)       DRY_RUN=0; shift;;
    --ready)     USE_DRAFT=0; shift;;
    --draft)     USE_DRAFT=1; shift;;
    --title|-t) TITLE_OVERRIDE="$2"; shift 2;;
    --closes)   CLOSES_IDS+=("$2"); shift 2;;
    --base)     BASE_REF="$2"; shift 2;;
    -h|--help)  print_usage; exit 0;;
    --)         shift; GH_EXTRA+=("$@"); break;;
    *) echo "ERROR: unknown arg: $1" >&2; print_usage; exit 2;;
  esac
done

if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: missing PR template at $TEMPLATE" >&2
  exit 1
fi

branch="$(git -C "$ROOT" branch --show-current 2>/dev/null || true)"
[[ -n "$branch" ]] || { echo "ERROR: not on a git branch" >&2; exit 1; }

if git -C "$ROOT" merge-base HEAD "$BASE_REF" >/dev/null 2>&1; then
  base="$(git -C "$ROOT" merge-base "$BASE_REF" HEAD)"
else
  echo "ERROR: cannot compute merge-base with $BASE_REF. Fetch remotes?" >&2
  exit 1
fi

tmp="$(mktemp -d "${TMPDIR:-/tmp}/gh-pr-fill.XXXXXX")"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

printf '%s\n' "$(collect_summary_bullets "$base" "$branch")" >"$tmp/summary"
printf '%s\n' "$(collect_ticket_section "$base" "$branch")" >"$tmp/tickets"
printf '%s\n' "$(collect_decisions "$base")" >"$tmp/decs"
printf '%s\n' "$(collect_tests "$base")" >"$tmp/tests"
printf '%s\n' "$(collect_mocks "$base")" >"$tmp/mocks"

BODY="$(apply_prefill_tags "$TEMPLATE" "$tmp/summary" "$tmp/tickets" "$tmp/decs" "$tmp/tests" "$tmp/mocks")"

if [[ -z "$TITLE_OVERRIDE" ]]; then
  TITLE_OVERRIDE="$(git -C "$ROOT" log --no-merges "$base"..HEAD --format='%s' -n 1 2>/dev/null || true)"
  if [[ -z "$TITLE_OVERRIDE" ]]; then
    TITLE_OVERRIDE="$(printf '%s' "$branch" | sed 's@/@:@g')"
  fi
fi

ticket="$(branch_ticket_id "$branch")"
if [[ -n "$ticket" ]] && [[ "$TITLE_OVERRIDE" != *"(${ticket})"* ]]; then
  TITLE_OVERRIDE="${TITLE_OVERRIDE} (${ticket})"
fi

printf '%s\n' "$BODY" >"$tmp/body.md"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '%s\n\n' "--- PR body (--yes to publish; default is draft)" >&2
  cat "$tmp/body.md"
  printf '\n%s\n' "--- Suggested PR title (--title to override):" >&2
  printf '%s\n\n' "$TITLE_OVERRIDE" >&2
  printf '%s\n' "Suggested: gh pr create --repo \"$REPO\" $( [[ "$USE_DRAFT" -eq 1 ]] && printf '%s ' '--draft' ) --title ... --body-file \"$tmp/body.md\" ${GH_EXTRA[*]}" >&2
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

PR_ARGS=( pr create --repo "$REPO" --title "$TITLE_OVERRIDE" --body-file "$tmp/body.md" )
[[ "$USE_DRAFT" -eq 1 ]] && PR_ARGS+=( --draft )

if [[ "${#GH_EXTRA[@]}" -gt 0 ]]; then
  PR_ARGS+=( "${GH_EXTRA[@]}" )
fi

gh "${PR_ARGS[@]}"
