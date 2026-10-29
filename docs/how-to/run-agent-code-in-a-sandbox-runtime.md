---
type: how-to
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-29
verified_by: "Kit in apps/unfold/ops/cluster/sandbox-runtimes run on kind 0.33.0 (Kubernetes 1.37.0, containerd 2.3.4) with gVisor release-20261005.0: gVisor smoke Job, admission dry runs and the bench. Talos patches validated with talosctl 1.13.4; Image Factory extension list for Talos 1.13.4 and 1.14.0 read on 2026-10-24; Kata handler and configuration read from a homelab Talos 1.13.10 worker with talosctl. Chart values read from apps/unfold/ops/helm/unfold/values.yaml and templates/config.yaml, and from Ploeg's chart 0.2.0-rc.94 (values.yaml, templates/_sandbox.tpl, templates/_helpers.tpl) on 2026-10-29. Not run here: Kata outside the homelab, gVisor on Talos, k3s, GKE and AKS."
---

# Run agent code in a sandbox runtime

To keep code an agent wrote or fetched off your nodes' kernel, run every agent pod under Kata Containers or gVisor. You install the runtime on the nodes, add a RuntimeClass, point Unfold's and Ploeg's charts at it, and turn on an admission policy that refuses an agent pod without one. [How agent code is contained](../concepts/how-agent-code-is-contained.md) explains the two runtimes; [Sandbox runtimes](../reference/sandbox-runtimes.md) compares them, and Firecracker, in detail.

Every file this page names is in [`apps/unfold/ops/cluster/sandbox-runtimes`](../../apps/unfold/ops/cluster/sandbox-runtimes/README.md).

## Before you start

* Kubernetes 1.30 or later, for the admission policy.
* For Kata: nodes with hardware virtualization, which means bare metal, or a virtual machine whose provider exposes nested virtualization. Check with `ls /dev/kvm` on the node, or on Talos `talosctl -n <node> ls /dev/kvm`.
* For gVisor: nothing beyond a containerd-based runtime on a 64-bit x86 or Arm node.

## 1. Choose a runtime per node pool

| Your nodes | Install | Run under it |
| --- | --- | --- |
| Bare metal | Both | Kata for workspaces and Ploeg writers; gVisor where you want lighter pods, such as the delivery verifier's checks |
| Cloud VMs without nested virtualization, such as Hetzner Cloud | gVisor | Everything |
| Cloud VMs with nested virtualization, such as AWS M8i, C8i or R8i (since February 2026) | Both | As on bare metal, with Kata paying for two layers of virtualization |
| GKE | GKE Sandbox on the agent node pool: gVisor, or microVMs (Kata with Cloud Hypervisor) on Standard pools with nested virtualization | Everything |
| AKS | Pod Sandboxing (Kata with Cloud Hypervisor) on an Azure Linux node pool | Everything |
| A laptop with kind or k3s, to try it | gVisor | Everything |

## 2. Install the runtime on the nodes

### Talos

1. Get an installer image with both extensions from the Image Factory, using [`talos/schematic.yaml`](../../apps/unfold/ops/cluster/sandbox-runtimes/talos/schematic.yaml):

    ```sh
    curl -X POST --data-binary @talos/schematic.yaml https://factory.talos.dev/schematics
    ```

    The answer's `id` names the installer: `factory.talos.dev/installer/<id>:v1.13.x`. On Talos 1.13.4 the factory carries `siderolabs/kata-containers` 3.31.0 and `siderolabs/gvisor` 20260525.0; Talos 1.14.0 carries 3.32.0 and 20260810.0. Neither has a Firecracker extension.
2. Add [`talos/worker-runtimes.yaml`](../../apps/unfold/ops/cluster/sandbox-runtimes/talos/worker-runtimes.yaml) to the agent nodes' patches. It raises `user.max_user_namespaces`, which gVisor needs and which Talos's hardened default keeps at zero, and adds both capability labels. Leave the label off a node that should not run a runtime, and leave both off control-plane nodes.
3. Upgrade one node at a time to the new installer: `talosctl -n <node> upgrade --image factory.talos.dev/installer/<id>:<version>`.
4. Check that both extensions are there: `talosctl -n <node> get extensions` lists `kata-containers` and `gvisor`. Trust that list, not the upgrade command's exit code.

The Kata extension registers the containerd handler `kata`, which runs Cloud Hypervisor with virtio-fs; the gVisor extension registers `runsc` and `runsc-kvm`. Encrypt the disks in the same pass if you plan to: [Protect data at rest and in transit](protect-data-at-rest-and-in-transit.md) needs a wipe, and one wipe and one upgrade per node is less disruption than two.

