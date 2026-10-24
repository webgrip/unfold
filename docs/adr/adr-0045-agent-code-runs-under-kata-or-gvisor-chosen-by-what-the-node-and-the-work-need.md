---
status: proposed
date: 2026-10-24
decision-makers: Ryan Grippeling
---

# Agent code runs under Kata or gVisor, chosen by what the node and the work need

## Context and Problem Statement

Ploeg's worker pods, Unfold's workspaces and Unfold's verifier checks run code an agent wrote or fetched. Kata Containers already isolates Unfold's workspaces and Ploeg's sandbox teams on the owner's homelab (homelab-cluster ADR-0070), and the rented production cluster puts agent Runs on a bare-metal Kata worker ([ADR-0040](adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md)). Nothing tells a self-hoster what to do when their nodes cannot run Kata. That is the case on every Hetzner Cloud VM, which offers no nested virtualization, and on most rented VMs. Nothing tells them either whether gVisor or Firecracker would be better.

Ploeg [ADR-0106](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour.md) (proposed) ranks gVisor (`hardened`) below Kata (`isolated`) and runs every Run at the strictest class a cell offers. On a node with both, that rule never chooses gVisor. On 2026-10-24 the owner said they want to support both patterns, chosen by use case.

Which sandbox runtimes does Unfold support and document for self-hosters, how is one chosen, and what must a cluster do before the first agent pod runs?

## Decision Drivers

* Agent code is the least trusted code in a cluster and gets the strongest boundary the node supports.
* Self-hosters run Talos, k3s, kind and managed clusters, on bare metal and on VMs without nested virtualization.
* Workspaces clone, install, build and sometimes build containers; the runtime must run that.
* A posture that lives only in a values file can silently fall back to runc.
* Power and memory cost money on always-on nodes, so per-pod overhead counts.

## Considered Options

* Kata with Cloud Hypervisor and gVisor as equals, chosen per workload by node and work, behind admission that refuses runc and Kata annotations
* Kata only, and runc with user namespaces where Kata cannot run
* gVisor only
* Kata with Firecracker as the VM runtime
* A strict ladder: always the strongest runtime the node offers (Ploeg ADR-0106 as written)

## Decision Outcome

Chosen option: **"Kata with Cloud Hypervisor and gVisor as equals, chosen per workload"**, because it is the only option that gives every node type a sandbox, keeps builds working where hardware allows, and can be enforced at admission.

* **Two runtimes.** Kata Containers with Cloud Hypervisor (RuntimeClass `kata`) and gVisor's systrap platform (RuntimeClass `gvisor`, handler `runsc`). Both carry a measured pod overhead and select nodes by a capability label.
* **Chosen by fit, not by rank.** On nodes with hardware virtualization, Kata for workspaces and writing Runs, where builds must work; gVisor for light, short-lived pods. On nodes without it, gVisor for everything. On GKE and AKS, the provider's own sandbox.
* **Admission first.** A policy that refuses `io.katacontainers.` pod annotations is applied before the first Kata pod, because Kata before 4.3.0 and Talos's extension let a pod author reach root on the node through them ([GHSA-37rf-pj8c-g5g3](https://github.com/kata-containers/kata-containers/security/advisories/GHSA-37rf-pj8c-g5g3)). A second policy refuses an agent pod without one of the two RuntimeClasses once every agent pod sets one.
* **The cluster kit.** The RuntimeClasses, both admission policies (native ValidatingAdmissionPolicy, no policy engine needed), the smoke Jobs, a bench, the Talos schematic and patches, and containerd snippets live in [`apps/unfold/ops/cluster/sandbox-runtimes`](../../apps/unfold/ops/cluster/sandbox-runtimes/README.md). Neither chart applies them.
* **Encryption is part of the same setup.** Node disks are encrypted (LUKS2 on Talos STATE and EPHEMERAL), pod traffic between nodes goes over WireGuard, and etcd Secrets are encrypted, as [Protect data at rest and in transit](../how-to/protect-data-at-rest-and-in-transit.md) describes.
* **Where it lives in the products.** Unfold: `workspacePodRuntimeClassName`, `workspaceRuntimeClassName`, `delivery.verifier.runtimeClassName`. Ploeg: `sandbox.runtimeClassName` per team and Role under the sandbox executor. Not implemented yet: a RuntimeClass for Ploeg's KEDA workers, and a runtime per Unfold session. Ploeg ADR-0106 needs amending so that `hardened` and `isolated` are alternatives a team chooses between, not a ladder; that change belongs in Ploeg's repository.

