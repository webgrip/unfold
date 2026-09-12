# 0013 — Kubernetes placement through the Sandbox CRDs with warm Kata pools

Date: 2026-09-10. Status: accepted as a provisioner option; unqualified on the homelab cluster, which does not run the agent-sandbox controller yet.

## Context

The hand-rolled pod provisioner creates a Secret, a claim, a Service, a network policy and a Pod per session and waits for readiness. It works, but it owns lifecycle logic the ecosystem has since standardised: kubernetes-sigs/agent-sandbox reached 1.0 on 2026-08-28 with `Sandbox`, `SandboxTemplate`, `SandboxWarmPool` and `SandboxClaim`, isolation delegated to a RuntimeClass, and warm pods adopted by claims in under two seconds ([research](../research/2026-09-10-kubernetes-and-sandbox-crds.md)). The homelab cluster runs Talos with the Kata extension and a `kata` RuntimeClass backed by Cloud Hypervisor.

## Decision

Add a `sandbox` provisioner for the Kubernetes backend, available only with the pull transport. Cold mode creates a `Sandbox` whose pod template is the existing hardened agent pod with `runtimeClassName` set, a volume claim template for the workspace and no Service. Warm mode creates a `SandboxClaim` against an administrator-managed `SandboxWarmPool`, reads the bound pod's name, and assigns the session to that pod through the relay's pool endpoint: the pod's worker receives the repository, branch, environment and relay token, clones, starts OpenCode on loopback and relays. Candidates are captured in place through the relay's control channel. The pool token is a cluster-level secret shared by the workbench and the template.

The warm template lives with the cluster, as an example under [ops/cluster/agent-sandbox](../../ops/cluster/agent-sandbox/README.md), because it names the image, the RuntimeClass and the egress policy of one cluster.

## Consequences

A session on a warm pool starts in the time it takes to clone rather than the time it takes to schedule a VM, and the per-session Secret disappears from the cluster: the session key exists in the workbench's memory and in the pod's process environment only. The controller's RBAC is broad; it is installed once per cluster and the workbench's own role only touches `sandboxes` and `sandboxclaims` in its workspace namespace.

Kata on Talos is still the 3.x Go runtime with Cloud Hypervisor; VM snapshots as evidence need the hypervisor's snapshot daemon and a newer extension, so that part of the research shortlist stays open. Reconsider the cold path when the warm path is qualified, and reconsider the whole provisioner if the CRDs change shape before a stable API.
