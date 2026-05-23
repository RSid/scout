#!/usr/bin/env bash
# Append Scout ticket/decision identifiers from the current branch name to the
# first line of a commit message during `git commit` (interactive editor path).
#
# Skips `git commit -m`/`-t`/squash and merge commits so scripted flows stay
# unchanged. See scripts/AGENTS.md and AGENTS.md "Commits and PRs".
set -euo pipefail

MSG_FILE="${1:-}"
SOURCE="${2:-}"

if [[ -z "$MSG_FILE" ]] || [[ ! -f "$MSG_FILE" ]]; then
  exit 0
fi

src_lc="$(printf '%s' "$SOURCE" | tr '[:upper:]' '[:lower:]')"
case "$src_lc" in
  message | template | merge | squash | commit) exit 0 ;;
  *) ;;
esac

branch="$(git symbolic-ref --short -q HEAD 2>/dev/null || true)"
[[ -z "$branch" ]] && exit 0

id=""
id="$(printf '%s' "$branch" | grep -oiE '(m[0-9]+-[ft][0-9]+[a-z]?|dec-[0-9]+|oq-[0-9]+)' | head -n1 || true)"
[[ -z "$id" ]] && exit 0
id="$(printf '%s' "$id" | tr 'a-z' 'A-Z')"

if grep -qF "(${id})" "$MSG_FILE" 2>/dev/null; then
  exit 0
fi

tmp="$(mktemp)"
awk -v sid="$id" '
  BEGIN { done = 0 }
  !done && $0 !~ /^#/ && length($0) > 0 {
    sub(/[[:space:]]*$/, "")
    print $0 " (" sid ")"
    done = 1
    next
  }
  { print }
' "$MSG_FILE" >"$tmp"

mv "$tmp" "$MSG_FILE"
