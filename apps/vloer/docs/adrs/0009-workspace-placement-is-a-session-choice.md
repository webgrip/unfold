# 0009 — Workspace placement is a per-session choice between a container and a pod

Date: 2026-09-09. Status: accepted for 0.3.0; the Docker backend is qualified locally, the Kubernetes backend remains unqualified on a target cluster.

## Context

The first live pilot ran `opencode serve` directly on the operator's workstation as the workbench's own OS user. That backend separates working directories and environment variables, but repository scripts and approved shell commands can read the server's files, its process environment and sibling workspaces. It is a convenience for trusted single-user development, not a boundary.

The estate already has a hardened agent body: the `agent-runner` image in [webgrip/infrastructure](https://forgejo.webgrip.dev/webgrip/infrastructure/src/branch/main/ops/docker/agent-runner) that Ploeg dispatches as one pod per ticket. That image runs OpenHands headless and mints, uses and revokes one LiteLLM key per run. It contains no OpenCode binary and no serving mode, so it cannot host an interactive, steerable session with permissions, questions and an event stream. [Homelab ADR-0051](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0051-harness-plurality-acp.md) already names the missing sibling, an `opencode-runner` image; De Vloer's [agent image](../../ops/agent/Dockerfile) is that image before publication.

De Vloer does not dispatch through Ploeg. Ploeg owns unattended work; De Vloer owns interactive sessions ([ADR 0001](0001-the-human-workbench-beside-ploeg.md)). Both need an isolated body for the agent, and the interactive lane needs one that can be reached from wherever the workbench runs.

Reaching an in-cluster workspace from a workstation-hosted workbench was examined and rejected for now. The API server's service proxy strips the `Authorization` header after authenticating the caller, which is exactly the header OpenCode's Basic authentication needs, so operator identity cannot be forwarded through it. WebSocket port-forwarding under the operator's Kubernetes identity would work, but needs a dependency-free WebSocket client that cannot be qualified against the target cluster in this iteration.

## Decision

Workspace placement is a per-session choice among administrator-enabled backends. `runtime.backends` lists what a deployment offers; the first entry, or an explicit `runtime.backend`, is the default. A session records its `placement`, the browser and editor offer the choice only when more than one backend is enabled, and the server rejects anything outside the list.

A `docker` backend runs the clone and the harness inside a container from the pinned agent image, through the Docker Engine socket and without shell or CLI. The session directory is bind-mounted as `/workspace`; the container runs with a read-only root filesystem, all capabilities dropped, no privilege escalation, a CPU, memory and PID budget, and a loopback-published port with a per-session random password. The only credential inside is the session's scoped LiteLLM key. Candidate capture stops the container, confirms it stopped and then snapshots the host directory with the existing local capture, which executes no repository hooks.

The `kubernetes` backend is unchanged in shape and remains the intended team backend for a workbench deployed in the cluster. It gains `agentSecrets`, a list of Kubernetes Secrets mounted as environment into the agent container and never into the clone container, so an External Secret from OpenBao is how an agent pod is allowed to touch something more.

For workbench-host backends, `runtime.agentEnvironment` is an explicit allow-list of variable names copied from the server process into agent workspaces. Names that carry workbench, gateway, cluster or vault authority are refused at configuration time. A launcher may read values from OpenBao into its shell; the configuration names which of them an agent may see. No value lives in a file.

The `local` backend stays available for trusted single-user development and is never the default when a container backend is enabled.

## Consequences

An operator on a workstation gets kernel-level isolation for agent work with one image build and no cluster. A team deployment keeps the pod backend. Both share the clone program, the managed OpenCode configuration and the candidate contract, so evidence has the same shape regardless of placement.

The Docker backend is qualified by [an executable probe](../../scripts/probe-docker.mjs) against the pinned image: clone inside the container from a fixture served to it, authenticated health, managed configuration, provider alias, adapter session creation, reconciliation endpoints, event stream, abort, candidate capture after a confirmed stop and container removal, with zero inference requests. Container network egress follows the Docker network it joins; a restricted network is an administrator choice through `docker.network`, not something the workbench enforces.

Publishing the agent image to Harbor as the `opencode-runner` sibling of `agent-runner`, digest-pinned by Renovate, is the convergence step with the estate. Running De Vloer sessions inside `agent-runner` would require an OpenHands runner behind the command bridge and is not claimed.

## Reconsider when

Add a WebSocket port-forward transport when a workstation-hosted workbench must drive pods under the operator's own Kubernetes identity, and qualify it against the cluster's network policy. Revisit the bind mount if the workbench host runs as a user other than the container user on Linux. Revisit `agentEnvironment` when a per-repository credential broker exists; an allow-list of names is a stopgap for a session-scoped, short-lived credential.
