#!/usr/bin/env sh
set -eu
version=${1:?usage: scripts/consume-ploeg-release.sh <Ploeg release version, such as 0.2.0-rc.28>}
cd "$(dirname "$0")/.."
mise trust --quiet mise.toml
mise install go uv helm node
mise exec node -- sh -c 'npm ci --prefix apps/unfold --no-audit --no-fund --loglevel=error && npx --prefix apps/unfold playwright install chromium' \
  || echo "Unfold's npm packages or Playwright's Chromium did not install; the pin pull request will carry a stale landscape explorer" >&2
mise exec go uv helm -- python3 scripts/ploeg-contract.py pin "${version#v}"
mise exec go uv node -- sh scripts/renovate-ploeg-docs.sh
