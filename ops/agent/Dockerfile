# syntax=docker/dockerfile:1
ARG REGISTRY_DHI=harbor.webgrip.dev/dhi
# renovate: datasource=docker depName=dhi.io/node versioning=docker
ARG NODE_DEV_IMAGE=${REGISTRY_DHI}/node:24.19.0-alpine3.24-dev@sha256:dc2989ad23938772abaf549ed7bde5d61d70377005229bb55bef94bff40f8bbd
# renovate: datasource=npm depName=opencode-ai
ARG OPENCODE_VERSION=1.18.30

FROM ${NODE_DEV_IMAGE} AS fetch
ARG OPENCODE_VERSION
ARG TARGETARCH
WORKDIR /tmp/opencode
RUN case "${TARGETARCH}" in amd64) platform=x64 ;; arm64) platform=arm64 ;; *) echo "unsupported TARGETARCH ${TARGETARCH}" >&2; exit 1 ;; esac \
 && npm pack --quiet "opencode-linux-${platform}-musl@${OPENCODE_VERSION}" \
 && tar -xzf "opencode-linux-${platform}-musl-${OPENCODE_VERSION}.tgz" \
 && install -m 0755 package/bin/opencode /opencode \
 && /opencode --version

FROM ${NODE_DEV_IMAGE}
ARG OPENCODE_VERSION
ARG IMAGE_CREATED=1970-01-01T00:00:00Z
ARG IMAGE_VERSION=dev
ARG IMAGE_REVISION=unknown
RUN sed -i '/dl-cdn.alpinelinux.org/d' /etc/apk/repositories \
 && apk upgrade --no-cache --available \
 && apk add --no-cache bash git ca-certificates \
 && install -d -o node -g node -m 0755 /workspace /etc/opencode
COPY --from=fetch /opencode /usr/local/bin/opencode
RUN install -d -m 0755 /usr/local/lib/de-vloer
COPY relay-worker.mjs /usr/local/lib/de-vloer/relay-worker.mjs
RUN chmod 0644 /usr/local/lib/de-vloer/relay-worker.mjs && su node -s /bin/sh -c 'node --check /usr/local/lib/de-vloer/relay-worker.mjs'
RUN opencode --version | grep -F "${OPENCODE_VERSION}"
USER node
WORKDIR /workspace
EXPOSE 4096
ENV OPENCODE_DISABLE_AUTOUPDATE=true OPENCODE_DISABLE_SHARE=true
LABEL org.opencontainers.image.title="De Vloer agent workspace" \
    org.opencontainers.image.description="OpenCode ${OPENCODE_VERSION} server for one De Vloer session: hardened Alpine base, git, bash, node; no package manager network at run time." \
    org.opencontainers.image.source="https://forgejo.webgrip.dev/webgrip/de-vloer" \
    org.opencontainers.image.vendor="WebGrip" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.created="${IMAGE_CREATED}" \
    org.opencontainers.image.version="${IMAGE_VERSION}" \
    org.opencontainers.image.revision="${IMAGE_REVISION}"
CMD ["opencode", "serve", "--hostname", "0.0.0.0", "--port", "4096"]
