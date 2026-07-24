# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
# Base registries ARG-overridable so in-cluster builds route Docker Hub pulls through the
# Harbor pull-through proxy. distroless lives on gcr.io — no Harbor proxy project yet
# (see homelab-cluster harbor-proxy-config) — pulled direct until then.
ARG REGISTRY_DOCKERHUB=docker.io
ARG REGISTRY_GCR=gcr.io

FROM --platform=$BUILDPLATFORM ${REGISTRY_DOCKERHUB}/golang:1.26-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651 AS builder
WORKDIR /src
COPY go.* ./
RUN go mod download
COPY . .
ARG TARGETOS TARGETARCH
ARG IMAGE_VERSION=0.0.0-dev
ENV CGO_ENABLED=0
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -X main.version=${IMAGE_VERSION}" \
    -o /out/ploegd ./cmd/ploegd

FROM ${REGISTRY_GCR}/distroless/static-debian12:nonroot@sha256:f5b485ea962d9bd1186b2f6b3a061191539b905b82ec395de78cbfae51f20e35
ARG IMAGE_CREATED=1970-01-01T00:00:00Z
ARG IMAGE_VERSION=0.0.0-dev
ARG IMAGE_REVISION=unknown
LABEL org.opencontainers.image.title="ploegd" \
      org.opencontainers.image.description="Ploeg dispatch plane daemon (pre-alpha)" \
      org.opencontainers.image.source="https://github.com/webgrip/ploeg" \
      org.opencontainers.image.vendor="WebGrip" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.created="${IMAGE_CREATED}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}"
COPY --from=builder /out/ploegd /usr/local/bin/ploegd
ENTRYPOINT ["/usr/local/bin/ploegd"]
