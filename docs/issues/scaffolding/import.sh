#!/usr/bin/env bash
# Mass-import scaffolding issues from Markdown files next to this script.
#
# Usage:
#   REPO=owner/repo ./import.sh
#   DRY_RUN=1 ./import.sh
#
# Idempotent: re-runs skip existing labels & milestone.
# Verbose by design — every gh call prints to stderr so failures point at a line.
set -euo pipefail

REPO="${REPO:-RSid/scout}"
MILESTONE_TITLE="${MILESTONE_TITLE:-M1}"
DRY_RUN="${DRY_RUN:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh is not installed. Install GitHub CLI or copy bodies manually." >&2
  exit 1
fi

if [[ "$DRY_RUN" != "1" ]] && ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "ERROR: gh not logged in. Run: gh auth login" >&2
  exit 1
fi

if [[ "$DRY_RUN" != "1" ]] && ! gh repo view "$REPO" --json nameWithOwner >/dev/null 2>&1; then
  echo "ERROR: cannot see repo '$REPO' as the authenticated gh user." >&2
  echo "       Set REPO=owner/repo to override. Current account:" >&2
  gh auth status -h github.com 2>&1 | sed 's/^/         /' >&2
  exit 1
fi

# ---- helpers ----------------------------------------------------------------

_extract_title() {
  awk -F'"' '/^title:/{ print $2; exit }' "$1"
}

_extract_labels_csv() {
  # Frontmatter shape: labels: ["a", "b", "good first issue"]
  awk '
    /^labels:/ {
      line = $0
      sub(/^labels:[[:space:]]*\[/, "", line)
      sub(/\][[:space:]]*$/, "", line)
      gsub(/"/, "", line)
      gsub(/[[:space:]]*,[[:space:]]*/, ",", line)
      print line
      exit
    }
  ' "$1"
}

_extract_body() {
  # Body = content after closing frontmatter ---
  awk '
    /^---$/ { d++; next }
    d < 2 { next }
    { print }
  ' "$1"
}

_ensure_label() {
  local name="$1" color="$2" desc="${3:-}"
  echo "  label: $name ($color)" >&2
  if [[ -n "$desc" ]]; then
    gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null
  else
    gh label create "$name" --repo "$REPO" --color "$color" --force >/dev/null
  fi
}

# ---- pre-flight: labels & milestone -----------------------------------------

if [[ "$DRY_RUN" != "1" ]]; then
  echo "==> Ensuring GitHub labels on $REPO" >&2
  _ensure_label "scaffold"          "6e7681" "Technical scaffolding / prereq work"
  _ensure_label "area:backend"      "0e8a16"
  _ensure_label "area:frontend"     "1f6feb"
  _ensure_label "area:infra"        "5319e7"
  _ensure_label "area:data"         "b08800"
  _ensure_label "area:design"       "d4368a"
  _ensure_label "area:docs"         "0366d6"
  _ensure_label "area:security"     "b60205"
  _ensure_label "area:ci"           "795548"
  _ensure_label "area:meta"         "bbbbbb"
  _ensure_label "size:S"            "c2e0c6"
  _ensure_label "size:M"            "fef2c0"
  _ensure_label "size:L"            "f9d0c4"
  _ensure_label "good first issue"  "7057ff"

  echo "==> Ensuring milestone: $MILESTONE_TITLE" >&2
  existing_milestones="$(gh api "repos/${REPO}/milestones?state=all" --paginate --jq '.[].title' 2>/dev/null || true)"
  if ! grep -qx "$MILESTONE_TITLE" <<<"$existing_milestones"; then
    gh api "repos/${REPO}/milestones" -f title="$MILESTONE_TITLE" >/dev/null
    echo "  created milestone '$MILESTONE_TITLE'" >&2
  else
    echo "  milestone '$MILESTONE_TITLE' already exists" >&2
  fi
else
  echo "DRY_RUN=1 — skipping label/milestone creation" >&2
fi

# ---- collect & validate issue files -----------------------------------------

shopt -s nullglob
mapfile -t ISSUE_FILES < <(find "$SCRIPT_DIR" -maxdepth 1 -type f -name 'M1-[TF]*.md' | sort)

if [[ "${#ISSUE_FILES[@]}" -eq 0 ]]; then
  echo "ERROR: no M1-[TF]*.md files in $SCRIPT_DIR" >&2
  exit 1
fi

echo "==> Creating ${#ISSUE_FILES[@]} issues on $REPO" >&2

# ---- pre-existing issue index (skip duplicates by title) --------------------

declare -A EXISTING_TITLES=()
if [[ "$DRY_RUN" != "1" ]]; then
  while IFS=$'\t' read -r _num title _state; do
    [[ -z "$title" ]] && continue
    EXISTING_TITLES["$title"]=1
  done < <(gh issue list --repo "$REPO" --state all --limit 500 --json number,title,state \
            --jq '.[] | [.number, .title, .state] | @tsv' 2>/dev/null || true)
fi

# ---- create issues ----------------------------------------------------------

for f in "${ISSUE_FILES[@]}"; do
  title="$(_extract_title "$f")"
  labels_csv="$(_extract_labels_csv "$f")"
  body="$(_extract_body "$f")"

  if [[ -z "$title" ]]; then
    echo "  SKIP (no title in frontmatter): $f" >&2
    continue
  fi

  echo " --> $title" >&2

  if [[ "$DRY_RUN" == "1" ]]; then
    continue
  fi

  if [[ -n "${EXISTING_TITLES[$title]:-}" ]]; then
    echo "     (already exists, skipping)" >&2
    continue
  fi

  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --milestone "$MILESTONE_TITLE" \
    --label "$labels_csv"
done

echo "Done." >&2
