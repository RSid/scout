#!/usr/bin/env bash
set -euo pipefail

bump="${1:-patch}"
latest=$(git tag -l 'v*' --sort=-v:refname | head -1)

if [ -z "$latest" ]; then
  echo "v0.1.0"
  exit 0
fi

major=$(echo "$latest" | sed 's/^v//' | cut -d. -f1)
minor=$(echo "$latest" | sed 's/^v//' | cut -d. -f2)
patch=$(echo "$latest" | sed 's/^v//' | cut -d. -f3)

case "$bump" in
  major) echo "v$(( major + 1 )).0.0" ;;
  minor) echo "v${major}.$(( minor + 1 )).0" ;;
  *)     echo "v${major}.${minor}.$(( patch + 1 ))" ;;
esac
