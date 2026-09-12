#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
docker run --rm --platform linux/amd64 --network none -v "$PWD:/repo" -w /repo \
  --entrypoint sh harbor.webgrip.dev/webgrip/techdocs-builder:1.6.0 -e -o pipefail -c '
    python3 scripts/docs.py --check --stage-only
    cp mkdocs.yml .build/mkdocs-original.yml
    trap "cp .build/mkdocs-original.yml mkdocs.yml" EXIT
    techdocs-cli generate --no-docker --source-dir . --output-dir .build/techdocs-site
    cp .build/mkdocs-original.yml mkdocs.yml
    python3 scripts/docs-output.py --site .build/techdocs-site
    zensical build --clean --strict
    python3 scripts/docs-output.py --site .build/site
    pagefind --site .build/site
    gitleaks dir .build/site --config /etc/gitleaks/docs.toml --no-banner --redact
  '
