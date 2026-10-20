# syntax=docker/dockerfile:1
ARG REGISTRY_DHI=dhi.io
# renovate: datasource=docker depName=dhi.io/node versioning=docker
ARG NODE_DEV_IMAGE=${REGISTRY_DHI}/node:24.21.0-alpine3.24-dev@sha256:29828201fcab447665e099101c3ee960c2b7e9332198216863bd7b3139b70460
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
RUN install -d -o node -g node -m 0700 /data && install -d /app/.node-cache && chown -R node:node /app

FROM ${NODE_DEV_IMAGE} AS git
USER root
RUN apk add --no-cache git \
 && loader="$(ls /lib/ld-musl-*.so.1)" \
 && for file in /usr/bin/git /usr/libexec/git-core/git-remote-http; do install -D -m 0755 "$file" "/git-root$file"; done \
 && ln -s git-remote-http /git-root/usr/libexec/git-core/git-remote-https \
 && ln -s ../../bin/git /git-root/usr/libexec/git-core/git \
 && for library in $("$loader" --list /usr/bin/git; "$loader" --list /usr/libexec/git-core/git-remote-http) ; do case "$library" in /usr/lib/*) install -D -m 0644 "$library" "/git-root$library";; esac; done \
 && test -x /git-root/usr/bin/git

FROM ${NODE_RUNTIME_IMAGE} AS app
ARG IMAGE_CREATED=1970-01-01T00:00:00Z
ARG IMAGE_VERSION=dev
ARG IMAGE_REVISION=unknown
COPY --from=stage --chown=node:node /app /app
COPY --from=stage --chown=node:node /data /data
COPY --from=git /git-root/ /
RUN ["git", "--version"]
WORKDIR /app
ENV UNFOLD_HOST=0.0.0.0 UNFOLD_PORT=4080 UNFOLD_DATA_DIR=/data
EXPOSE 4080
USER node
ENV NODE_COMPILE_CACHE=/app/.node-cache
RUN ["node", "--input-type=module", "-e", "await import('/app/src/main.ts'); const { flushCompileCache, getCompileCacheDir } = await import('node:module'); flushCompileCache(); const { readdirSync } = await import('node:fs'); const written = getCompileCacheDir() ? readdirSync(getCompileCacheDir()).length : 0; if (written < 50) throw new Error('NODE_COMPILE_CACHE wrote ' + written + ' entries; expected one per application module');"]
LABEL org.opencontainers.image.title="Unfold" \
    org.opencontainers.image.description="Operator workbench control plane: shell-less hardened Node runtime with no package manager, plus git for governed delivery; agent work runs in separate workspaces." \
    org.opencontainers.image.source="https://github.com/webgrip/unfold" \
    org.opencontainers.image.vendor="WebGrip" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.created="${IMAGE_CREATED}" \
    org.opencontainers.image.version="${IMAGE_VERSION}" \
    org.opencontainers.image.revision="${IMAGE_REVISION}"
CMD ["node", "src/main.ts"]
