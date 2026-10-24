# Which sandbox runtime, and which encryption, should a self-hosted Unfold use?

Date: 24 October 2026. Read against Unfold `origin/development` at `95a73de3`, Ploeg's pinned release `0.2.0-rc.57` ([`fd45cc7`](https://github.com/ploeg-hq/ploeg/tree/fd45cc79b3e8cf1f5bf9beba5ff7ce8daf4c28f7)) and homelab-cluster `origin/main` at `68fbe4d6`. This is a record. It supports [ADR-0045](../adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md) and the current pages [How agent code is contained](../concepts/how-agent-code-is-contained.md), [Sandbox runtimes](../reference/sandbox-runtimes.md), [Run agent code in a sandbox runtime](../how-to/run-agent-code-in-a-sandbox-runtime.md) and [Protect data at rest and in transit](../how-to/protect-data-at-rest-and-in-transit.md).

> **Method.** Three kinds of evidence. Primary sources (project repositories, release notes, security advisories, vendor documentation), read on 2026-10-24, partly by a research pass whose claims were spot-checked: every advisory, the Hetzner FAQ and the kata-deploy chart were re-read directly. Read-only `talosctl` and `kubectl` against the homelab. And runs on a local kind cluster. Nothing was changed on the homelab. Kata was not run outside the homelab, and gVisor not on Talos.

## Why this came up

A homelab Discord conversation on 2026-10-24 argued that gVisor is arguably more secure than Kata, because it keeps system calls in user space, and that a VM stays linked to its host through virtio. The owner wanted both patterns supported, chosen by use case, with the result documented for self-hosters, and asked whether Firecracker would be better: "I want the best thing for everything."

## Verdict

1. **Kata with Cloud Hypervisor where nodes have hardware virtualization, gVisor where they do not, both on bare metal.** Neither strictly dominates. Kata gives a separate kernel and runs everything Linux runs. gVisor needs no `/dev/kvm`, costs less and keeps its pods visible to Falco. Both remain linked to the host: Kata through KVM, the VMM's virtio devices and virtiofsd; gVisor through about 70 host system calls and, with directfs, host file handles.
2. **Firecracker is not worth it for pods today.** It has no virtio-fs, so Kata needs devmapper and a thin pool per node; Talos ships no Firecracker extension and gained devmapper only in 1.14; Kata 4's Rust runtime does not list it. Cloud Hypervisor uses the same rust-vmm crates and adds the virtio-fs a workspace needs.
3. **The most urgent finding is an annotation hole, and the homelab already closes it.** Talos's Kata extension forwards every `io.katacontainers.*` pod annotation to Kata 3.32, and [GHSA-37rf-pj8c-g5g3](https://github.com/kata-containers/kata-containers/security/advisories/GHSA-37rf-pj8c-g5g3) (High, 2026-10-21, fixed in kata-deploy 4.3.0) shows a pod author reaching root on the node that way. The homelab's Kyverno policy `kata-annotation-guard` already denies those annotations in every namespace. A self-hoster following no guide would not have it, so the kit ships a native admission policy for it.
4. **Encryption at rest is the gap on the homelab.** etcd is encrypted (Talos `secretbox`) and pod traffic between nodes is WireGuard (homelab ADR-0004), but no node encrypts STATE or EPHEMERAL, where Longhorn keeps its data. The three worker nodes expose no TPM; the three control planes do. Secure Boot is off on every node read.

## Live facts

### Homelab, read with talosctl and kubectl

| Fact | Value |
| --- | --- |
| Kata on the workers | Extension `kata-containers` 3.32.0 on Talos 1.13.10; containerd handler `kata` only, from `/etc/cri/conf.d/10-kata-containers.part` |
| Kata's containerd entry | `pod_annotations = ["io.katacontainers.*"]` |
| Kata's configuration | `[hypervisor.clh]`, `shared_fs = "virtio-fs"`, `enable_annotations = ["enable_iommu", "virtio_fs_extra_args", "kernel_params"]`, `disable_guest_seccomp=true`, `sandbox_cgroup_only=false` |
| RuntimeClasses | `kata` only |
| gVisor's sysctl | `user.max_user_namespaces: "11255"` is already set for every node (`talos/patches/global/machine-sysctls.yaml`), for user-namespace pods |
| TPM (`/sys/class/tpm`) | `tpm0` on the three Intel N150 control planes; none on the three workers (Core i7-4770, i5-4670K, i7-6700K) |
| Secure Boot (`get securitystate`) | `secureBoot: false` on the workers read |
| Disk encryption | No `VolumeConfig` encryption in `talos/` |
| Longhorn data | `/var/lib/longhorn` on EPHEMERAL on the workers (`talos/patches/worker/*.yaml`) |

### Talos Image Factory, 2026-10-24

