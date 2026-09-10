# Live operation

Live mode runs paid or otherwise metered agent work. The intended first deployment is a private workbench on a remote server, then one configured Kubernetes environment. A browser on a laptop controls that deployment; the agent processes and repository checks run where the server/workspace backend runs.

Read [validation](../validation.md) for the actual qualification level. The local fixture demonstration does not validate these external integrations.

## First real OpenCode session

Prepare Node 24, Git and OpenCode `1.18.30`, the version pinned in the agent image. Register a repository the execution environment can clone. For the first qualification use a disposable public test repository; private forge credential provisioning is a separate deployment concern and must not inherit an operator's workstation login.

Prepare a LiteLLM proxy with virtual-key management enabled and a working model alias such as `coding`. The gateway must support the model's required tool calls. De Vloer uses the inference URL and a separately configurable management URL. Confirm model access and spend tracking in the gateway before supervising a paid session. The [LiteLLM virtual-key guide](https://docs.litellm.ai/docs/proxy/virtual_keys) documents the gateway prerequisites.

Copy the supplied non-secret configuration and set the repository URL, branch and verification argv:

```sh
cp config/live.example.json config/live.local.json
```

The minimal runtime selection is:

```json
{
  "kind": "opencode",
  "backend": "local",
  "binary": "opencode",
  "timeoutMs": 1200000
}
```

This is the `runtime` object, not a full configuration file, and it enables exactly one workspace backend. To offer a choice per session, list the enabled backends instead; the first entry is the default unless `backend` names another:

```json
{
  "kind": "opencode",
  "backends": ["docker", "local"],
  "timeoutMs": 1200000,
  "agentEnvironment": ["FORGEJO_AGENT_TOKEN"]
}
```

`agentEnvironment` is an allow-list of variable names copied from the server process into local and Docker workspaces. A launcher may read those values from OpenBao into its own shell; the configuration only names which of them an agent may see, and names carrying workbench, gateway, cluster or vault authority are refused at startup. Nothing here puts a value in a file. Sessions record their `placement`; the browser and editor show the selector only when more than one backend is enabled ([ADR 0009](../adrs/0009-workspace-placement-is-a-session-choice.md)).

`local` means local to the **De Vloer server**. A remote server with this backend already moves agent CPU, memory and repository checks off the operator's laptop. Use this backend only for trusted single-user development on a dedicated host. It separates working directories and selected environment variables, but runs under the control server’s OS user. Approved shell commands or repository scripts can access server files, process environments and sibling workspaces. This is not a boundary for protecting the master key against hostile code. Use the Kubernetes backend with the supplied separate namespace and pod restrictions for a shared team pilot.

Supply secrets through the deployment environment, or a private ignored `.env` for a single trusted server. `npm start` loads `.env` if present. Never put real credentials in checked-in JSON.

| Setting | Purpose |
| --- | --- |
| `VLOER_CONFIG` or `--config` | Configuration file path |
| `VLOER_ADMIN_NAME` | Initial administrator name; defaults to `admin` |
| `VLOER_ADMIN_PASSWORD` | Initial administrator password, at least 12 characters; creates the account only if absent |
| `VLOER_DATA_DIR` | Persistent state/workspace directory; defaults to `.vloer` |
| `VLOER_HOST`, `VLOER_PORT` | Bind address and port; default `127.0.0.1:4080` |
| `VLOER_BASE_URL` | Public HTTP(S) URL used for origin and secure-cookie behavior |
| `LITELLM_BASE_URL` | Agent inference endpoint, normally the gateway URL including `/v1` |
| `LITELLM_ADMIN_URL` | Management API root; defaults to inference URL with trailing `/v1` removed |
| `LITELLM_MASTER_KEY` | Gateway management credential held by the control plane |

Then start and sign in:

```sh
npm start -- --config config/live.local.json
```

Select the registered repository and delivery crew, authorize a small budget and start one session. Inspect actual tool activity, changes, verification output and the explicit review verdict. Exercise a human permission response when one occurs. Reload the browser to verify continuity. At completion verify the final spend state and gateway key revocation; `unknown` is a blocker to investigate, not zero cost. The default 60-second settlement delay is a configurable grace period for gateway reporting, not a guarantee that delayed upstream charges can never arrive. Qualify it against the gateway’s spend update interval; budget enforcement has the gateway’s concurrency and in-flight request limits.

The workspace manager starts an authenticated OpenCode server per managed workspace and injects a session-scoped LiteLLM inference key. Do **not** set `OPENCODE_URL` for this managed path. Although configuration can describe an external endpoint, v0.1 rejects giving a managed session credential to a shared pre-existing OpenCode server. Use local provisioning on the remote host or Kubernetes provisioning.

For another operator, run `npm run user:add` against the same `VLOER_DATA_DIR` while the server is stopped, then restart it. The helper asks for a name and role and generates a password shown once unless `VLOER_USER_PASSWORD` is supplied through the environment. Keep that output private. This is local account provisioning; SSO and shared session membership are not implemented.

## Docker on the workbench host

