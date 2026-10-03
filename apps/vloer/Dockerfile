# syntax=docker/dockerfile:1
ARG REGISTRY_DHI=harbor.webgrip.dev/dhi
# renovate: datasource=docker depName=dhi.io/node versioning=docker
ARG NODE_DEV_IMAGE=${REGISTRY_DHI}/node:24.21.0-alpine3.24-dev@sha256:0b0cc56ea256e9733ae8813e29a67816f4ce15379f5de6de72d088945f981332
# renovate: datasource=docker depName=dhi.io/node versioning=docker
ARG NODE_RUNTIME_IMAGE=${REGISTRY_DHI}/node:24.21.0-alpine3.24@sha256:732e532a85421f18219acffc899b0c41b2376d8f9ac47cf2d9e1ad35e014a957

FROM ${NODE_DEV_IMAGE} AS stage
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY examples ./examples
COPY scripts ./scripts
RUN install -d -o node -g node -m 0700 /data && chown -R node:node /app

FROM ${NODE_RUNTIME_IMAGE} AS app
ARG IMAGE_CREATED=1970-01-01T00:00:00Z
ARG IMAGE_VERSION=dev
ARG IMAGE_REVISION=unknown
COPY --from=stage --chown=node:node /app /app
COPY --from=stage --chown=node:node /data /data
WORKDIR /app
ENV VLOER_HOST=0.0.0.0 VLOER_PORT=4080 VLOER_DATA_DIR=/data
EXPOSE 4080
USER node
LABEL org.opencontainers.image.title="De Vloer" \
    org.opencontainers.image.description="Operator workbench control plane: shell-less hardened Node runtime with no package manager; agent work runs in separate workspaces." \
    org.opencontainers.image.source="https://github.com/webgrip/unfold" \
    org.opencontainers.image.vendor="WebGrip" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.created="${IMAGE_CREATED}" \
    org.opencontainers.image.version="${IMAGE_VERSION}" \
    org.opencontainers.image.revision="${IMAGE_REVISION}"
CMD ["node", "src/main.ts"]
