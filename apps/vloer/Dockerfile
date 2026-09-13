# syntax=docker/dockerfile:1
ARG REGISTRY_DHI=harbor.webgrip.dev/dhi
# renovate: datasource=docker depName=dhi.io/node versioning=docker
ARG NODE_DEV_IMAGE=${REGISTRY_DHI}/node:24.19.0-alpine3.24-dev@sha256:dc2989ad23938772abaf549ed7bde5d61d70377005229bb55bef94bff40f8bbd
# renovate: datasource=docker depName=dhi.io/node versioning=docker
ARG NODE_RUNTIME_IMAGE=${REGISTRY_DHI}/node:24.19.0-alpine3.24@sha256:17b2b728ef4250c311ee9fb80f3a4a1060db6996750e85c1bf2dec10ccc5b6e6

FROM ${NODE_DEV_IMAGE} AS stage
WORKDIR /app
COPY package.json ./
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
    org.opencontainers.image.source="https://github.com/webgrip/glide" \
    org.opencontainers.image.vendor="WebGrip" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.created="${IMAGE_CREATED}" \
    org.opencontainers.image.version="${IMAGE_VERSION}" \
    org.opencontainers.image.revision="${IMAGE_REVISION}"
CMD ["node", "src/main.ts"]
