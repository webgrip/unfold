---
type: how-to
audience: [operator]
owner: unfold
last_verified: 2026-10-29
verified_by: "Rendered and linted apps/unfold/ops/helm/unfold at 0.4.0-rc.114 with its vendored Ploeg chart 0.2.0-rc.94 (helm 3.19.0 through mise) using the values on this page, with and without ploeg.fullnameOverride, with ploeg.operator.attribution proven (refused) and with the knowledgeGraph values. Read the chart README, values.yaml, values.live.example.yaml and templates; Ploeg's values.yaml, configuration reference, support matrix, threat model, network policies, managed workers, compatibility, quickstart and recovery pages at the pinned release; apps/unfold/src/config.ts (gatewayPolicy) and src/tenancy.ts; Unfold's live operation, storage and task connection pages. Not run on a cluster: no install, upgrade, backup or restore on this page was executed."
---

# Self-host the whole stack in the EU

To run Unfold and Ploeg for your own people on your own Kubernetes cluster, with agent code in a sandbox and model calls kept to the regions you allow, install the one Unfold chart, which carries the Ploeg release it was tested with ([ADR-0043](../adr/adr-0043-an-unfold-release-is-one-chart-that-carries-the-ploeg-it-was-tested-with.md)). This page takes you from an empty cluster to a first session and then through backups and upgrades. It links the reference pages for every setting rather than repeating them.

Unfold is pre-1.0 and runs today on one cluster, its owner's. Steps this repository cannot back up yet are marked as gaps, and [Known gaps](#known-gaps) lists them together.

## Before you start

You need, on or next to the cluster:

| Component | Requirement | Why |
| --- | --- | --- |
| Kubernetes | 1.30 or later | Ploeg's worker admission policy and the sandbox admission policies need it ([support matrix](../../apps/ploeg/docs/reference/support-matrix.md#kubernetes)) |
| Network plugin | One that enforces NetworkPolicy, such as Cilium | Every egress limit in both charts is a NetworkPolicy; a plugin that ignores them leaves them void |
| Storage | A default StorageClass with ReadWriteOnce volumes | Unfold's application volume and each workspace's volume |
| PostgreSQL | 17 or 18, with a Secret holding the connection URI under `uri` (CloudNativePG creates `<cluster>-app` that way) | Ploeg's state |
| Model gateway | LiteLLM 1.103.0 or later with spend logs on | Ploeg mints, caps and revokes one key per Run through its management API |
| Identity provider | OpenID Connect with a groups claim; the operations pages describe Authentik | Single sign-on, roles and memberships |
| Forge | Forgejo 15 or later, or GitHub with a GitHub App | Repositories agents clone and pull requests they open |
| Helm | Helm 4.3, which Ploeg's CI installs with; Helm 3 reads the chart but no job runs it | Installing and upgrading the chart |
| Ingress | An ingress controller and a TLS certificate | People reach the workbench over HTTPS |

KEDA 2.13 or later is needed only when Ploeg's own Teams use the default `keda` executor; `ploeg.executor.type: cronjob` needs none. A secret mechanism such as External Secrets keeps every credential below out of Git.

## 1. Prepare the nodes

1. Encrypt node disks, traffic between nodes and etcd: [Protect data at rest and in transit](protect-data-at-rest-and-in-transit.md). On Talos this wipes each disk, so do it before anything else runs there.
2. Install a sandbox runtime, Kata Containers or gVisor, add the RuntimeClasses and apply both admission policies: [Run agent code in a sandbox runtime](run-agent-code-in-a-sandbox-runtime.md). Choose by node: Kata where nodes have hardware virtualization, gVisor where they do not.

Ploeg's supported profile, P1, is narrower than what the sandbox page allows. It supports Ploeg's sandbox executor only under a VM runtime with the guest's seccomp on, and counts gVisor there, and the Kata 3.32 Talos extension (guest seccomp off), as unsupported ([support matrix](../../apps/ploeg/docs/reference/support-matrix.md#executors-and-runtime-classes)). Unfold's workspaces run under either.

## 2. Keep inference in EU regions at the gateway

