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

## Live mode

Live mode reaches services the chart cannot guess, and none of them has a default. The chart does not check them; Unfold does at startup. With `config.execution` set, it refuses to start without a Ploeg connection and a gateway URL. Set them in values or in the `credentialsSecret` environment:

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