| Talos | `kata-containers` | `gvisor` | Confidential | Firecracker |
| --- | --- | --- | --- | --- |
| 1.13.4 | 3.31.0 | 20260525.0 | none | none |
| 1.14.0 | 3.32.0 | 20260810.0 | `kata-containers-snp`, `kata-containers-nvidia-gpu-snp` 3.32.0 | none |

The schematic with `siderolabs/kata-containers` and `siderolabs/gvisor` is `e77adcb5f09fa573372ec1a870b07120dd9378bef391069c1f6073e9fa24cc96`.

### kind, gVisor release-20261005.0

kind 0.33.0, Kubernetes 1.37.0, containerd 2.3.4 (configuration version 2), host kernel 6.8. The release's `gvisor.tar.bz2` matched its published SHA-512. `runsc`, `containerd-shim-runsc-v1` and `gvisor-bin/` went into `/usr/local/bin`, the runtime entry from `containerd/runsc-config-v2.toml` was appended, and containerd restarted.

* The gVisor smoke Job printed `kernel=4.19.0-gvisor` and `Starting gVisor...`.
* With both admission policies applied, server dry runs refused an `unfold-agent` pod and a `ploeg-worker` pod without a RuntimeClass, refused a pod with `io.katacontainers.config.hypervisor.enable_debug`, and admitted an `unfold-agent` pod under `gvisor`, an unlabelled pod and a pod labelled `nginx`. A pod naming the non-existent RuntimeClass `kata-qemu` was refused by the API server itself.
* The bench's results are below.

### Bench

`bench/` from the kit, on the same kind node (AMD Ryzen 9 7950X, each Job limited to one CPU and 1 GiB), runc and gVisor alternating, three rounds each, with `expressjs/express` at `v5.1.0` (no lockfile, so `npm install`; its Mocha suite runs offline). Median milliseconds:

| Phase | runc | gVisor | gVisor ÷ runc |
| --- | --- | --- | --- |
| Shallow clone | 731 | 772 | 1.06 |
| Install dependencies (network-bound) | 15,887 | 16,509 | 1.04 |
| Test suite | 2,137 | 3,014 | 1.41 |
| Write, list and delete 20,000 small files | 715 | 2,219 | 3.10 |

Raw rounds (runc, then gVisor): install 15,887, 13,495, 17,020 and 16,117, 16,509, 19,205; tests 2,137, 2,195, 2,094 and 2,969, 3,030, 3,014; small files 706, 715, 729 and 2,219, 2,263, 2,206. The install phase varies with the registry and hides most of gVisor's cost; the small-file phase shows it. Three rounds on one machine is a direction, not a benchmark. Kata was not measured here, because kind nodes have no `/dev/kvm` passed in; the next measurement is the same bench on a homelab worker under all three runtimes.

## Sources

### Firecracker