The `docker` backend runs the clone and the OpenCode server inside a container from the pinned agent image, through the Docker Engine socket. The workbench never invokes a shell or the Docker CLI. Build the image once from the repository and reference it by tag, or pull a digest-pinned build from the registry:

```sh
docker build -t de-vloer-agent:1.18.30 ops/agent
```

The Dockerfile pulls its hardened base through `harbor.webgrip.dev/dhi`, which is reachable on the LAN; pass `--build-arg REGISTRY_DHI=<your-proxy>` elsewhere. Released builds are at `harbor.webgrip.dev/webgrip/de-vloer-agent:<version>`, signed and within a zero critical, zero high CVE budget ([releases](release.md)).

Add a `docker` block next to `runtime`:

```json
{
  "image": "de-vloer-agent:1.18.30",
  "cpus": 2,
  "memoryMb": 4096,
  "pidsLimit": 512,
  "network": "bridge",
  "gatewayUrl": "https://litellm.example/v1"
}
```

`socketPath` defaults to `/var/run/docker.sock`. `gatewayUrl` overrides the inference URL seen inside containers when the gateway address differs from the host's view, for example `http://host.docker.internal:4000/v1` for a gateway on the workbench host; the containers always get `host.docker.internal` mapped to the host. `user` pins the container uid; on Linux the workbench's own uid and gid are used so the bind-mounted session directory stays readable for candidate capture, and on macOS Docker Desktop the image's `node` user is fine. Each session gets one container named after its workspace, bind-mounted to `<dataDir>/workspaces/<session>`, with a read-only root filesystem, all capabilities dropped, no new privileges, a CPU, memory and PID budget, and the OpenCode port published only on `127.0.0.1` behind a per-session random password. The only credential inside is the session's scoped LiteLLM key plus whatever `agentEnvironment` allows. Container egress follows the Docker network it joins; restrict it by pointing `network` at a network you control.

Set `"transport": "pull"` in the `docker` block to let the container dial out instead of publishing a port. The container then runs the relay worker baked into the agent image, polls `docker.relayUrl` (default `http://host.docker.internal:<port>`) with a per-session token and forwards requests to OpenCode on its own loopback. On macOS Docker Desktop that reaches a workbench bound to `127.0.0.1`; on Linux bind the workbench to an address the Docker network can reach. Nothing is published on the host in pull mode ([ADR 0011](../adrs/0011-sandboxes-dial-out-through-a-relay.md)).

Candidate capture stops the container, confirms the stop and snapshots the host directory. The container is removed on disposal; the session directory is retained like the local backend's. Reproduce the no-inference qualification against your image with:

```sh
node scripts/probe-docker.mjs de-vloer-agent:1.18.30
```

The probe serves a fixture repository to the container, verifies the hardened container configuration, authenticated health, managed configuration, adapter session creation, the event stream, abort, candidate capture and container removal, and records that zero inference requests reached its sink.

## Kubernetes

Deployment assets live under `ops/helm/de-vloer`; the application Dockerfile and `ops/agent/Dockerfile` build separate control-plane and agent images. Build and publish them to an authorized registry, then configure explicit image tags or digests in values. The supplied configuration is an example, not the user's actual cluster inventory.

Validate manifests before installation:

```sh
helm lint ops/helm/de-vloer
helm template de-vloer ops/helm/de-vloer > /tmp/de-vloer-rendered.yaml
```

The chart defaults to **demo** mode. Copy `ops/helm/de-vloer/values.live.example.yaml` to a private `values.live.local.yaml` and replace its example registry, forge, gateway/model and network selectors. Configure `credentialsSecret` in the application namespace with the environment variables listed above. Keep the master key out of the workspace namespace. Configure `workspaceGitSecretName` only when a dedicated repository read credential has been provisioned there. `workspaceAgentSecrets` lists Secrets in the workspace namespace whose keys become environment inside the agent container only, never the clone container; an External Secret from OpenBao is the intended way to let an agent pod reach something beyond the repository and the gateway.

Use **one application replica** with persistent storage and the chart's `Recreate` rollout strategy. Configure a separate workspace namespace, storage class/size, CPU/memory requests, an agent image and an inference gateway URL reachable by agent Pods. The control plane needs the chart's narrowly scoped workspace-management RBAC. Agent Pods must not mount the control-plane service account or LiteLLM master credential.

Review the live render with the deployment's own values:

```sh
helm lint ops/helm/de-vloer -f values.live.local.yaml
helm template de-vloer ops/helm/de-vloer --namespace de-vloer -f values.live.local.yaml > /tmp/de-vloer-live.yaml
```

After the images, namespace policy, persistent storage and application Secret are prepared, an authorized operator can install the reviewed configuration:

```sh
helm upgrade --install de-vloer ops/helm/de-vloer --namespace de-vloer --create-namespace -f values.live.local.yaml
```

The manager provisions real Kubernetes resources through the API. It retains workspace PVCs after runtime disposal so changes and native state can survive; volume retention has an operational cost. Cleanup policy must preserve reviewable work before deleting retained volumes. Configure `workspaceEgress` for the actual forge and inference gateway; example selectors are not universal access rules. Kubernetes network isolation depends on the cluster's network-policy implementation, so chart rendering cannot prove enforcement.

