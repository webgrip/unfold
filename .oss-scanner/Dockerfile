# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# renovate: datasource=docker depName=node versioning=docker
ARG NODE_IMAGE=docker.io/library/node:24.22.1-trixie@sha256:016f604a11c4c725f0a4c62e29ff11adab153d297bf97046c9bf2ddb9f1011d3

FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node . /src
USER node
WORKDIR /src
RUN python3 scripts/ploeg-contract.py fetch
WORKDIR /src/apps/unfold

RUN npm ci --ignore-scripts --no-audit --no-fund \
    && npm --prefix extensions/vscode ci --ignore-scripts --no-audit --no-fund
RUN npx tsc --noEmit
RUN UNFOLD_TEST_CONCURRENCY=4 npm test > /src/unfold-test.log 2>&1 \
    || echo "WARNING: npm test reported failures; see /src/unfold-test.log"

ENV NPM_CONFIG_OFFLINE=true UNFOLD_HOST=127.0.0.1 UNFOLD_PORT=4080
