# Unfold Helm chart

This chart installs Unfold, Ploeg's front end: one workbench Deployment with a persistent volume, its Service, and, in live mode, the RBAC it needs to manage agent workspaces in a separate namespace. It also carries the Ploeg release this Unfold release was tested with, as the `ploeg` dependency (see [Ploeg](#ploeg)).

By default it runs the deterministic **demo**, which needs nothing outside the cluster except the public image and a default StorageClass, once `ploeg.enabled` is `false`. The demo says it is one and makes no model calls.

## Images

| Image | Default | Notes |
| --- | --- | --- |
| Workbench | `ghcr.io/webgrip/unfold@<digest>` | Public. The published chart sets `image.tag` to its version and `image.digest` to the digest the release pushed. Harbor and Forgejo hold the same signed digest; see [release artifacts](../../../../../docs/operations/artifacts.md). For a private copy set only `image.repository` and `imagePullSecrets`: the digest stays. |
| Workspace (live mode) | `ghcr.io/webgrip/unfold-agent:<version>@<digest>` | The published chart sets `workspaceAgentImage.tag` to its version and `workspaceAgentImage.digest` to the digest the release pushed. For a private copy set only `workspaceAgentImage.repository` and `workspaceImagePullSecrets`: the version and digest stay. `workspaceImage`, when set, replaces the whole reference and pins it. |

