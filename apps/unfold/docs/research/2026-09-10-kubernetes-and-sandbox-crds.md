# Kubernetes features and the Sandbox CRDs for agent workspaces

Research date: 2026-09-10. The homelab cluster runs Talos 1.13.7 with Kubernetes 1.36.4, Cilium, and the siderolabs Kata extension. This note records what a per-session agent workspace can use today, what 1.37 added, and the exact API shapes of the agent-sandbox CRDs the `sandbox` provisioner targets.

## Kubernetes releases

| Feature | KEP | Gate | Stage by version |
| --- | --- | --- | --- |
| User namespaces (`hostUsers: false`) | 127 | `UserNamespacesSupport` | beta 1.30 to 1.35, GA 1.36 |
| Rootless kubelet | | `KubeletInUserNamespace` | beta 1.37 |
| WebSocket port-forward | 4006 | `PortForwardWebsockets` | GA 1.35 (`v5.channel.k8s.io`) |
| In-place pod resize | 1287 | `InPlacePodVerticalScaling` | GA 1.35 |
| Pod-level resources | 2837 | `PodLevelResources` | beta 1.34, still beta 1.37 |
| Image volumes (OCI artifacts as volumes) | 4639 | `ImageVolume` | GA 1.36; `ImageVolumeWithDigest` alpha 1.35 |
| Container checkpoint | 2008 | `ContainerCheckpoint` | beta since 1.30 |
| Pod checkpoint and restore over CRI | 5823 | | alpha 1.37 |
| Pod certificates (`PodCertificateRequest`, projected `podCertificate`) | 4317 | `PodCertificateRequest` | beta 1.35, GA 1.37 |
| ClusterTrustBundle | 3257 | `ClusterTrustBundle` | GA 1.37 |
| External ServiceAccount token signer | 740 | `ExternalServiceAccountTokenSigner` | GA 1.36 |
| `procMount: Unmasked` | 4265 | `ProcMountType` | GA 1.36 |
| `supplementalGroupsPolicy` | 3619 | `SupplementalGroupsPolicy` | GA 1.35 |
| Dynamic Resource Allocation | 4381 | `DynamicResourceAllocation` | GA 1.34; extended resources, device taints and claim status GA 1.37 |
| Sidecar containers | 753 | `SidecarContainers` | GA 1.33 |
| Container restart rules | 5307 | `ContainerRestartRules` | beta 1.35; `RestartAllContainersOnContainerExits` beta 1.36 |
| Sandbox-creation condition | 3085 | `PodReadyToStartContainersCondition` | GA 1.37 |
| Memory QoS on cgroup v2 | 2570 | `MemoryQoS` | beta 1.37 |
| Gang scheduling and the Workload API | 4671 | | beta 1.37 |