`workspaceTransport: pull` (the chart default) makes agent pods dial out to the workbench Service instead of receiving a Service and an ingress rule; `workspaceRelayUrl` overrides the address the pods use. Candidates are then captured in place through the relay, without an export pod. `workspaceProvisioner: sandbox` switches from hand-rolled pods to the agent-sandbox CRDs: a `Sandbox` per session under `workspaceRuntimeClassName` (default `kata`), or, with `workspaceWarmPool` set, a `SandboxClaim` against a warm pool whose pods receive their session over the relay. The controller, the template and the pool token are cluster concerns described in [ops/cluster/agent-sandbox](../../ops/cluster/agent-sandbox/README.md) and [ADR 0013](../adrs/0013-sandbox-crd-placement-with-warm-kata-pools.md); the workbench needs `VLOER_POOL_TOKEN` in its credentials Secret for the warm path.

The in-cluster workbench is the supported way to use the Kubernetes backend. A workbench on a workstation cannot drive a pod through the API server's service proxy, because the API server strips the `Authorization` header that OpenCode's Basic authentication needs; a port-forward transport under the operator's own identity is the identified next step and is not implemented. The estate's `agent-runner` image is Ploeg's unattended OpenHands body and contains no OpenCode server, so it is not a workspace image for De Vloer; publish `ops/agent/Dockerfile` as its `opencode-runner` sibling instead.

Before a team rollout, qualify Pod startup/readiness, repository cloning, model requests, interruption, permission handling, restart recovery, spend settlement and resource cleanup on the target cluster. Record the tested image digests, Kubernetes version, gateway version and result in [validation](../validation.md). No automated chart command deploys this application.

## Another harness through the command bridge

Set `runtime.kind` to `command`, `backend` to `local`, and `command` to an administrator-controlled argv array such as `["/opt/company-agent/runner"]`. This process runs in the session checkout on the De Vloer server. It is not executed through a shell, and operators cannot supply arbitrary executable paths through the session form.

The bridge sends a versioned `start` JSON line on stdin, forwards human responses, and expects normalized event lines plus one terminal result and exit code zero. Cancellation sends a cancel line before process termination. The exact protocol and exercised adapter evidence are in [agent API research](../research/agent-apis.md). An OpenHands SDK wrapper can implement this seam; the existence of the seam does not mean every harness or SDK version has been tested.

## Routine intervention and recovery

- To steer a running role, pause, record the instruction and explicitly resume. Preserve the original objective history and authorization.
- If a reviewer requests changes or gives no conclusive approval, inspect the findings and decide the next task. There is no automatic unlimited review loop.
- If the server restarts, active sessions become interrupted. Inspect retained changes, resolve uncertain spend and explicitly resume. Do not create a replacement session to bypass accounting.
- To add budget, an administrator authorizes a positive increment within the total configured limit. Active spending may need to be paused and reconciled first.
- Back up SQLite consistently using a SQLite-aware snapshot or by stopping the single server before copying the database and associated files. Preserve retained workspace/PVC evidence separately and test restore before relying on it.

Subscription authentication is not provided by this managed path. If a harness later supports an upstream-approved personal subscription flow, it still needs separate visible identity/quota semantics; it does not become a pool of LiteLLM API credit. Use API-backed gateway credentials for the currently implemented managed model budget.

## Attaching VS Code as an agent host client

The workbench serves the Agent Host Protocol on its own port. Create a personal connection token, then add the printed entry to the `chat.remoteAgentHosts` setting in VS Code 1.136 or later:

```sh
curl -sS -X POST -H 'X-Vloer-Request: 1' -H 'Content-Type: application/json' -b "$COOKIE" \
  http://127.0.0.1:4080/api/agent-host/tokens -d '{"label":"laptop"}'
```

The response contains `address` and a ready-made `vscodeSetting.entry` with the token. Sessions appear in VS Code's agent sessions list; a new session asks for repository, crew, budget and placement, and its first message starts the crew. Every other client attached with a token of the same user sees the same session. Tokens are bound to the user who created them and honour the same ownership rules as the HTTP API ([ADR 0012](../adrs/0012-agent-host-protocol-host.md)). Whether a given VS Code build offers plain WebSocket hosts in its picker is not something this repository can verify; the setting itself is read by the 1.136 client.

## Verifying a candidate

Every ready candidate ships a signed provenance statement and an Agent Trace record. Download all five formats and the public key, then verify offline:

```sh
node scripts/verify-candidate.mjs ./candidate de-vloer-attestation.pub
cosign verify-blob-attestation --key de-vloer-attestation.pub --signature candidate.attestation.json \
  --type https://webgrip.dev/attestations/agent-candidate/v1 --insecure-ignore-tlog manifest.json
```

The script recomputes the bundle, patch and manifest digests, checks both DSSE signatures against the key and confirms the attested commit matches the manifest. The key is generated on first use in the data directory; back it up with the database and treat its loss as a re-keying event ([ADR 0014](../adrs/0014-signed-candidates.md)).
