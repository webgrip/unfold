---
type: explanation
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-29
verified_by: "Chart values in apps/unfold/ops/helm/unfold/values.yaml and templates/config.yaml, and Ploeg's chart 0.2.0-rc.94 (values.yaml, templates/_sandbox.tpl, templates/_helpers.tpl) read on 2026-10-29; apps/unfold/src/runtime/kubernetes.ts and src/store.ts; the homelab's Talos workers read with talosctl (Kata 3.32.0, Cloud Hypervisor, virtio-fs, disable_guest_seccomp=true, no TPM on the three workers); sources in research/2026-10-24-sandbox-runtimes-and-encryption.md."
---

# How agent code is contained

Agents run code nobody reviewed: a repository's install scripts and tests, packages they fetched, commands a model chose. Unfold assumes any of it can be hostile. So every pod that runs it should sit behind a boundary stronger than an ordinary container, hold no credential worth stealing, reach only the hosts it needs, and leave nothing readable on a stolen disk. Unfold and Ploeg provide some of these layers; the cluster has to provide the rest. This page explains each layer, what it stops, and who provides it.

Three terms first:

* **Container runtime**: the program a node uses to start a pod. The default, runc, starts it as an ordinary process on the node's own Linux kernel, fenced in by kernel features.
* **RuntimeClass**: the Kubernetes object that names a different runtime. A pod that sets `runtimeClassName: kata` starts under Kata instead of runc.
* **Sandbox runtime**: a runtime that puts something between the pod and the node's kernel, so that a bug in the kernel is not enough to escape.

## Which pods run agent code

| Pod | Created by | Runs | Setting for its runtime |
| --- | --- | --- | --- |
| Ploeg worker | Ploeg, one per Run ([Inside a Run](inside-a-run.md)) | The harness and every command it starts | `executor.runtimeClassName`, overridden per team and Role, under every executor |
| Unfold workspace | Unfold, one per interactive session | OpenCode or another harness, with the person steering | `workspacePodRuntimeClassName` (pod provisioner) or `workspaceRuntimeClassName` (sandbox provisioner); in live mode the chart refuses an empty one unless `workspaceAllowUnsandboxed` is `true` |
| Unfold verifier check | Unfold's delivery verifier, one per check ([candidate delivery](../../apps/unfold/docs/contracts/candidate-delivery.md)) | A policy check over an agent's candidate | `delivery.verifier.runtimeClassName`, default `kata` |

A Ploeg worker pod that resolves no RuntimeClass at the Role, team or `executor` level runs under runc. Not implemented yet: a runtime chosen per Unfold session rather than per installation.

## The layers

| Layer | Stops | Provided by |
| --- | --- | --- |
| Sandbox runtime | Code that exploits a kernel bug to reach the node, and from there every pod on it | The cluster: [Run agent code in a sandbox runtime](../how-to/run-agent-code-in-a-sandbox-runtime.md) |
| Pod hardening | Code that uses root, capabilities or privilege escalation | Both charts: non-root, no capabilities, no privilege escalation, `RuntimeDefault` seccomp, no service-account token. The cluster enforces it with the `restricted` Pod Security Standard |
| Credentials out of reach | Prompt-injected code that reads the model key or forge token | Ploeg: the harness gets placeholders, the worker's loopback proxies hold the real ones ([Inside a Run](inside-a-run.md#where-the-credentials-live)) |
| Narrow authority | A Run that pushes outside its repository or spends past its budget | Ploeg: per-Run, per-repository push tokens and per-Run capped model keys |
| Network egress | Code that sends what it found somewhere, or attacks the LAN | Both charts render default-deny policies; the cluster's network plugin must enforce them |
| Encryption | A stolen disk, a tapped network | The cluster: [Protect data at rest and in transit](../how-to/protect-data-at-rest-and-in-transit.md) |

No single layer is enough. A sandbox does nothing for a key the harness can read; a proxy does nothing for a node the code escaped to.

## Two sandbox runtimes, chosen by fit

Unfold supports two sandbox runtimes and treats them as equals ([ADR-0045](../adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md)). Each workload takes the one that fits its node and its work.

