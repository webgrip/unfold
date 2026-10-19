#!/usr/bin/env sh
set -eu
version=${1:?usage: scripts/consume-ploeg-release.sh <Ploeg release version, such as 0.2.0-rc.28>}
cd "$(dirname "$0")/.."
mise trust --quiet mise.toml
mise install go uv helm
mise exec go uv helm -- python3 scripts/ploeg-contract.py pin "${version#v}"
mise exec go uv -- sh scripts/renovate-ploeg-docs.sh
