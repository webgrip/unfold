#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v uv >/dev/null 2>&1 || install-tool uv
report=ploeg-glossary-conflicts.txt
output=$(mktemp)
trap 'rm -f "$output"' EXIT
rm -f "$report"
uv run --frozen python scripts/docs-decisions.py
if uv run --quiet --frozen python scripts/docs.py --domain 2>"$output"; then
  cat "$output" >&2
  exit 0
fi
{
  echo "Renovate moved the Ploeg pin, but the combined glossary cannot be generated from the new Ploeg domain model."
  echo "The decision register and Unfold's own domain pages were regenerated; docs/reference/glossary.md was not."
  echo "Resolve every problem below, run mise run domain, and delete this file. The ploeg-docs check stays red until then."
  echo "docs/operations/ci.md#the-ploeg-pin-pull-request describes the fix."
  echo
  cat "$output"
} >"$report"
cat "$report" >&2