**Kata Containers** starts each pod in a small virtual machine with its own Linux kernel. Code that escapes the container is inside that VM. Leaving it takes a second bug, in the CPU's virtualization support (KVM) or in the program that plays the VM's devices (the VMM). Kata needs hardware virtualization, so bare metal or a VM whose provider passes it through. It costs 130 to 160 MiB and a second or two of start-up per pod, and anything a Linux kernel runs works inside, including container builds.

**gVisor** keeps the pod's system calls away from the node's kernel altogether. A kernel written in Go, the Sentry, answers them in user space, and the Sentry itself may use only about 70 of the host's system calls. It runs on any node, VMs without nested virtualization included, starts in well under a second and costs tens of MiB. The price is compatibility and file speed: a reimplemented kernel lacks some features, and file-heavy work such as `npm ci` is slower than under runc.

Neither is cut off from the host. A Kata pod still reaches the host through KVM, the VMM's virtio devices and virtiofsd, the program that serves the pod's files into the VM; a gVisor pod through the Sentry's system calls and, by default, open file handles on its mounts. The difference is how wide that remaining link is and what it is written in. Well-known VM escapes, such as QEMU's VENOM, went through the VMM's device emulation rather than KVM, which is why Cloud Hypervisor, written in Rust, is the VMM Unfold recommends for Kata. [Sandbox runtimes](../reference/sandbox-runtimes.md) compares both with runc, user namespaces, Firecracker and confidential VMs.

The fit, in short:

* **Bare metal:** Kata for workspaces and writers, where builds must work; gVisor beside it for light, short-lived pods such as the verifier's checks.
* **Cloud VMs without nested virtualization:** gVisor for everything, because Kata cannot start there.
* **Managed Kubernetes:** the provider's own sandbox: GKE Sandbox, AKS Pod Sandboxing.

Two details of Kata matter when you configure it:

* **Pod annotations reach the runtime.** Kata reads annotations under `io.katacontainers.` as overrides of its hypervisor settings and kernel parameters. Before Kata 4.3.0, which Talos does not ship yet, a pod author could use them to reach root on the node. An admission policy that refuses them is not optional.
* **The pod's seccomp profile stays outside.** Kata's default `disable_guest_seccomp = true` does not apply the pod's seccomp profile inside the guest. The VM boundary replaces it; the VMM on the host runs under its own seccomp filter.

## What you can still see

Host tools that watch the kernel with eBPF, such as Tetragon and Falco, lose sight of sandboxed pods. A Kata pod's processes run in a guest kernel they cannot see. A gVisor pod's processes never reach the host kernel. gVisor can send every system call it handles to Falco through its Runtime Monitoring; Kata has no equivalent without an agent inside the VM. Either way, the trail that stays complete is the one Ploeg and Unfold keep themselves: Run events, session events, the forge's record of pushes, the gateway's record of model calls.

## Encryption

Unfold encrypts one thing itself: tokens people link to their own accounts, with AES-256-GCM, under a key stored next to its database. Everything else is the cluster's job.

| Data | In transit | At rest | In use |
| --- | --- | --- | --- |
| Pod-to-pod traffic | The network plugin's WireGuard mode (Cilium, Calico, Flannel) | — | — |
| Traffic to the forge, gateway and providers | TLS, if you give each an `https://` URL | — | — |
| Workspaces, scratch, logs, images | — | The node's disk encryption (Talos LUKS2 on STATE and EPHEMERAL), or the storage class's | Readable by root on the node |
| Unfold's and Ploeg's databases | — | The volume's disk encryption; the backup target's | Readable by root on the node |
| Kubernetes Secrets | — | etcd encryption (on by default on Talos) | — |

Disk encryption is only as strong as what holds its key. A TPM keeps the key in the machine's chip; a key derived from the node's ID only protects a disk that leaves the building on its own. A sandbox runtime does not encrypt memory: root on the node can read a Kata VM's memory as easily as a container's. Hiding memory from the host takes AMD SEV-SNP or Intel TDX hardware and confidential VMs, which Talos 1.14 supports for SEV-SNP. That protects a tenant from the host's operator, not the host from the tenant, and Unfold has not been run on it.

## What is not built yet

* A runtime chosen per Unfold session or per Ploeg isolation class ([Ploeg ADR-0106](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour.md), proposed).
* Credentials kept outside the Run's pod entirely, in an egress gateway, so that even a compromised harness holds only placeholders.
