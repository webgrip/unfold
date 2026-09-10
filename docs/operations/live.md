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

## A second estate as a profile

A profile is a config file plus a launcher; nothing in the source knows which estate it serves. The webgrip pilot runs on port 4080 with its data under `.vloer`, and a acme profile runs beside it on 4081 with its data under `.vloer/second`, each pointing at its own LiteLLM, task source, repositories and Ploeg. Both files are ignored by Git (`config/*.local.json`, `*.local.sh`) so no estate detail is committed.

The launcher resolves every secret from the estate's OpenBao at start and exports it for the process. the second estate's OpenBao authenticates on the `authentik/` mount with one role per team, and only the `admin` role reads outside `secret/teams/<team>/*`, so the launcher logs in with `bao login -method=oidc -path=authentik role=admin` ([acme authentication](https://gitlab.com/acme/internal/platform/-/blob/main/docs/general/authentication.md)). The retired `oidc/` mount answers 403 to a login attempt, which reads like a policy problem and is a wrong path.

A private repository over HTTPS needs a credential the workspace can use without a token in the URL, which the config rejects, and without an askpass, which the Docker backend does not carry. Git reads configuration from `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n` and `GIT_CONFIG_VALUE_n` even under the `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` the clone step sets ([git config environment](https://git-scm.com/docs/git-config#ENVIRONMENT)). The launcher sets `http.https://gitlab.com/.extraheader` to a basic authorization header built from the token, plus the committer identity, and the profile allows those names in `agentEnvironment`. The clone, the push and the merge-request call then work with no code change.

That token is the one credential a sandbox holds beyond its inference key, and a crew that pushes its own branch and opens the merge request is the compatibility mode [ADR 0006](../adrs/0006-trusted-verifier-and-publisher.md) describes: it cannot claim the fencing guarantee. Use a project access token scoped to the one repository with `api` and `write_repository` and a short expiry, never a shared estate token. The [model gateway capabilities](../product/model-gateway-capabilities.md) page records the path that removes the token entirely, forge tools served through the gateway's MCP surface and granted per key.

## What the crew did

The Activity stream shows one card per tool call with its status; open it for the input, the output and the error when it failed. A read role's search tools depend on ripgrep, which the agent image now installs, so a session on an image built before 2026-09-10 shows every grep and glob failing with exit code 127 and the crew falling back to reads alone. The Handoff tab carries a transcript per role with the model that answered each message. The budget panel lists which models the gateway actually used, with the routed group when the session named an auto-router, and what each cost. The Gateway tab answers the provenance questions per request: which provider and endpoint served it and in which region, why the auto-router chose that tier and what it saved, whether the gateway retried, fell back, hit its cache or applied a guardrail, how long the request took and when the first token arrived, which harness version called, and the gateway call id to find the span in the estate's trace store. A refused request shows the gateway's error class, so a budget ceiling or a provider outage is visible where it happened.

## Linking the estate's observability

A profile can point the workbench at the estate's Grafana so every session links out to where the rest of the evidence lives:

```json
"observability": { "grafanaUrl": "https://grafana.example", "dashboards": { "spend": "litellm", "reliability": "litellm-reliability", "finops": "finops-fleet" }, "tracesDatasource": "victoriatraces", "logsDatasource": "victorialogs" }
```

The Environment view lists the dashboards, the budget panel links to the spend board whose "Cost per run" table is keyed by the session's key alias, and the Gateway tab opens Grafana Explore on the trace and log datasources for the session's time window, or for one request's window from its row. The default trace query selects the gateway's service and the default log query its namespace and container; `traceQuery` and `logsQuery` override them and may use `{callId}`, `{alias}` and `{sessionId}` once the estate records the gateway call id as a span attribute or log field. At acme the spend board's per-run rows come from the ledger exporter, which reads the gateway's request log by key alias, so a session's cost survives the revocation of its key.

## Seeing what the gateway dropped

The gateway drops request parameters a provider does not accept, and it does not record what it dropped. acme therefore serves strict twins of its Anthropic aliases, `claude-sonnet-5-strict` and `claude-haiku-4-5-strict`, with dropping off: a request that carries an unsupported parameter fails with a 400 the ledger records. Run the same objective once on the plain alias and once on the strict twin, then compare the two sessions; a refusal on the strict side with an otherwise identical brief names the parameter the plain side silently lost.

## Comparing two ways of running the same objective

A session can pin one configured model for every role from the new-session form, so an objective can be run once on `auto` and once on a pinned model, or once on Anthropic and once on a Fireworks model. From either session, "Compare with another session" opens a side-by-side table built from the gateway ledger and the recorded runs: outcome and final verdict, wall time, requests and refusals, the providers and models that answered, tokens, cost, router savings, median time to first token and the number of change artifacts. Cells that differ are highlighted. Compare sessions with the same objective and crew; the table does not normalise for different briefs.

## Keeping inference where policy allows

A profile can name the providers and regions the gateway may route a session to:

```json
"gatewayPolicy": { "providers": ["anthropic", "fireworks_ai"], "regions": ["eu"] }
```

The provider rule is enforced before the first turn, from the gateway's model catalogue, including every tier behind an auto-router; a session whose crew names a model served elsewhere does not start. The region rule can only be checked against what the gateway attributes after a request, so a violation stops the session at the next ledger read and revokes its key, and the Gateway tab marks the row. The names are the gateway's own: `anthropic`, `fireworks_ai`, and regions such as `global` or `eu` as the provider reports them. Anthropic's public endpoint reports `global`, so a profile that requires `eu` needs a gateway route to a regional endpoint first.

Each role's brief is recorded with the run and shown in the Activity stream, and the budget panel draws cumulative cost against the ceiling from the gateway's rows.

## Approving tool use

Every OpenCode session starts with `ask` for every tool, so each read, search and shell command waits for the operator. That is the right default on the `local` backend, where the crew shares the workbench's files. In a container or a pod the sandbox is the boundary, so a session there can be created with automatic approval, or switched to it from the decision panel while it runs. The switch answers the permissions already waiting and creates later roles with allow rules; read roles still cannot edit or run commands, and a crew's questions still wait for a person. Automatic approval is refused on the `local` backend.

Budgets are enforced by the gateway key, so a session whose ceiling is reached fails mid-turn with `budget_exhausted`, and the spend shown while it runs is the gateway's live attribution, which settles a minute later. Size the budget to the crew: reading a repository with a Sonnet-class model costs a few cents per turn, and an investigation crew can spend a quarter in under a minute.

## Signing in with the estate

Register the workbench as an OAuth2 application at the estate's Authentik: a public client with PKCE, so no secret exists, client id `vloer`, redirect URI `<baseUrl>/api/auth/oidc/callback` matched strictly, the `openid`, `email` and `profile` scopes so groups are sent, and one scope mapping that turns membership into a role claim. At acme that is a blueprint in the Authentik blueprints ConfigMap next to the other applications, with groups `vloer-admins` and `vloer-operators` granted through the entitlements model rather than by hand. The profile then carries:

```json
"auth": { "oidc": { "issuer": "https://auth.example/application/o/vloer/", "clientId": "vloer", "displayName": "Authentik" } }
```

Optional keys: `roleClaim` (default `vloer_role`), `groupsClaim` (default `groups`), `roles` mapping each of admin, operator and viewer to group names (defaults `vloer-admins`, `vloer-operators`, `vloer-viewers`), `scopes`, and `clientSecretEnv` for a confidential client. Who can sign in is decided by the provider: at acme only Workspace accounts reach enrolment, and a person who signs in without one of the admitted groups is refused by the workbench with a message naming the group to ask for. The local password stays as the bootstrap administrator's door and for the editor extension until it gains a device flow.

## Linking GitLab

Register one OAuth application per workbench in GitLab, under your user or the group that owns the repositories ([GitLab OAuth applications](https://docs.gitlab.com/integration/oauth_provider/)): redirect URI `<baseUrl>/api/links/gitlab/callback`, confidential off, scopes `read_api`, `read_repository` and `write_repository`. The application ID is not a secret. Put it in the profile as `links.gitlab.clientId`, or export `VLOER_GITLAB_CLIENT_ID`, and set `links.gitlab.baseUrl` for a self-hosted GitLab. `baseUrl` on the workbench must match what the browser uses, because it forms the redirect URI.

Each person then opens Linked accounts, links GitLab, and approves the application once. From then on a session on a repository from that GitLab clones with their token, which reaches only the clone step. The person can unlink at any time, which also revokes the tokens at GitLab.

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

The chart defaults to **demo** mode. Copy `ops/helm/de-vloer/values.live.example.yaml` to a private `values.live.local.yaml` and replace its example registry, forge, gateway/model and network selectors. Configure `credentialsSecret` in the application namespace with the environment variables listed above. Keep the master key out of the workspace namespace. Configure `workspaceGitSecretName` only when a dedicated repository read credential has been provisioned there. `workspaceUserNamespaces` maps the workspace pod into its own user namespace (`hostUsers: false`), so the container's root is an unprivileged uid on the node; user namespaces are generally available from Kubernetes 1.36 and the cluster's container runtime must support them, so it is opt-in and refused together with the sandbox provisioner, where the guest kernel already provides that boundary. `workspaceAgentSecrets` lists Secrets in the workspace namespace whose keys become environment inside the agent container only, never the clone container; an External Secret from OpenBao is the intended way to let an agent pod reach something beyond the repository and the gateway.

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

The De Vloer extension in [extensions/vscode](../../extensions/vscode/README.md) is the other way in, and it now mirrors what the browser shows for a 0.3.0 server: the same run labels (implementation, analysis, independent review), the brief each role received, tool input and error text in the Activity tab, a Gateway tab with the gateway's per-request attribution, the spend observed at the gateway with the cost curve, transcripts, the approval switch for `docker` and `kubernetes` sessions, and GitLab linking through **Vloer: Linked Accounts**. Both clients read the same API and event stream, so a session opened in one is the same session in the other.

## Verifying a candidate

Every ready candidate ships a signed provenance statement and an Agent Trace record. Download all five formats and the public key, then verify offline:

```sh
node scripts/verify-candidate.mjs ./candidate de-vloer-attestation.pub
cosign verify-blob-attestation --key de-vloer-attestation.pub --signature candidate.attestation.json \
  --type https://webgrip.dev/attestations/agent-candidate/v1 --insecure-ignore-tlog manifest.json
```

The script recomputes the bundle, patch and manifest digests, checks both DSSE signatures against the key and confirms the attested commit matches the manifest. The key is generated on first use in the data directory; back it up with the database and treat its loss as a re-keying event ([ADR 0014](../adrs/0014-signed-candidates.md)).