Sources: the [1.34](https://kubernetes.io/blog/2025/08/27/kubernetes-v1-34-release/), [1.35](https://kubernetes.io/blog/2025/12/17/kubernetes-v1-35-release/), [1.36](https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/) and [1.37](https://kubernetes.io/blog/2026/08/26/kubernetes-v1-37-release/) release posts and the [feature gate reference](https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/). 1.37 shipped on 2026-08-26 with 16 stable, 23 beta and 27 alpha enhancements; no 1.38 schedule was published at research time. There is no Kubernetes API called Sandbox; the only sandbox-named items are the readiness condition and the CRI checkpoint RPCs.

What this means for De Vloer on 1.36 today: `hostUsers: false` is safe to set on every plain-container workspace pod; image volumes can mount a released candidate bundle or a skills bundle as a read-only volume without an init container; the external token signer and node-bound tokens harden the control plane's identity. Worth planning for the 1.37 upgrade: pod certificates give each agent pod an mTLS identity the relay could verify instead of a bearer token; pod checkpoint over CRI is the first API-level route to a forensic snapshot of a running workspace, which Kata pods cannot use, so a Kata snapshot still needs the hypervisor.

## agent-sandbox v1.0.x

Released v1.0.0 on 2026-08-28 and v1.0.1 on 2026-09-03 ([releases](https://github.com/kubernetes-sigs/agent-sandbox/releases)). Only `v1beta1` remains. Install with `sandbox-with-extensions.yaml` from the release, which creates the `agent-sandbox-system` namespace, the CRDs `sandboxes.agents.x-k8s.io` and `sandboxclaims`, `sandboxtemplates`, `sandboxwarmpools.extensions.agents.x-k8s.io`, and the controller with cluster-wide rights on pods, services, claims, leases and network policies. A Helm chart ships in the repository without an OCI publication.

`Sandbox` ([types](https://github.com/kubernetes-sigs/agent-sandbox/blob/v1.0.1/api/v1beta1/sandbox_types.go)): `spec.podTemplate` with a full pod spec, `spec.volumeClaimTemplates`, `spec.service` to toggle the headless Service, `spec.shutdownTime` and `spec.shutdownPolicy` (`Delete` or `Retain`), `spec.operatingMode` (`Running` or `Suspended`). Status carries `serviceFQDN`, `podIPs`, `nodeName` and conditions `Ready`, `Suspended`, `PodScheduled` and `Finished`. A Sandbox is a singleton; replicas live on the warm pool.

`SandboxTemplate` adds `networkPolicy`, `networkPolicyManagement` (`Managed` creates one shared policy per template; the default with no policy is ingress only from the router and egress to the public internet with RFC1918 blocked), `envVarsInjectionPolicy` and `volumeClaimTemplatesPolicy`. `SandboxWarmPool` has `spec.replicas`, `spec.sandboxTemplateRef.name` and `spec.updateStrategy.type` (`Recreate` or `OnReplenish`) with a scale subresource. `SandboxClaim` has `spec.warmPoolRef.name`, `spec.lifecycle` with `shutdownTime`, `ttlSecondsAfterFinished` and `shutdownPolicy`, optional `spec.env` and `spec.volumeClaimTemplates` which force a cold start, and a status with `sandbox.name`, `sandbox.podIPs` and `sandbox.serviceFQDN`. Binding adopts a pre-created pool Sandbox with an optimistically locked owner change; a conflict surfaces as `AdoptionConflict` and retries.

The router (`sandbox-router-svc:8080`) proxies by `X-Sandbox-ID`, `X-Sandbox-Namespace` and `X-Sandbox-Port`, supports path routing for browsers and WebSockets, and authorises with `allow-all`, `tokenreview` or a scoped HMAC token with cookie hand-off. `sandboxd` is an optional in-pod daemon with gRPC process control and a REST file API, without authentication of its own. Both Kata and gVisor guides note that pod port-forward does not work under those runtimes; the router or a dial-out worker is the way in.

De Vloer's `sandbox` provisioner uses none of the inbound paths: the pod dials out to the workbench relay, so the router, the Service and per-session network ingress are unnecessary, and a warm pod receives its session over that channel after the claim binds.

## Kata on Talos

Kata 4.0.0 (2026-07-20) made runtime-rs the default and 4.1.0 (2026-08-21) added OpenVMM. The siderolabs extension still builds the 3.x Go shim: `KATA_CONTAINERS_VERSION: 3.32.0` on `main` with Cloud Hypervisor, virtiofsd, kernel and rootfs from the upstream static tarball and QEMU alongside; two handlers exist since extensions v1.14.0, `kata` (Cloud Hypervisor) and `kata-qemu` ([container-runtime/vars.yaml](https://github.com/siderolabs/extensions/blob/main/container-runtime/vars.yaml), [PR #1157](https://github.com/siderolabs/extensions/pull/1157)). Defaults are one vCPU and 2 GiB per VM with virtio-fs. Known issues: Kata pods lose ingress when `net.core.default_qdisc=fq` combines with RX timestamping ([talos#13745](https://github.com/siderolabs/talos/issues/13745), closed), the arm64 shim is dynamically linked against musl ([extensions#1109](https://github.com/siderolabs/extensions/issues/1109), open), and Cloud Hypervisor VM exits under heavy parallel load ([kata#12801](https://github.com/kata-containers/kata-containers/issues/12801)). The cluster's RuntimeClass is named `kata` with handler `kata`.

## Anthropic's self-hosted sandbox protocol

Documented in [self-hosted sandboxes](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes) and the [environments API](https://platform.claude.com/docs/en/api/beta/environments). An environment key scoped to one queue is the only credential on the worker. The worker polls `GET /v1/environments/{env}/work/poll` with `block_ms` and `reclaim_older_than_ms`, acks a work item, heartbeats with `expected_last_heartbeat` (a mismatch returns 412 and the lease is lost), streams the session's events, executes bash and file tools locally, posts results as `user.tool_result` events and stops the item when done. Network is outbound HTTPS only. The [agent-sandbox recipe](https://agent-sandbox.sigs.k8s.io/docs/use-cases/anthropic-managed-agents/) pairs a dispatcher that turns queued work into `SandboxClaim`s with a stats adapter that scales the warm pool.

De Vloer mirrors the shape rather than the API: the relay's pool endpoint is the queue, the pod name is the worker identity, the assignment carries the session and its credentials, and the agent harness stays inside the pod. The ideas taken are the outbound-only network requirement and the per-run credential that is scoped to one queue, not to the organisation.
