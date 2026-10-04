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