### Consequences

* Good, because a self-hoster on cloud VMs without nested virtualization gets a real sandbox instead of runc.
* Good, because on bare metal light pods stop paying a VM's overhead.
* Good, because the annotation hole in Kata 3.32 is closed on every cluster that follows the guide, not only on the homelab.
* Good, because gVisor pods remain visible to Falco through gVisor's Runtime Monitoring, where Kata pods are invisible to host eBPF tools.
* Bad, because two runtimes are two things to keep current and two sets of advisories to follow.
* Bad, because gVisor's compatibility gaps and slower file I/O surface as agent failures that look like repository problems; the bench must be run on real repositories before a team moves.
* Bad, because the label-matched admission policy catches configuration mistakes, not a pod creator who omits the label; RBAC has to cover that.

### Confirmation

* `kubectl apply -k apps/unfold/ops/cluster/sandbox-runtimes/smoke` on a cluster with both runtimes: the gVisor Job prints a `-gvisor` kernel, the Kata Job prints a kernel other than the node's.
* `kubectl run probe --image=busybox --labels=app.kubernetes.io/name=unfold-agent --dry-run=server -- true` is refused with `must set runtimeClassName to kata or gvisor`.
* A pod with any `io.katacontainers.` annotation is refused in every namespace.
* On the homelab: a gVisor RuntimeClass exists next to `kata`, and the bench's JSON lines for runc, Kata and gVisor are recorded in the research record.

## Pros and Cons of the Options

### Kata only, and runc with user namespaces where Kata cannot run

* Good, because one runtime is less to operate.
* Bad, because user namespaces still share the node's kernel: a kernel bug is still an escape, so cloud-VM self-hosters get no sandbox.

### gVisor only

* Good, because it runs on every node and costs least.
* Bad, because workspaces that build containers or need kernel features gVisor lacks fail, and on bare metal a VM boundary is available and stronger against a kernel-level escape.

### Kata with Firecracker as the VM runtime

* Good, because Firecracker has the smallest device model of any VMM: three virtio devices, a seccomp filter per thread, a jailer.
* Bad, because it has no shared filesystem, so Kata needs containerd's devmapper snapshotter and a thin pool on every node; Talos ships no Firecracker extension and only gained devmapper in 1.14; Kata 4's Rust runtime does not list it.
* Bad, because Cloud Hypervisor is built from the same Rust crates and adds the virtio-fs a workspace depends on, so the security gain over it is small.

### A strict ladder

* Good, because no one has to choose.
* Bad, because on a node with both runtimes gVisor is never chosen, which contradicts the owner's direction, and a Kata VM's overhead is paid by pods that do not need it.

## More Information

* Ticket: [VIK-2408](https://vikunja.webgrip.dev/tasks/2408).
* Explanation: [How agent code is contained](../concepts/how-agent-code-is-contained.md). Comparison: [Sandbox runtimes](../reference/sandbox-runtimes.md). Evidence: [research record of 2026-10-24](../research/2026-10-24-sandbox-runtimes-and-encryption.md).
* Re-evaluate when a Talos extension ships Firecracker or Kata's Rust runtime, when Ploeg ADR-0106 is decided, or when a supported harness needs something neither runtime runs.
* 2026-10-24 — Proposed. The owner agreed the direction ("support both patterns", "the best thing for everything") the same day.
