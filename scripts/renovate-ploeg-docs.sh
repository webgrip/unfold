#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v uv >/dev/null 2>&1 || install-tool uv
uv run --frozen python scripts/docs.py --domain
uv run --frozen python scripts/docs-decisions.py