### k3s, kubeadm or kind (gVisor)

1. Download a dated gVisor release and check it:

    ```sh
    URL=https://storage.googleapis.com/gvisor/releases/release/20261005/x86_64
    curl -fsSLO "$URL/gvisor.tar.bz2" && curl -fsSLO "$URL/gvisor.tar.bz2.sha512"
    sha512sum -c gvisor.tar.bz2.sha512
    tar -xjf gvisor.tar.bz2
    ```

2. Copy `runsc`, `containerd-shim-runsc-v1` and the `gvisor-bin` directory into `/usr/local/bin` on each node.
3. Add the `runsc` runtime to containerd. A configuration file that starts with `version = 2` takes [`containerd/runsc-config-v2.toml`](../../apps/unfold/ops/cluster/sandbox-runtimes/containerd/runsc-config-v2.toml); `version = 3` takes [`containerd/runsc-config-v3.toml`](../../apps/unfold/ops/cluster/sandbox-runtimes/containerd/runsc-config-v3.toml). k3s regenerates its file on start, so put the entry in `/var/lib/rancher/k3s/agent/etc/containerd/config.toml.tmpl` after `{{ template "base" . }}`.
4. Restart containerd and label the node: `kubectl label node <node> runtime.unfoldhq.dev/gvisor=true`.

### k3s or kubeadm (Kata)

Install Kata 4.3.0 or later with the project's `kata-deploy` Helm chart, which copies the runtime onto every node it selects and registers one containerd handler per enabled shim, named `kata-<shim>` ([kata-deploy](https://github.com/kata-containers/kata-containers/tree/main/tools/packaging/kata-deploy)). Enable only the Cloud Hypervisor shim of the Rust runtime and run its VMM as an unprivileged user:

```yaml
shims:
  disableAll: true
  clh-runtime-rs:
    enabled: true
    hypervisor:
      rootless: true
```

Set `handler: kata-clh-runtime-rs` in [`runtimeclasses/kata.yaml`](../../apps/unfold/ops/cluster/sandbox-runtimes/runtimeclasses/kata.yaml) and keep the name `kata`. Versions before 4.3.0 let any pod author override Kata's configuration through annotations, up to root on the node ([GHSA-37rf-pj8c-g5g3](https://github.com/kata-containers/kata-containers/security/advisories/GHSA-37rf-pj8c-g5g3)); step 3's annotation policy closes that on every version.

### GKE and AKS

