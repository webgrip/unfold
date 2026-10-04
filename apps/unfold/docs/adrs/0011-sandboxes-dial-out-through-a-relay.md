# 0011 — Sandboxes dial out through a relay instead of exposing a port

Date: 2026-09-10. Status: accepted; the Docker pull transport is qualified locally, the Kubernetes pull transport by fixture only.

## Context

Every workspace backend so far required the workbench to reach into the sandbox: a published loopback port on Docker, a Service and an ingress rule on Kubernetes. That shape breaks in every direction the landscape research pointed at. A pod under Kata or gVisor cannot be port-forwarded. A workstation-hosted workbench cannot reach an in-cluster pod through the API server proxy because the proxy strips the header OpenCode's authentication needs. A microVM sandbox on a laptop, an Apple container machine and a pod behind a NAT all share one property: outbound HTTPS works and inbound does not. Anthropic's self-hosted sandboxes are built on exactly that property ([research](../research/2026-09-10-kubernetes-and-sandbox-crds.md)).

## Decision

Add a `pull` transport next to `publish`. The agent image bakes a small worker that long-polls the workbench with a per-workspace bearer token, forwards each queued request to the OpenCode server on loopback, streams the response back as one HTTP body and honours cancellation on the next poll. The workbench keeps a relay per workspace: the OpenCode adapter's fetch is routed through it, so the adapter is unchanged. In pull mode a container publishes no port and a pod has neither a Service nor an ingress rule; the network policy needs only egress to the workbench.

The same channel carries control requests under a reserved prefix: stop the child, execute a command, start a command, report status. Candidate capture for pull-mode pods happens in place through those controls, so no export pod and no read-only remount of the volume is needed. A warm pod without a session polls a pool endpoint with a pool-scoped token until the workbench assigns it a session; the assignment carries the session's environment, including its LiteLLM key, over the relay rather than through a Kubernetes Secret.

## Consequences

The workbench is the only thing that must be reachable, and it already is. Docker Desktop's `host.docker.internal` reaches a workbench bound to loopback on macOS, which the probe confirmed; Linux needs a reachable bind address. The relay adds one hop and a poll interval of at most a few hundred milliseconds when idle; streaming responses are unbuffered. Tokens live in memory with the workspace and are revoked on disposal. A worker that dies is visible as a stale poll; the workbench refuses to consider a workspace ready until its worker has polled.

Reconsider the transport when the estate has an inbound path that carries identity without stripping headers, such as WebSocket port-forward under the operator's identity, or when pod certificates in Kubernetes 1.37 make mutual TLS between pod and workbench cheaper than bearer tokens.