Every prompt, and every piece of a repository an agent reads, goes to the model provider the gateway routes it to. Under Ploeg, the gateway's own configuration is the only place that keeps that traffic in the EU: a live Unfold refuses to start with its `gatewayPolicy` setting ([Keeping inference where policy allows](../../apps/unfold/docs/operations/live.md#keeping-inference-where-policy-allows)), and Ploeg checks models, not regions.

1. In LiteLLM, define each model alias only on deployments served from an EU region by a provider you accept. An auto-router alias counts every tier behind it: give it no tier outside the EU. A provider's global endpoint does not qualify; Anthropic's public endpoint, for example, reports its region as `global`.
2. Give Ploeg's inference policies only those aliases. A Run's key is scoped to the models its Role's policy lists, so an alias outside the list cannot be called with it ([Managed workers](../../apps/ploeg/docs/ops/managed-workers.md#configure-the-controller)). For Unfold's sessions that is the `operator` Role's policy under `ploeg.executor.workerAuth.additionalLLMPolicies`; for Ploeg's own Teams, each team's and Role's model settings.
3. List the same aliases under `config.models` in Unfold, so the new-session form offers nothing else.
4. Keep the gateway's master key with Ploeg alone, in the Secret `ploeg.executor.litellm.masterKeySecret` names (default `agent-litellm-master`, key `LITELLM_MASTER_KEY`). Unfold needs only the inference URL.

Nothing in Unfold or Ploeg checks after the fact that a request stayed in the region; that rests on the gateway's configuration.

## 3. Create the Secrets

Create them in the namespace you install into (here `unfold`), through your secret mechanism.

