# Sandbox runtimes for agent pods

These manifests give a cluster the two sandbox runtimes Unfold and Ploeg run agent code under, Kata Containers and gVisor, and an admission policy that refuses an agent pod on the node's default runtime. Neither chart applies them: a RuntimeClass and a node's container runtime are cluster concerns. The guide that walks through them is [Run agent code in a sandbox runtime](../../../../../docs/how-to/run-agent-code-in-a-sandbox-runtime.md); why there are two runtimes is in [How agent code is contained](../../../../../docs/concepts/how-agent-code-is-contained.md) and [system ADR-0045](../../../../../docs/adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md).

| Path | What it is | Apply it |
| --- | --- | --- |
| `runtimeclasses/` | RuntimeClass `kata` (handler `kata`) and `gvisor` (handler `runsc`), each with its measured pod overhead and a node selector on a capability label | `kubectl apply -k runtimeclasses` |
| `admission/refuse-kata-annotations.yaml` | A ValidatingAdmissionPolicy that refuses any pod with an `io.katacontainers.` annotation, which Kata before 4.3.0 and Talos's extension let a pod author use to reach root on the node ([GHSA-37rf-pj8c-g5g3](https://github.com/kata-containers/kata-containers/security/advisories/GHSA-37rf-pj8c-g5g3)) | `kubectl apply -f`, before the first Kata pod |
| `admission/require-sandbox-runtime.yaml` | A ValidatingAdmissionPolicy that makes agent pods (`app.kubernetes.io/name` of `unfold-agent`, `unfold-verifier` or `ploeg-worker`) set `runtimeClassName` to `kata` or `gvisor` | `kubectl apply -f`, after every agent pod already sets a runtime |
| `smoke/` | One Job per runtime that prints the kernel it sees | `kubectl apply -f smoke/gvisor.yaml` |
| `bench/` | The same clone, `npm ci`, test and 20,000-file workload under runc, Kata and gVisor, one JSON line per phase | `kubectl apply -k bench` |
| `talos/` | An Image Factory schematic with both extensions, a worker patch with the sysctl and labels, and STATE and EPHEMERAL encryption with a TPM or a node-derived key | see the guide |
| `containerd/` | The `runsc` runtime entry for containerd's version 2 and version 3 configuration files, for clusters that are not Talos | see the guide |

## Labels

A RuntimeClass schedules only onto nodes labelled `runtime.unfoldhq.dev/kata: "true"` or `runtime.unfoldhq.dev/gvisor: "true"`. Label a node only after its runtime is installed and its smoke Job passed; a pod sent to a node without the handler waits in `ContainerCreating` with `no runtime for "kata" is configured`. A cluster that already has its own capability label changes the selector in the RuntimeClass, not the label on the node.

## The admission policy

Ploeg renders a RuntimeClass only under its `sandbox` executor (`executorType: sandbox`, then `sandbox.runtimeClassName` per team or Role). A Ploeg team on the default KEDA executor starts its worker pods without one, and the policy refuses them. Remove `ploeg-worker` from the list in `admission/require-sandbox-runtime.yaml` until every team uses the sandbox executor.

The policy matches pods by label. It stops a configuration mistake, such as a values file that drops the runtime; it does not stop someone who may create pods in the namespace and leaves the label off. Restrict who may create pods there with RBAC.

The policies are native `admissionregistration.k8s.io/v1` objects, generally available since Kubernetes 1.30, so they need no Kyverno or Gatekeeper.

## What was checked

On 2026-10-24, on kind 0.33.0 (Kubernetes 1.37.0, containerd 2.3.4, host kernel 6.8) with gVisor `release-20261005.0` installed by hand as the guide's containerd path describes:

* `smoke/gvisor.yaml` completed and printed `kernel=4.19.0-gvisor` and `Starting gVisor...` on a host whose kernel is 6.8.
* The admission policy refused an `unfold-agent` and a `ploeg-worker` pod without a runtime, admitted an `unfold-agent` pod under `gvisor` and an unlabelled pod under runc, and refused an `io.katacontainers.` annotation, all with `kubectl apply --dry-run=server`.
* `talos/worker-runtimes.yaml` with each encryption patch passed `talosctl validate --mode metal` (talosctl 1.13.4), and the Image Factory accepted `talos/schematic.yaml` as schematic `e77adcb5f09fa573372ec1a870b07120dd9378bef391069c1f6073e9fa24cc96`.

Kata was not run from this directory. The same RuntimeClass shape has run Unfold's workspaces and Ploeg's sandboxes on the homelab's Talos workers since homelab-cluster ADR-0070. gVisor has not run on Talos here yet.
