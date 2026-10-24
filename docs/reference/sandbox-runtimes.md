---
type: reference
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-24
verified_by: "Sources and live checks in research/2026-10-24-sandbox-runtimes-and-encryption.md; extension tiers from the siderolabs/extensions README on 2026-10-24: primary sources (project repositories, release notes, security advisories, vendor docs) read on 2026-10-24; Image Factory extension lists for Talos 1.13.4 and 1.14.0; the Kata configuration on a homelab Talos 1.13.10 worker read with talosctl; gVisor run on kind. Start-up and overhead figures are the vendors' own unless the record says it measured them."
---

# Sandbox runtimes

This page compares the runtimes an agent pod can run under, so you can pick one per node pool. [How agent code is contained](../concepts/how-agent-code-is-contained.md) explains why the choice matters, and [Run agent code in a sandbox runtime](../how-to/run-agent-code-in-a-sandbox-runtime.md) installs them. The figures were checked on 2026-10-24; the [research record](../research/2026-10-24-sandbox-runtimes-and-encryption.md) lists every source.

**Recommendation:** Kata Containers with Cloud Hypervisor on nodes with hardware virtualization, gVisor on nodes without it, and both on bare metal so each workload takes the one that fits. Firecracker is not worth its cost for Kubernetes pods today; the [Firecracker](#firecracker) section says why and when that changes.

## Compared

| Runtime | The wall | What still touches the host | Needs | Start and overhead | Dev workloads (git, npm, builds, Docker) |
| --- | --- | --- | --- | --- | --- |
| runc | Namespaces, cgroups, seccomp, capabilities | The whole Linux kernel, shared with every pod | Nothing | Instant, none | Everything works |
| runc with `hostUsers: false` | As runc, and root in the pod is an unprivileged user on the node | The whole kernel; namespaced capabilities reach more of it | Kubernetes 1.36 (GA), Linux 6.3, containerd 2.0, an idmap-capable filesystem | Instant, none | Almost everything |
| gVisor (`runsc`, systrap) | A kernel reimplemented in Go (the Sentry) answers the pod's system calls | About 70 host system calls under seccomp; with directfs (the default) open file handles on the pod's mounts | Any x86-64 or Arm node; on Talos a user-namespace sysctl | Under 200 ms on GKE; tens of MiB | Most work; io_uring off, partial iptables, no KVM inside; Docker inside needs raw-socket flags. Test your own |
| gVisor (`runsc-kvm`) | As above, using the CPU's virtualization to switch into the Sentry | As above, plus KVM | Bare metal or nested virtualization | As above | As above; on bare metal faster than systrap, inside a VM often slower |
| Kata with Cloud Hypervisor | A virtual machine with its own Linux kernel | KVM in the host kernel; the Rust VMM process emulating virtio disk, network and console; virtiofsd serving the pod's files | Hardware virtualization | About 1 to 2 s; 130 to 160 MiB and 100 to 250m CPU per pod | Everything a Linux kernel runs, including container builds |
| Kata with QEMU | As above | KVM; QEMU's large C device model | Hardware virtualization | Similar, slightly more memory | As above, and nested VMs inside (Talos 1.14 `kata-qemu`) |
| Kata with Firecracker | As above, with the smallest device model: virtio net, block and vsock only, in a jailer | KVM; Firecracker's Rust VMM | Hardware virtualization; containerd's devmapper snapshotter and a thin pool on every node; no shared filesystem | Under 125 ms to guest init, under 5 MiB VMM (vendor figures) | As Kata, but every volume is a block device |
| Kata with SEV-SNP (confidential) | A VM whose memory the host cannot read | KVM and QEMU, which still emulate devices | AMD EPYC with SEV-SNP in firmware; Talos 1.14 `kata-containers-snp` | Slower start (guest image pull, 2 GiB pinned memory) | Exec into the pod may be blocked by the guest policy |

A first measurement on one machine, with the kit's bench under gVisor and runc: cloning and a network-bound `npm install` took about the same time, the test suite 1.4 times as long, and writing 20,000 small files 3.1 times as long ([record](../research/2026-10-24-sandbox-runtimes-and-encryption.md#bench)). Run the bench on your own repositories before moving a team.

## Which one where

| Nodes | Choose | Because |
| --- | --- | --- |
| Bare metal you own | Kata with Cloud Hypervisor for workspaces and writers; gVisor beside it for light, short pods | Its own kernel and a Rust VMM; builds work inside; gVisor where its lower overhead pays |
| Cloud VMs without nested virtualization (Hetzner Cloud says so in its FAQ) | gVisor systrap | The only sandbox that needs no `/dev/kvm` |
| Cloud VMs with nested virtualization (AWS M8i, C8i, R8i and others since February 2026; GKE Standard; AKS Gen2) | Kata if builds must work, gVisor if overhead matters | Kata works, at the cost of two layers of virtualization |
| GKE | GKE Sandbox: gVisor, or `microvm` (Kata with Cloud Hypervisor) on nested-virtualization pools | Managed by Google; add egress policy, since `microvm` does not block the metadata server |
| AKS | Pod Sandboxing, RuntimeClass `kata-vm-isolation` | Managed by Microsoft; Azure Linux, amd64 |
| A laptop | gVisor in kind or k3s | Kata needs `/dev/kvm` inside the kind node; runc with user namespaces is not a sandbox |
| A tenant must be protected from the host's operator | Kata with SEV-SNP on dedicated EPYC hardware | Nothing else hides memory from the host; it protects the tenant from the host, not the host from the tenant |

## Firecracker

Firecracker has the smallest attack surface of any VMM a Kubernetes pod can use: three virtio devices, a seccomp filter per thread and a jailer around each VM. AWS Lambda and E2B run on it. For Unfold's pods it loses to Cloud Hypervisor today:

* **No shared filesystem.** Firecracker implements no virtio-fs, so the container image and every volume reach the guest as block devices. Kata then needs containerd's devmapper snapshotter with an LVM thin pool on every node, set up and re-initialised by you on every boot.
* **Not on Talos.** The Talos Kata extension ships Cloud Hypervisor, QEMU and virtiofsd, not Firecracker. Talos 1.14 compiles the devmapper snapshotter in, but no published extension carries Firecracker, so you would build and maintain your own.
* **Not in Kata's new runtime.** Kata 4.0 (2026-07-20) made the Rust runtime the default and listed QEMU, Cloud Hypervisor and Dragonball for it, not Firecracker. kata-deploy keeps Firecracker as an opt-in profile on amd64.
* **The other paths are not for pods.** firecracker-containerd has no releases and lists Kubernetes as "exploring"; Flintlock runs microVMs as Kubernetes nodes; E2B runs Firecracker on Nomad, not Kubernetes.
* **The gain is small next to Cloud Hypervisor.** Both are Rust, built on the same rust-vmm crates. Cloud Hypervisor adds virtio-fs and hotplug, which is what makes a workspace volume and a cloned repository fast.

Reconsider when a Talos extension ships Firecracker, or Kata's Rust runtime supports it, and a workspace no longer depends on a shared filesystem.

## Who supports the Talos extensions

Sidero Labs sorts its system extensions into three tiers ([siderolabs/extensions](https://github.com/siderolabs/extensions#readme), read 2026-10-24): **core**, fully supported by Sidero Labs; **extra**, best-effort support that varies per extension; and **contrib**, supported by the community. `gvisor` is core. `kata-containers` and `kata-containers-snp` are extra. Expect Kata fixes on Talos, such as the annotation allowlist below, to come from its users, and keep the admission policy whatever the extension's version.

## Advisories to know about

| Advisory | Affects | What to do |
| --- | --- | --- |
| [GHSA-37rf-pj8c-g5g3](https://github.com/kata-containers/kata-containers/security/advisories/GHSA-37rf-pj8c-g5g3), High, 2026-10-21 | Kata up to 4.2.0 wherever containerd forwards `io.katacontainers.*` pod annotations, including Talos's Kata 3.32 extension: a pod author can reach root on the node | Refuse those annotations at admission (the kit's `refuse-kata-annotations.yaml`); kata-deploy 4.3.0 forwards only known-safe ones |
| [GHSA-mp2j-xm59-qfgw](https://github.com/kata-containers/kata-containers/security/advisories/GHSA-mp2j-xm59-qfgw), Critical, 2026-07-20 | Kata's Rust runtime before 4.0.0: the `io.katacontainers.config_path` annotation loads any file as configuration. The advisory names only the Rust runtime; Talos's extension runs the Go runtime | The same admission policy, and Kata 4.0.0 or later for the Rust runtime |
| Cloud Hypervisor [GHSA-jmr4-g2hv-mjj6](https://github.com/cloud-hypervisor/cloud-hypervisor/security/advisories/GHSA-jmr4-g2hv-mjj6) (2026-02-20) and [GHSA-f47p-p25q-83rh](https://github.com/cloud-hypervisor/cloud-hypervisor/security/advisories/GHSA-f47p-p25q-83rh) (2026-05-14), both High | Host file exfiltration through a QCOW backing file; a use after free in virtio-block | Keep the Kata extension or kata-deploy current; Cloud Hypervisor v54.0 is the latest |
| Firecracker CVE-2026-5747, High | The new virtio-pci transport | Only relevant if you run Firecracker |

gVisor publishes no GitHub advisories and assigns CVEs only to issues that cross its boundary.

## What host tools can see

Host eBPF tools such as Tetragon and Falco watch the host kernel. A Kata pod's processes run in a guest kernel they cannot see; they see the VMM. A gVisor pod's processes never reach the host kernel; the tools see the Sentry's few calls. gVisor's Runtime Monitoring sends every system call the Sentry handles to an external sink, and Falco reads it. Kata offers nothing equivalent without an agent inside the guest.

## Versions on 2026-10-24

Kata Containers 4.3.1; the Talos Kata extension 3.31.0 on Talos 1.13.4 and 3.32.0 on 1.14.0; Talos's gVisor extension 20260525.0 on 1.13.4 and 20260810.0 on 1.14.0; gVisor upstream 20261019.0; Cloud Hypervisor v54.0; Firecracker v1.17.0; agent-sandbox v1.0.8; Confidential Containers v0.23.0.
