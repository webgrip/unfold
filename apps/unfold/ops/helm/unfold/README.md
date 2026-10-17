# Unfold Helm chart

This chart installs Unfold, Ploeg's front end: one workbench Deployment with a persistent volume, its Service, and, in live mode, the RBAC it needs to manage agent workspaces in a separate namespace.

By default it runs the deterministic **demo**, which needs nothing outside the cluster except the public image and a default StorageClass. The demo says it is one and makes no model calls.

## Images

| Image | Default | Notes |
| --- | --- | --- |
| Workbench | `ghcr.io/webgrip/unfold:<appVersion>` | Public. Harbor and Forgejo hold the same signed digest; see [release artifacts](../../../../../docs/operations/artifacts.md). Set `image.repository`, and `image.digest` to pin, plus `imagePullSecrets` for a private copy. |
| Workspace (live mode) | `ghcr.io/webgrip/unfold-agent:<appVersion>` | Set `workspaceImage` and `workspaceImagePullSecrets` to use a private copy. |

## Demo install

```sh
helm install unfold oci://ghcr.io/webgrip/charts/unfold --version <version> -n unfold --create-namespace
```

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
    work.flight-profile:
      defaultVariant: "on"
```

## Live mode

Live mode reaches services the chart cannot guess, and none of them has a default. The chart does not check them; Unfold does at startup. In live mode it refuses to start without `config.execution`, a Ploeg connection with `tokenEnv`, and a gateway URL. Set them in values or in the `credentialsSecret` environment:

| Service | Where |
| --- | --- |
| Ploeg, the engine | `config.ploeg.url` and `config.ploeg.tokenEnv`; the token lives in `credentialsSecret` |
| Model gateway | `config.litellm.baseUrl`, or `LITELLM_BASE_URL` in `credentialsSecret` |
| Forge repositories | `config.repositories[].url` |
| Tracker | `config.taskSources[]` |
| Workspace network | `workspaceEgress`, which must allow the gateway and the forge |

Start from [values.live.example.yaml](values.live.example.yaml). [Running Unfold live](../../../docs/operations/live.md#kubernetes) explains each setting and the credentials Secret.

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

The chart refuses to render when `workspaceAgentSecrets` lists `credentialsSecret` or `delivery.publisher.existingSecret`.
