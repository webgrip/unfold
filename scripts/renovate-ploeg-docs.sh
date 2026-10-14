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
  if command -v node >/dev/null 2>&1 && node apps/unfold/scripts/build-landscape.mjs >/dev/null 2>"$output"; then
    exit 0
  fi
  {
    echo "The landscape explorer embeds the glossary and was not rebuilt here: it needs Node, Unfold's npm packages and Playwright's Chromium."
    echo "The ploeg-docs check reports it as a stale landscape. Run mise run landscape on this branch and push."
    tail -n 3 "$output"
  } >&2
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