* Design and device model (virtio-net, virtio-block, virtio-vsock, serial, partial i8042; seccomp per thread; jailer required in production): [docs/design.md](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md); boot and overhead targets: [SPECIFICATION.md](https://github.com/firecracker-microvm/firecracker/blob/main/SPECIFICATION.md); advisories CVE-2026-5747 and CVE-2026-1386: [security advisories](https://github.com/firecracker-microvm/firecracker/security/advisories); latest v1.17.0, 2026-09-10.
* Kata with Firecracker needs a block-device root filesystem and devmapper: [how-to](https://github.com/kata-containers/kata-containers/blob/main/docs/how-to/how-to-use-kata-containers-with-firecracker.md); kata-deploy 4.3.1 keeps it as the opt-in `try-kata-fc` profile: [chart](https://github.com/kata-containers/kata-containers/tree/4.3.1/tools/packaging/kata-deploy/helm-chart/kata-deploy).
* Kata 4.0.0 (2026-07-20) lists QEMU, Cloud Hypervisor and Dragonball for the Rust runtime: [release](https://github.com/kata-containers/kata-containers/releases/tag/4.0.0), [overview](https://katacontainers.io/blog/kata-containers-4-0-0-release-overview/).
* Talos 1.13's containerd has no devmapper snapshotter: [siderolabs/talos#13704](https://github.com/siderolabs/talos/issues/13704); compiled in for 1.14: [siderolabs/pkgs#1610](https://github.com/siderolabs/pkgs/pull/1610). The Kata extension's contents: [siderolabs/extensions](https://github.com/siderolabs/extensions/tree/main/container-runtime/kata-containers).
* Other paths: [firecracker-containerd](https://github.com/firecracker-microvm/firecracker-containerd) (no releases, Kubernetes "exploring"), [Flintlock](https://github.com/liquidmetal-dev/flintlock) (microVMs as nodes), [agent-sandbox's Firecracker example](https://agent-sandbox.sigs.k8s.io/docs/use-cases/examples/firecracker-sandbox/) (Kata `kata-fc` with devmapper), [E2B infra](https://github.com/e2b-dev/infra) (Nomad, not Kubernetes).

### Kata and its VMMs

* Hypervisor comparison: [docs/hypervisors.md](https://github.com/kata-containers/kata-containers/blob/main/docs/hypervisors.md). Cloud Hypervisor v54.0 and its advisories GHSA-jmr4-g2hv-mjj6 and GHSA-f47p-p25q-83rh: [repository](https://github.com/cloud-hypervisor/cloud-hypervisor), [advisories](https://github.com/cloud-hypervisor/cloud-hypervisor/security/advisories).
* Kata advisories GHSA-37rf-pj8c-g5g3 (up to 4.2.0, pod annotation allowlist), GHSA-mp2j-xm59-qfgw (Rust runtime before 4.0.0, `config_path` annotation), GHSA-7fhf-v3p3-rp56 (Rust runtime, host bind mounts), GHSA-rr59-xxvx-96qr (virtiofsd arguments, fixed in 3.31): [advisories](https://github.com/kata-containers/kata-containers/security/advisories).
* kata-deploy 4.3.1: default shim `qemu-runtime-rs`, handlers named `kata-<shim>`, `hypervisor.rootless` for the Rust runtime's QEMU and Cloud Hypervisor shims: [values.yaml](https://github.com/kata-containers/kata-containers/blob/4.3.1/tools/packaging/kata-deploy/helm-chart/kata-deploy/values.yaml).

### gVisor

* Platforms (systrap default, KVM best on bare metal): [platforms](https://gvisor.dev/docs/architecture_guide/platforms/); directfs and its trade-off: [blog](https://gvisor.dev/blog/2023/06/27/directfs/), [filesystem guide](https://gvisor.dev/docs/user_guide/filesystem/); compatibility: [guide](https://gvisor.dev/docs/user_guide/compatibility/); Docker inside gVisor: [tutorial](https://gvisor.dev/docs/tutorials/docker-in-gvisor/); Runtime Monitoring: [guide](https://gvisor.dev/docs/user_guide/runtimemonitor/); security policy: [gvisor.dev/security](https://gvisor.dev/security/).
* Talos extension, handlers `runsc` and `runsc-kvm`, sysctl requirement: [siderolabs/extensions](https://github.com/siderolabs/extensions/tree/main/container-runtime/gvisor).

### Confidential computing, user namespaces, other runtimes

* Confidential Containers v0.23.0 (2026-09-24) and its limitations: [release notes](https://github.com/confidential-containers/confidential-containers/blob/main/releases/v0.23.0.md); Talos `kata-containers-snp`: [extension](https://github.com/siderolabs/extensions/tree/main/container-runtime/kata-containers-snp).
* User namespaces GA in Kubernetes 1.36: [docs](https://kubernetes.io/docs/concepts/workloads/pods/user-namespaces/), [blog](https://kubernetes.io/blog/2026/04/23/kubernetes-v1-36-userns-ga/). Sysbox: [repository](https://github.com/nestybox/sysbox), Talos extension still a pull request: [siderolabs/extensions#1171](https://github.com/siderolabs/extensions/pull/1171).
* Host eBPF cannot see inside a Kata guest: [cilium/tetragon#1055](https://github.com/cilium/tetragon/issues/1055).

### Where each runtime can run

* Hetzner Cloud: "No, this is not possible on cloud server": [FAQ](https://docs.hetzner.com/cloud/servers/faq/).
* AWS nested virtualization on M7i, M8i, C7i, C8i, R7i, R8i, X8i, I7i and others since February 2026: [EC2 guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-ec2-nested-virtualization.html).
* GKE nested virtualization: [guide](https://cloud.google.com/kubernetes-engine/docs/how-to/nested-virtualization); GKE Sandbox with gVisor and `microvm`: [concepts](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/sandbox-pods).
* AKS Pod Sandboxing, `kata-vm-isolation`: [guide](https://learn.microsoft.com/en-us/azure/aks/use-pod-sandboxing).
* Scaleway and OVHcloud instances: not verified.

### Encryption

* Talos disk encryption and VolumeConfig: [disk encryption](https://docs.siderolabs.com/talos/v1.13/configure-your-talos-cluster/storage-and-disk-management/disk-encryption), [VolumeConfig](https://docs.siderolabs.com/talos/v1.13/reference/configuration/block/volumeconfig). Encrypting a used partition requires wiping it.
* Longhorn volume encryption: [1.10 docs](https://longhorn.io/docs/1.10.0/advanced-resources/security/volume-encryption/).

## Limitations

* No independent 2025 or 2026 benchmark of Kata, gVisor and Firecracker for development workloads was found. The figures on the reference page are the vendors' own, except the bench above.
* Kata 4.x was not run; the homelab runs the Go runtime 3.32.
* GHSA-7fhf-v3p3-rp56 and GHSA-mp2j-xm59-qfgw name the Rust runtime. Whether the Go runtime the homelab uses honours the same annotations was not tested; the admission policy makes the question moot.
* The claim that most published VM escapes went through device emulation rather than KVM is a reading of well-known cases, such as QEMU's VENOM, not a count.