The chart in this repository leaves `image.tag`, `image.digest`, `workspaceAgentImage.tag`, `workspaceAgentImage.digest` and `workspaceImage` empty and renders the tag of its `appVersion`. Only the release fills them, after every image is pushed ([publication order](../../../../../docs/operations/ci.md#publication-and-recovery)), so set none of them in a cluster that installs a published chart.

## Demo install

```sh
helm install unfold oci://ghcr.io/webgrip/charts/unfold --version <version> -n unfold --create-namespace --set ploeg.enabled=false
```

## Ploeg

`Chart.yaml` depends on `ploeg` from `oci://ghcr.io/ploeg-hq/charts` at exactly the release [apps/unfold/ploeg-release.json](../../../ploeg-release.json) pins, and the published chart vendors that chart ([system ADR-0043](../../../../../docs/adr/adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md)). Ploeg's values go under `ploeg:`, unchanged from Ploeg's own chart; Ploeg needs at least `ploeg.database.existingSecret.name` and `ploeg.executor.litellm.adminUrl`, as the [live example](values.live.example.yaml) shows. `ploeg.enabled` (default `true`) turns the dependency off for the demo or a cluster that runs Ploeg elsewhere.

### Names

Both charts name their Deployment, Service and ServiceAccount after the Helm release unless an override says otherwise. This chart therefore sets `ploeg.fullnameOverride: ploeg`, so a release called `unfold` installs Unfold's objects as `unfold` and Ploeg's as `ploeg`, and Ploeg answers at `http://ploeg.<namespace>.svc:8080`. The chart refuses to render when the two names meet: a release called `ploeg` with the default, or `ploeg.fullnameOverride` set to the release name. An existing install whose Ploeg objects carry the release name keeps them by setting `ploeg.fullnameOverride` to that name, provided the release is not also Unfold's name.

### Network policy

Ploeg's chart renders a default-deny NetworkPolicy for ploegd. While `ploeg.networkPolicy.ploegd.ingressFrom` is empty it admits port 8080 from every pod; once that list names any caller, it admits only those and Ploeg's own pods. This chart then adds the NetworkPolicy `<release>-to-ploegd`, which admits the Unfold workbench's pods (`app.kubernetes.io/name: unfold` and the release's `app.kubernetes.io/instance`) to ploegd on port 8080, so naming the gateway or Prometheus in `ingressFrom` never locks the workbench out. Leave the workbench out of `ingressFrom`. NetworkPolicies add up, so the extra policy widens nothing beyond that one caller.

### Attribution

`ploeg.operator.attribution` is `asserted` by default. It decides whether Ploeg accepts an operator change that names its person only in `X-Ploeg-Actor` (`asserted`) or refuses every change without a verified person token with 403 `person_token_required` (`proven`), as Ploeg ADR-0171 sets out. Ploeg's own chart leaves the value empty, which resolves to `asserted` before chart 0.3.0 and to `proven` from 0.3.0; this chart sets `asserted` so that a Ploeg upgrade does not turn the default for an Unfold that sends no person tokens. With `proven`, set `config.ploeg.personTokens` too: this chart refuses to render a resolved `proven` without it, because Ploeg would then refuse every change Unfold makes. Ploeg's chart in turn needs `ploeg.operator.personTokens` and the consumer's `audiences`; [Live operation](../../../docs/operations/live.md#when-ploeg-refuses-changes-without-proof) lists every setting.

Only `scripts/consume-ploeg-release.sh`, which Ploeg's release runs, moves the dependency: `mise run ploeg-pin <version>` rewrites its version and `Chart.lock` together with the other pins. A checkout downloads the locked chart into `charts/`, which Git ignores, with `mise run setup` or `mise exec -- python3 scripts/ploeg-contract.py chart`; `helm template` and `helm lint` of this directory need it, even with `ploeg.enabled=false`.

## Scheduling and pod metadata

All of these apply to the workbench pod only and are empty by default. Agent workspace pods are created by Unfold at runtime and take their settings from the `workspace*` values.

| Value | Use it to |
| --- | --- |
| `priorityClassName` | Rank the workbench in a cluster that uses priority classes. |
| `nodeSelector`, `tolerations`, `affinity` | Place the workbench on particular nodes. |
| `podLabels`, `podAnnotations` | Add metadata that other tools act on, such as a policy engine or Reloader. They are added to the chart's own labels and its config checksum, never replacing them. |
| `extraEnv` | Add environment variables, for example a credential read from a Secret other than `credentialsSecret`. Entries take the Kubernetes `env` form and come after the chart's own. |

## Product events and export

Unfold records product events from the browser in its own database ([RFC-0001](../../../../../docs/design/rfc-0001-product-events-and-confusion-signals.md)). Recording is on by default and nothing leaves the install until you name a collector.

| Value | Default | Sets |
| --- | --- | --- |
| `insight.events` | `true` | `UNFOLD_INSIGHT_EVENTS`: `false` stores no events and tells the browser not to post any. |
| `insight.export` | `"off"` | `UNFOLD_INSIGHT_EXPORT`: `faro` or `otlp` forwards events to a collector. Quote `"off"`: unquoted, YAML reads it as `false` and the schema refuses it. |
| `insight.url` | `""` | `UNFOLD_INSIGHT_EXPORT_URL`, required unless the export is off. A Faro URL ends in `/collect`, an OTLP/HTTP one in `/v1/logs`. |
| `insight.level` | `aggregate` | `UNFOLD_INSIGHT_EXPORT_LEVEL`: `aggregate` sends each finished day's totals with no actor; `events` sends each event with its pseudonymous actor. |
| `errorReports.otlpUrl` | `""` | `UNFOLD_ERROR_OTLP_URL`: an OpenTelemetry collector's OTLP/HTTP logs URL (ends in `/v1/logs`). Server errors and failed Asks go there as log records with `exception.*` attributes. |
| `errorReports.sentry.existingSecret` | `""` | Secret holding a Sentry-protocol DSN; sets `UNFOLD_SENTRY_DSN` for Sentry, GlitchTip or Bugsink. |
| `errorReports.sentry.secretKey` | `sentry-dsn` | Key in that Secret. |
| `errorReports.environment` | `""` | `UNFOLD_ERROR_ENVIRONMENT`, the environment reports carry, such as `staging`; empty uses the mode. Either destination, both or neither; failures are always logged. |
| `decider.enabled` | `false` | Adds `config.decider` for the tripwire (RFC-0008, [live operation](../../../docs/operations/live.md#decider-tripwire)). Live mode only; the `runs.tripwire` flag then turns screening on per Team. |
| `decider.baseUrl`, `model`, `name`, `requestsPerMinute` | `""`, `hetzner-qwen3-8-27b`, `Hetzner Qwen`, `8` | The OpenAI-compatible gateway URL (required when enabled), the model, the name each hit shows, and the most screens a minute. |
| `decider.keyEnv`, `existingSecret`, `secretKey` | `UNFOLD_DECIDER_KEY`, `""`, `key` | Unfold's own zero-budget virtual key. With `existingSecret` set, that Secret's key becomes `keyEnv` in the workbench container only; empty, `keyEnv` comes from `credentialsSecret`. Never the LiteLLM master key. |

The server sends the export, never the browser, so the workbench pod needs egress to the collector.

## The Ploeg MCP server for editors

The VS Code extension offers people the remote `ploeg-mcp` that the workbench names in `GET /api/mcp-servers` ([API contract](../../../docs/contracts/api.md#mcp-servers-for-editors)). Both values are public: a URL and an OAuth client id, never a token. Leave both empty and the workbench names no server.

| Value | Default | Sets |
| --- | --- | --- |
| `ploegMcp.url` | `""` | `UNFOLD_PLOEG_MCP_URL`: the exact resource URL of `ploeg-mcp http`, the same string as its `PLOEG_MCP_RESOURCE`, such as `https://mcp-ploeg.example.com/mcp`. |
| `ploegMcp.clientId` | `""` | `UNFOLD_PLOEG_MCP_CLIENT_ID`: the public client registered for it at the identity provider, such as `ploeg-mcp`. Set it together with the URL. | [Running Unfold live](../../../docs/operations/live.md) describes what each level sends, and [the dashboard](../../grafana/README.md) reads it back in Grafana.

## Teams

`config.teams` lists the Teams sessions run with, each `{id, name, description, roles}`; leave it unset for Unfold's defaults. `config.crews` is its deprecated name ([system ADR-0036](../../../../../docs/adr/adr-0036-ploeg-and-unfold-use-one-vocabulary-with-named-screen-words.md)): Unfold still reads it, but rename it to `teams`. Setting both with different lists stops Unfold from starting. A later release makes the chart warn about `config.crews`, and the one after that refuses it ([Team keys](../../../docs/contracts/api.md#team-keys)).

## Feature flags

`featureFlags` is a flagd document of rule changes for the flags this version of Unfold knows. The chart renders it as the ConfigMap `<name>-flags`, mounts it at `/etc/unfold-flags/flags.json` and sets `UNFOLD_FLAGS_FILE`. The ConfigMap is left out of the pod's checksum, so a change applies within about a minute, without a restart: Unfold polls the file every 5 seconds and keeps the last good rules if a change is invalid. Set flags here, not under `config.flags`; the chart refuses both. Examples and the list of flags: [Feature flags](../../../docs/operations/feature-flags.md).

```yaml
featureFlags:
  flags:
    work.live-view:
      defaultVariant: "on"
```

## Live mode

Live mode reaches services the chart cannot guess, and none of them has a default. The chart does not check them; Unfold does at startup. In live mode it refuses to start without `config.execution`, a Ploeg connection with `tokenEnv`, and a gateway URL. Set them in values or in the `credentialsSecret` environment:

| Service | Where |
| --- | --- |
| Ploeg, the engine | `config.ploeg.url` and `config.ploeg.tokenEnv`; the token lives in `credentialsSecret` |
| Proving people to Ploeg (optional) | `config.ploeg.personTokens` (`tokenUrl`, `clientId`, `clientSecretEnv`, `audience`); the exchange client's secret lives in `credentialsSecret` under the name `clientSecretEnv` gives. Off when absent. [Live operation](../../../docs/operations/live.md#proving-people-to-ploeg) lists what the identity provider and Ploeg need |
| Model gateway | `config.litellm.baseUrl`, or `LITELLM_BASE_URL` in `credentialsSecret` |
| Forge repositories | `config.repositories[].url` |
| Tracker | `config.taskSources[]` |
| Workspace network | `workspaceEgress`, which must allow the gateway and the forge; `workspaceGitRewrites` sends git to the forge's in-cluster address, so no ingress gateway needs opening |

Start from [values.live.example.yaml](values.live.example.yaml). [Running Unfold live](../../../docs/operations/live.md#kubernetes) explains each setting and the credentials Secret.

## Sign-in

| Value | Default | Sets |
| --- | --- | --- |
| `auth.localLogin` | `true` | `config.auth.localLogin`. `false` turns local name-and-password sign-in off: only single sign-on is offered, `POST /api/login` answers 404, `UNFOLD_ADMIN_PASSWORD` creates no administrator and sessions of local accounts stop working. It needs `config.auth.oidc`; the chart refuses to render without it, and refuses `config.auth.localLogin` so the switch has one place. [Live operation](../../../docs/operations/live.md#local-sign-in) describes the switch |

## Workspace sandbox

In live mode an agent workspace runs code nobody reviewed, so it belongs under a sandbox runtime such as Kata Containers or gVisor ([Run agent code in a sandbox runtime](../../../../../docs/how-to/run-agent-code-in-a-sandbox-runtime.md)). The pod provisioner (the default) reads `workspacePodRuntimeClassName`, which is empty because not every cluster has a sandbox runtime; the sandbox provisioner reads `workspaceRuntimeClassName`, default `kata`. The chart never picks a runtime for you: a RuntimeClass the nodes lack would leave every workspace unable to start.

| Value | Default | Sets |
| --- | --- | --- |
| `workspacePodRuntimeClassName` | `""` | The RuntimeClass of agent and export pods under the pod provisioner, such as `kata` or `gvisor`. |
| `workspaceAllowUnsandboxed` | `false` | In live mode the chart refuses to render while the provisioner's RuntimeClass is empty. `true` runs workspaces on the node's default runtime, against the node's own kernel, and the install notes print a warning. |

The demo starts no workspace pods, so neither value applies to it.

## Workspace size

Each agent workspace is one pod. `workspaceCpu` and `workspaceMemory` are its limits. `workspaceCpuRequest` and `workspaceMemoryRequest` are what it reserves on a node; left empty, it reserves its limits, so a workspace starts only on a node with the full limits free. Reserving less lets workspaces fit on a busier cluster and burst up to their limits while the node has room. A workspace that no node has room for waits, then fails with "No machine had room to start the workspace", and the Status page shows it.

## Candidate delivery

`delivery.enabled: true` (live mode only) writes `config.delivery` and renders what the [Kubernetes verifier](../../../docs/contracts/candidate-delivery.md#kubernetes-verifier) needs. Leave `config.delivery` unset; the chart refuses both. Unfold validates the result at startup, so a policy the chart renders but the server rejects stops the workbench rather than running unverified.

| Value | Default | Sets |
| --- | --- | --- |
| `delivery.verifierTokenEnv` | `UNFOLD_VERIFIER_TOKEN` | The environment variable holding Ploeg's verifier credential. It comes from `credentialsSecret`. |
| `delivery.policies` | `[]` | `config.delivery.policies`, one per repository. Point `approvedBaseBundle` and `directory` under `delivery.inputs.mountPath`; every `image` must be `name@sha256:…`. |
| `delivery.inputs.volume` | `{}` | A Kubernetes volume source (for example a read-only `persistentVolumeClaim`) mounted read-only at `delivery.inputs.mountPath` (default `/var/lib/unfold-delivery`), holding approved-base bundles and policy files. The path must be outside `/data`. |
| `delivery.publisher.enabled` | `false` | Adds `config.delivery.publisher` (`kind: forgejo`, `apiUrl`, `tokenEnv`, optional `username`). |
| `delivery.publisher.existingSecret`, `secretKey` | `""`, `token` | The dedicated Secret whose key becomes the `delivery.publisher.tokenEnv` variable (default `UNFOLD_PUBLISHER_TOKEN`) in the workbench container only. Required when the publisher is enabled. |
| `delivery.verifier.namespace` | `unfold-verifier` | Where check pods run; must differ from the release namespace. `createNamespace` (default `true`) creates it with the `restricted` Pod Security level. |
| `delivery.verifier.runtimeClassName` | `kata` | The check pods' RuntimeClass. |
| `delivery.verifier.image` | `""` | Required. A digest-pinned image with a statically linked `/bin/busybox`, such as a `busybox:*-musl` digest. |
| `delivery.verifier.resources` | 100m/128Mi requests, 1/512Mi limits | Both check-pod containers. The RuntimeClass overhead is added on top. |
| `delivery.verifier.timeoutSeconds` | `300` | Each check pod's `activeDeadlineSeconds`. |
| `delivery.verifier.networkProbe` | `{}` | `{host, port}`, an IP address check pods must not reach. Empty uses the API server's service address. |
| `delivery.verifier.nodeSelector`, `affinity`, `tolerations`, `imagePullSecrets` | empty | Passed to every check pod. Use them to keep check pods off nodes that must not run them. |

In the verifier namespace the chart renders:

- a NetworkPolicy selecting `dev.webgrip.unfold/network: none` with `policyTypes: [Ingress, Egress]` and no rules, which the verifier checks for before each verification and probes from inside each pod;
- a Role bound to the workbench service account: `pods` get, create and delete; `pods/attach` and `pods/exec` get and create (the WebSocket upgrade is a GET; newer API servers authorize it as create); `networkpolicies` list. It has no `pods/log`, Secret or list-pods access.

The chart refuses to render when `workspaceAgentSecrets` lists `credentialsSecret`, `delivery.publisher.existingSecret` or `decider.existingSecret`.
