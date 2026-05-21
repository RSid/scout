#!/usr/bin/env bash
# Run ESLint with safe autofix only. Layout/stylistic rules stay with Prettier
# (--fix-type omits layout) so the two hooks do not churn the same lines.
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

exec npx eslint --fix --fix-type problem,suggestion -- "${paths[@]}"