* **GKE:** create the agent node pool with GKE Sandbox. Its gVisor type adds a RuntimeClass named `gvisor` itself, so skip `runtimeclasses/gvisor.yaml`; its microVM type adds `microvm`, which you use wherever this page says `kata`. MicroVMs need a Standard cluster with nested virtualization and do not block the metadata server, so keep Unfold's and Ploeg's egress policies on ([GKE Sandbox](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/sandbox-pods)).
* **AKS:** create an Azure Linux agent node pool on a Gen2 size with `--workload-runtime KataVmIsolation`. AKS adds the RuntimeClass `kata-vm-isolation`; use that name wherever this page says `kata`, including the admission policy. Arm64, host networking and Defender for Containers are not supported there ([Pod Sandboxing](https://learn.microsoft.com/en-us/azure/aks/use-pod-sandboxing)).
* **EKS:** no managed sandbox exists. Install gVisor on the nodes yourself, or Kata with kata-deploy on node groups that enable nested virtualization ([EC2 nested virtualization](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-ec2-nested-virtualization.html)).

## 3. Refuse Kata overrides, add the RuntimeClasses and prove each runtime

Apply the annotation policy before the first Kata pod runs:

```sh
kubectl apply -f admission/refuse-kata-annotations.yaml
```

Kata reads pod annotations under `io.katacontainers.` as overrides of its hypervisor, agent and runtime settings, kernel parameters among them. Talos's extension, which ships Kata 3.32, forwards all of them, and Kata before 4.3.0 checks only some: [GHSA-37rf-pj8c-g5g3](https://github.com/kata-containers/kata-containers/security/advisories/GHSA-37rf-pj8c-g5g3) (2026-10-21) shows a pod author reaching root on the node that way. No Unfold or Ploeg pod sets such an annotation, so the policy refuses every one, in every namespace.

Then:

```sh
kubectl apply -k runtimeclasses
kubectl apply -f smoke/gvisor.yaml
kubectl logs job/sandbox-smoke-gvisor
```

A working gVisor prints a kernel such as `4.19.0-gvisor` and `Starting gVisor...`, whatever the node runs. A working Kata prints a kernel version that differs from the node's own (`uname -r` on the node, or `talosctl -n <node> version`). A pod that stays in `ContainerCreating` with `no runtime for "kata" is configured` landed on a node without the handler: fix the label, not the pod.

Each RuntimeClass carries an `overhead` the scheduler adds to every pod: 100m CPU and 160Mi for Kata, measured on Cloud Hypervisor; 50m and 64Mi for gVisor. Without it, a node fills up with VMs the scheduler never counted.

## 4. Measure your own workload

```sh
kubectl apply -k bench
kubectl logs job/sandbox-bench-gvisor
```

The bench clones a repository, installs its dependencies (`npm ci` when it has a lockfile), runs its tests, and writes 20,000 small files, under runc, Kata and gVisor in turn, and prints one JSON line per phase. Run the Jobs one at a time on the same node; together they compete for its CPU. Set `BENCH_REPO` and `BENCH_REF` to one of your own repositories to see what your agents will feel. It reaches GitHub and the npm registry, so it needs egress the agent namespaces usually refuse; run it in a namespace of its own.

## 5. Point Unfold and Ploeg at the runtimes

In the Unfold chart's values:

```yaml
workspacePodRuntimeClassName: kata          # agent and export pods, pod provisioner
delivery:
  verifier:
    runtimeClassName: gvisor                # each check pod; default kata
ploeg:
  executor:
    runtimeClassName: kata                  # every Ploeg worker pod, unless its team or Role sets its own
```

* `workspacePodRuntimeClassName` takes one RuntimeClass for every workspace. Choosing it per session is not implemented yet.
* In live mode the Unfold chart refuses to render while the provisioner's RuntimeClass is empty: `workspacePodRuntimeClassName` for the pod provisioner, `workspaceRuntimeClassName` (default `kata`) for the sandbox provisioner. It never picks one for you, because a RuntimeClass your nodes lack leaves every workspace unable to start. To run workspaces without a sandbox anyway, on your own assessment, set `workspaceAllowUnsandboxed: true`; the install notes then print a warning.
* `ploeg.executor.runtimeClassName` sets the RuntimeClass of every Ploeg worker pod, under every executor: the default KEDA executor, the cron executor and the sandbox executor. A team's or a Role's own `runtimeClassName` overrides it. Under the sandbox executor, the older `executor.sandbox.runtimeClassName` and a team's or Role's `sandbox.runtimeClassName` are read first at each level. The sandbox executor needs the [agent-sandbox controller](../../apps/ploeg/docs/contracts/executor.md).
* Unfold's pod provisioner refuses `workspacePodRuntimeClassName` together with `workspaceUserNamespaces`, because the sandbox already maps the workload's users.
* Port-forwarding into a Kata or gVisor pod does not work. Unfold's default `workspaceTransport: pull`, where workspaces dial out to Unfold, works under both.

## 6. Refuse agent pods without a sandbox

Once every agent pod runs under a RuntimeClass:

```sh
kubectl apply -f admission/require-sandbox-runtime.yaml
```

A pod labelled `app.kubernetes.io/name` `unfold-agent`, `unfold-verifier` or `ploeg-worker` must then set `runtimeClassName` to `kata` or `gvisor`. Edit the list in the file if your RuntimeClasses have other names, and take `ploeg-worker` out while any Ploeg worker pod still resolves no RuntimeClass. The policy matches by label, so it catches a values file that lost its runtime, not someone who may create pods in the namespace and leaves the label off; keep pod creation there to Unfold's and Ploeg's own service accounts.

Check that the policy holds:

```sh
kubectl run probe --image=busybox --labels=app.kubernetes.io/name=unfold-agent --dry-run=server -- true
```

The API server answers `Forbidden ... must set runtimeClassName to kata or gvisor`.

## Troubleshoot

| Symptom | Cause | Fix |
| --- | --- | --- |
| `FailedCreatePodSandBox: no runtime for "<handler>" is configured` | The pod reached a node without the runtime | Label only nodes where `get extensions` or containerd's configuration shows the handler |
| A gVisor pod fails at start on Talos | `user.max_user_namespaces` is still 0 | Apply `talos/worker-runtimes.yaml` |
| Kata pods stay `Pending` with `Insufficient memory` | The RuntimeClass overhead counts against the node | Expected; size the node pool for it |
| Runtime alerts from Tetragon or Falco go quiet for agent pods | Host eBPF tools cannot see inside a Kata VM, and see only gVisor's own process for a gVisor pod | Expected; see [How agent code is contained](../concepts/how-agent-code-is-contained.md#what-you-can-still-see) |
| A workspace cannot be port-forwarded | Both runtimes break `kubectl port-forward` | Keep `workspaceTransport: pull` |