| Secret | Holds | Read by | Where it is described |
| --- | --- | --- | --- |
| `ploeg-app` (your PostgreSQL's) | `uri` | Ploeg | `ploeg.database.existingSecret` in the [configuration reference](../../apps/ploeg/docs/reference/configuration.md#helm-values) |
| `agent-litellm-master` | `LITELLM_MASTER_KEY` | Ploeg | [Managed workers](../../apps/ploeg/docs/ops/managed-workers.md#configure-the-controller) |
| `ploeg-worker-signing`, `ploeg-worker-bootstrap` | The worker signing key and bootstrap registry | Ploeg | [Ploeg quickstart, step 5](../../apps/ploeg/docs/quickstart.md#5-create-ploegs-own-secrets) |
| `ploeg-operator-unfold` | `token`: Unfold's operator consumer token | Ploeg | [Managed execution](../workflows/managed-execution.md#configure-the-services) |
| `unfold-credentials` | `PLOEG_OPERATOR_UNFOLD_TOKEN` (the same token), and any variable a `tokenEnv` or `clientSecretEnv` below names that has no Secret of its own | Unfold | [Live operation](../../apps/unfold/docs/operations/live.md#first-managed-session) |
| `unfold-store-key` | `key`: 32 random bytes as base64 or hex | Unfold | [The store key](../../apps/unfold/docs/operations/storage.md#the-store-key) |
| `repository-readonly`, in `unfold-workspaces` | A read credential for the repositories | Workspace clone containers | `workspaceGitSecretName` in [Live operation](../../apps/unfold/docs/operations/live.md#kubernetes) |

With `storeKey.existingSecret` set, the key that encrypts Unfold's stored secrets never touches the data volume, so a copy of the volume or of a backup does not open them. Set `storeKey.allowFileOnDataVolume: false` too, so the chart refuses to render if the key Secret is ever dropped from the values.

Everything in `unfold-credentials` reaches the workbench through one `envFrom`, so whoever reads that Secret reads every credential in it. To split them, give a credential its own Secret and name it in `credentialRefs`: for example the verifier token, so it rotates and is readable apart from the operator token. With External Secrets Operator (v0.17.0 or later, `external-secrets.io/v1`), `externalSecrets` renders those Secrets and the store key's from your vault instead ([chart README](../../apps/unfold/ops/helm/unfold/README.md#secrets-and-the-store-key)):

```yaml
externalSecrets:
  enabled: true
  secretStoreRef: {kind: ClusterSecretStore, name: vault}
  storeKey: {key: unfold/store-key, property: key}
  credentials:
    PLOEG_OPERATOR_UNFOLD_TOKEN: {key: unfold/operator, property: token}
    UNFOLD_VERIFIER_TOKEN: {key: unfold/verifier, property: token}
```

With `externalSecrets.storeKey` set, leave `storeKey.existingSecret` empty: the chart refuses both.

## 4. Write the values

Start from the chart's [live example](../../apps/unfold/ops/helm/unfold/values.live.example.yaml) and keep the file private. A complete first set looks like this:

```yaml
mode: live
baseUrl: https://unfold.example.com
storeKey:
  existingSecret: unfold-store-key
  allowFileOnDataVolume: false
ingress:
  enabled: true
  className: nginx
  host: unfold.example.com
  tlsSecret: unfold-tls
workspacePodRuntimeClassName: kata          # or gvisor
workspaceStorageClass: encrypted            # a StorageClass whose volumes are encrypted
workspaceGitSecretName: repository-readonly
workspaceGitRewrites:
  - url: http://forgejo-http.forge.svc.cluster.local:3000/
    insteadOf: https://forge.example.com/
workspaceEgress:
  - to:
      - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: ai}}
        podSelector: {matchLabels: {app.kubernetes.io/name: litellm}}
    ports: [{protocol: TCP, port: 4000}]
  - to:
      - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: forge}}
        podSelector: {matchLabels: {app.kubernetes.io/name: forgejo}}
    ports: [{protocol: TCP, port: 3000}]
config:
  models:
    - {id: coding, name: Coding, providerId: gateway, modelId: coding}
  repositories:
    - id: application
      name: Application
      description: Operator-approved repository
      url: https://forge.example.com/organization/application.git
      baseBranch: main
      verify: [npm, test]
      executionOwner: ploeg
  litellm:
    baseUrl: http://litellm.ai.svc.cluster.local:4000/v1
  ploeg:
    url: http://ploeg.unfold.svc:8080
    tokenEnv: PLOEG_OPERATOR_UNFOLD_TOKEN
    teams: [delivery]
  execution:
    team: delivery
ploeg:
  fullnameOverride: ploeg
  operator:
    attribution: asserted
    consumers:
      - name: unfold
        teams: [delivery]
        execute: true
        maxBudgetUsd: 5
        tokenSecret: {name: ploeg-operator-unfold, key: token}
  database:
    existingSecret:
      name: ploeg-app
  executor:
    runtimeClassName: kata
    litellm:
      adminUrl: http://litellm.ai.svc.cluster.local:4000
    workerAuth:
      additionalLLMPolicies:
        - {team: delivery, role: operator, budgetUsd: 5, models: [coding], ttl: 4h}
  security:
    workerAdmission:
      runtimeClassNames: [kata]
  networkPolicy:
    ploegd:
      ingressFrom:
        - podSelector: {matchLabels: {app.kubernetes.io/name: unfold}}
```

What each part does:

* **`ploeg.fullnameOverride`.** Both charts name their Deployment, Service and ServiceAccount after the Helm release. Without the override, a release named `unfold` renders two of each called `unfold`, and the install fails. With it, Ploeg is reachable at `http://ploeg.<namespace>.svc:8080`, which `config.ploeg.url` names.
* **Sandbox.** `workspacePodRuntimeClassName` puts each workspace and export pod under the RuntimeClass; it is empty by default, which runs them on the node's default runtime. `ploeg.executor.runtimeClassName` does the same for Ploeg's worker pods under every executor, and `security.workerAdmission.runtimeClassNames` makes Ploeg's admission policy refuse a worker pod without it. The delivery verifier's check pods, when you enable it, take `delivery.verifier.runtimeClassName`, `kata` by default ([chart README](../../apps/unfold/ops/helm/unfold/README.md#candidate-delivery)).
* **Ploeg's inbound traffic.** `ploeg.networkPolicy.ploegd.ingressFrom` empty admits every pod in the cluster to Ploeg's port. Once you name callers, name the workbench too, as above, or Unfold cannot reach Ploeg; add your ingress controller's namespace for tracker and forge webhooks ([Network policies](../../apps/ploeg/docs/ops/network.md#ingress-to-ploegd)).
* **Workspace network.** `workspaceEgress` must allow the gateway and the forge, and nothing else is reachable. `workspaceGitRewrites` sends git to the forge's in-cluster Service, so no ingress gateway needs opening.

[Running Unfold live](../../apps/unfold/docs/operations/live.md#kubernetes) explains every workspace setting, and the [chart README](../../apps/unfold/ops/helm/unfold/README.md#live-mode) lists what live mode needs. Ploeg's values go under `ploeg:` unchanged from its own chart ([configuration reference](../../apps/ploeg/docs/reference/configuration.md#helm-values)).

Check the render before installing:

```sh
helm lint ops/helm/unfold -f values.live.local.yaml
helm template unfold ops/helm/unfold --namespace unfold -f values.live.local.yaml > /tmp/unfold-live.yaml
```

Run them from `apps/unfold` in a checkout of the release you install, after `mise run setup` has downloaded the vendored Ploeg chart. Read the rendered NetworkPolicies against your network: Ploeg derives its egress rules from the URLs you give it, and the `ploeg.networkPolicy.*.peers` values narrow them ([Network policies](../../apps/ploeg/docs/ops/network.md#how-the-destination-of-a-rule-is-found)).

## 5. Set up sign-in

1. Register the workbench at your identity provider as a public client with PKCE, client id `unfold`, redirect URI `<baseUrl>/api/auth/oidc/callback`, and the `openid`, `email` and `profile` scopes ([Signing in with the estate](../../apps/unfold/docs/operations/live.md#signing-in-with-the-estate)).
2. Add it to the values:

    ```yaml
    auth:
      localLogin: false
    config:
      auth:
        oidc:
          issuer: https://auth.example.com/application/o/unfold/
          clientId: unfold
          displayName: Single sign-on
    ```

    `auth.localLogin: false` turns off name-and-password sign-in, so everyone comes through the provider ([Local sign-in](../../apps/unfold/docs/operations/live.md#local-sign-in)). Leave it `true` for the first install if you want a bootstrap administrator from `UNFOLD_ADMIN_PASSWORD`, and turn it off once single sign-on works.
3. Create the role groups. A person needs one of `unfold-admins`, `unfold-operators` or `unfold-viewers` to sign in at all.
4. Create the membership groups. `unfold/<tenant>/viewer`, `unfold/<tenant>/member` and `unfold/<tenant>/admin` make a person a Viewer, Developer or Admin of that [Tenant](../reference/glossary.md#tenant); `unfold/<tenant>/client/<client>` makes them a member of that [Client](../reference/glossary.md#client). Ids are lower-case letters, digits and inner hyphens, at most 63 characters, and a group that does not match exactly is ignored ([Tenant and Client memberships](../../apps/unfold/docs/operations/live.md#tenant-and-client-memberships)). Unfold records these memberships at each sign-in; it does not enforce them yet.
5. Give people Ploeg Teams. After each person's first sign-in, add their Unfold user id to `config.ploeg.userTeams` with the Teams they may use; an unmapped non-administrator is refused ([Managed execution](../workflows/managed-execution.md#configure-the-services)).

## 6. Choose how Ploeg attributes changes

Every change Unfold makes in Ploeg names a person. The chart sets `ploeg.operator.attribution: asserted`: Ploeg accepts the person Unfold names in a header and records the change as *asserted*.

To have Ploeg record changes as *proven* by the person's own sign-in, and refuse any change without that proof, set up person tokens on both sides and then `ploeg.operator.attribution: proven`:

| Where | Setting |
| --- | --- |
| Identity provider | A confidential client allowed only the token exchange grant, and a provider for the target audience such as `ploeg-for-unfold` |
| Unfold | `config.ploeg.personTokens` (`tokenUrl`, `clientId`, `clientSecretEnv`, `audience`), with the client secret in `unfold-credentials` |
| Ploeg chart | `ploeg.operator.personTokens.issuer`, and `subjectNamespace` when it differs from the issuer |
| Ploeg chart | `audiences: [ploeg-for-unfold]` on Unfold's entry in `ploeg.operator.consumers` |

[Proving people to Ploeg](../../apps/unfold/docs/operations/live.md#proving-people-to-ploeg) explains each setting, including the refresh token proof needs to last a whole sign-in. Both charts refuse to render `proven` without person tokens. Under `proven`, Ploeg also refuses the changes Unfold makes with no person behind them, such as Run card comments and the delivery verifier's calls ([When Ploeg refuses changes without proof](../../apps/unfold/docs/operations/live.md#when-ploeg-refuses-changes-without-proof)).

## 7. Connect the forge and the tracker

Unfold and Ploeg each need the repository and the board, in their own configuration ([Connect a repository](../concepts/connect-a-repository.md) shows the whole journey and where it breaks).

1. **Unfold.** Add each repository under `config.repositories` and each board or issue list under `config.taskSources`, with `executionOwner: ploeg` ([Connect a task system](../../apps/unfold/docs/operations/task-connections.md#register-the-connection)).
2. **Ploeg's forge.** Set `ploeg.executor.forge` (`forgejo` or `github`) and its block: for Forgejo `ploeg.executor.forgejo.url`, `botPasswordSecret` so each writing Run gets a token for its repository alone, `readTokenSecret` for reading Roles, and `webhookSecret` so reviews reach Ploeg. For GitHub follow [Connect GitHub as a forge](../../apps/ploeg/docs/how-to/connect-github-as-a-forge.md).
3. **Ploeg's routing.** Register repositories under `ploeg.config.targets` and boards under `ploeg.config.trackers` ([Route a board that serves several repositories](../../apps/ploeg/docs/how-to/route-a-multi-repo-board.md)).
4. **Ploeg's tracker.** For Vikunja set `ploeg.tracker.url`, `ploeg.tracker.tokenSecret` and the webhook secret under `ploeg.webhook.existingSecret`; for ClickUp or GitHub Issues the `ploeg.tracker.clickup` or `ploeg.tracker.github` block ([configuration reference](../../apps/ploeg/docs/reference/configuration.md#helm-values)).

Once installed, **Settings → Connections** in Unfold shows each board and repository with its checks.

## 8. Add knowledge (optional)

Ploeg can brief each Run from a Tenant's knowledge in [Omnigraph](https://github.com/ModernRelay/omnigraph): reviewed concepts, and notes Runs keep per Work Item ([ADR-0034](../adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md), proposed). Run an Omnigraph server yourself, then point Ploeg at it:

```yaml
ploeg:
  knowledgeGraph:
    url: http://omnigraph.knowledge.svc.cluster.local:8080
    notesGraph: notes
    conceptsGraph: knowledge
    runTokenSecret: {name: omnigraph-run, key: token}
```

Only `ploegd` holds the run actor's token; worker pods never see it. The graphs must declare the stored queries the [configuration reference](../../apps/ploeg/docs/reference/configuration.md#environment-variables) lists under `PLOEG_NOTES_GRAPH` and `PLOEG_KNOWLEDGE_GRAPH`. Allow `ploegd` to reach the server with `ploeg.networkPolicy.knowledgeGraph.peers`. [Briefings](../../apps/ploeg/docs/ops/briefings.md) shows how the knowledge budget is split.

## 9. Install and check it

```sh
helm install unfold oci://ghcr.io/webgrip/charts/unfold --version <version> -n unfold -f values.live.local.yaml
```

Use a released version and never set an image: the published chart names every image by its released digest. In a GitOps repository, pin the same chart version in a HelmRelease instead.

Then:

1. Open `<baseUrl>`, sign in, and open the Status page. The workspaces, gateway and Ploeg checks should be `ok` or `idle`. `GET /healthz` carries `ploegContract`, which says whether this Ploeg serves the contracts this Unfold needs ([API contract](../../apps/unfold/docs/contracts/api.md)).
2. Start one session on the registered repository with a small budget, and follow [First managed session](../../apps/unfold/docs/operations/live.md#first-managed-session) to its end, including the final spend.
3. Check the sandbox: `kubectl run probe --image=busybox --labels=app.kubernetes.io/name=unfold-agent --dry-run=server -- true` is refused once the sandbox admission policy is on.

## 10. Back up

| What | How | Restore |
| --- | --- | --- |
| Unfold's state: `/data/workbench` on the application volume, with `unfold.sqlite`, its WAL and retained evidence | A SQLite-aware snapshot, or stop the single replica and copy the directory ([Routine intervention and recovery](../../apps/unfold/docs/operations/live.md#routine-intervention-and-recovery)) | [When the check fails](../../apps/unfold/docs/operations/storage.md#when-the-check-fails) |
| Unfold's store key | In your vault, apart from the database backups. A key still in `unfold.sqlite.key` can be moved there ([Moving the key off the volume](../../apps/unfold/docs/operations/storage.md#moving-the-key-off-the-volume)), and a new key replaces it with one restart ([Rotating the key](../../apps/unfold/docs/operations/storage.md#rotating-the-key)) | The same key opens every backup taken under it |
| Ploeg's PostgreSQL | Your PostgreSQL's own backup tool | [Restore Ploeg after a database outage](../../apps/ploeg/docs/how-to/restore-after-a-database-outage.md) |
| Workspace volumes | Kept for `workspaceRetentionDays` (default 7) after a finished session; a captured candidate lives in Unfold's data directory, not on the volume | Not needed to review or accept a candidate |

Test a restore before you rely on it. Encrypt the backup target: [Protect data at rest and in transit](protect-data-at-rest-and-in-transit.md#5-encrypt-volumes-and-backups).

## 11. Upgrade

A cluster moves one version: the Unfold chart. Each release carries the Ploeg chart it was tested with, and an Unfold release supports the Ploeg it carries and the Ploeg minor before it ([ADR-0044](../adr/adr-0044-unfold-refuses-a-ploeg-that-does-not-serve-the-contract-majors-it-requires.md)).

1. Back up Ploeg's database and Unfold's data directory.
2. Read the release notes of the Unfold release and of the Ploeg release it carries.
3. Move the chart version in your HelmRelease, or run `helm upgrade` with the same values file.
4. Ploeg migrates its own database when `ploegd` starts. Unfold runs one replica with the `Recreate` strategy, so it is down for the few seconds of its restart; sessions on the pull transport reconnect.
5. Check the Status page and `ploegContract` again. While Unfold reports `incompatible`, it pauses every managed action until the pair matches.

If Ploeg's migration fails, follow [Recover from a failed upgrade](../../apps/ploeg/docs/how-to/recover-from-a-failed-upgrade.md): roll back one release, or restore the pre-upgrade backup.

Ploeg chart 0.3.0 changes two defaults. An empty `operator.attribution` resolves to `proven`, which this chart's `asserted` default keeps off, and under `supportProfile: P1` an empty `networkPolicy.ploegd.ingressFrom` refuses the render, which step 4's values already set.

## Known gaps

* **No region check.** Unfold's `gatewayPolicy` is refused under Ploeg, and neither application checks where a request was served. The region boundary rests entirely on the gateway's configuration, and this repository ships no LiteLLM configuration to start from.
* **Tenancy is recorded, not enforced.** Membership groups change nothing a person can see or do yet; the role groups and `config.ploeg.userTeams` decide access, and `userTeams` needs each person's Unfold user id, which exists only after their first sign-in.
* **Ploeg's sandbox profile.** Ploeg's sandbox executor is outside its supported profile under gVisor and under Kata with guest seccomp off, the way the Talos extension ships it.
* **Name collision.** The chart renders Unfold's and Ploeg's resources under the same names unless `ploeg.fullnameOverride` is set, and does not refuse that.
* **The same repository twice.** A repository and its board are written once in Unfold's and once in Ploeg's configuration, and nothing compares the two.
* **One forge per Ploeg release.** Ploeg's workers push to one forge per release, and GitLab is outside its supported profile.
* **Knowledge setup.** No graph schema or stored-query file is in this repository, and no page describes deploying or backing up Omnigraph; the knowledge ADRs are proposed.
* **Person-less changes under `proven`.** Run card comments, the verifier's calls and an administrator acting for someone else's session carry no person token, and Ploeg refuses them under `proven`.
* **No Unfold downgrade path.** Ploeg documents rolling back one release; this repository documents no downgrade of Unfold's own database. Restore the backup from before the upgrade.
* **Single replica.** Unfold runs one replica, and high availability for either application is not built.
* **Not run end to end.** No one has followed this page on a cluster other than the owner's; the values were rendered, not installed.
