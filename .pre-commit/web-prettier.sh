#!/usr/bin/env bash
# Run Prettier on staged paths under apps/web/. Pre-commit passes paths from
# repo root (`apps/web/...`), so strip the prefix after changing cwd.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root/apps/web"

paths=()
for rel in "$@"; do
  paths+=("${rel#apps/web/}")
done

if (($# == 0)); then
  exit 0
fi

exec npx prettier --write --ignore-unknown -- "${paths[@]}"
