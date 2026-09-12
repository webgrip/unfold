#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
fail=0

note() { printf '  %s\n' "$1"; fail=1; }

echo "ADR-0020 — name and mark"

[ -f docs/brand/TRADEMARK.md ] \
  || note "missing docs/brand/TRADEMARK.md — the policy IS the grant; without it the mark has no stated terms"

stray="$(find docs/brand -maxdepth 1 -type f \( -iname 'LICENSE*' -o -iname 'COPYING*' \) 2>/dev/null || true)"
[ -z "$stray" ] \
  || note "second copyright answer under docs/brand/: ${stray//$'\n'/, } — ADR-0020 keeps the assets under the root Apache-2.0"

grep -q 'docs/brand/TRADEMARK.md' README.md \
  || note "README.md no longer links docs/brand/TRADEMARK.md — an unreachable policy is not a policy"

if [ "$fail" -ne 0 ]; then
  echo "FAIL — see docs/adrs/0020-the-name-and-mark-are-trademarks.md"
  exit 1
fi
echo "ok"
