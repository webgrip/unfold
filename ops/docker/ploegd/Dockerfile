# syntax=docker/dockerfile:1
# Base registries ARG-overridable so in-cluster builds route Docker Hub pulls through the
# Harbor pull-through proxy. distroless lives on gcr.io — no Harbor proxy project yet
# (see homelab-cluster harbor-proxy-config) — pulled direct until then.
ARG REGISTRY_DOCKERHUB=docker.io
ARG REGISTRY_GCR=gcr.io

FROM --platform=$BUILDPLATFORM ${REGISTRY_DOCKERHUB}/golang:1.25-bookworm AS builder
WORKDIR /src
COPY go.* ./
RUN go mod download
COPY . .
ARG TARGETOS TARGETARCH
ARG IMAGE_VERSION=0.0.0-dev
ENV CGO_ENABLED=0
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${IMAGE_VERSION}" \
    -o /out/ploegd ./cmd/ploegd && \
    GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${IMAGE_VERSION}" \
    -o /out/ploeg-worker ./cmd/ploeg-worker

FROM ${REGISTRY_GCR}/distroless/static-debian12:nonroot
ARG IMAGE_CREATED=1970-01-01T00:00:00Z
ARG IMAGE_VERSION=0.0.0-dev
ARG IMAGE_REVISION=unknown
LABEL org.opencontainers.image.title="ploegd" \
      org.opencontainers.image.description="Ploeg dispatch plane daemon (pre-alpha)" \
      org.opencontainers.image.source="https://forgejo.webgrip.dev/webgrip/ploeg" \
      org.opencontainers.image.vendor="WebGrip" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.created="${IMAGE_CREATED}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}"
COPY --from=builder /out/ploegd /usr/local/bin/ploegd
# ploeg-worker rides along; the executor's initContainer extracts it via
# `ploeg-worker install <dst>` (self-copy — distroless has no shell).
COPY --from=builder /out/ploeg-worker /usr/local/bin/ploeg-worker
ENTRYPOINT ["/usr/local/bin/ploegd"]
