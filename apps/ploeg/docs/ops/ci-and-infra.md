# CI and infrastructure

The [pull-request workflow](../../../../.forgejo/workflows/on_pull_request.yml) defines this repository's gates. The [source workflow](../../../../.forgejo/workflows/on_source_change.yml) handles release decisions, and the [artifact workflow](../../../../.forgejo/workflows/on_release_published.yml) publishes artifacts. Read those files for the configured actions, permissions and inputs.

## Operate the deployment

Runner and cluster configuration belongs to [homelab-cluster](https://forgejo.webgrip.dev/webgrip/homelab-cluster). Use its [Forgejo runner runbook](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/runbooks/forgejo-runner.md) for current topology and diagnosis. Change desired state in Git and let reconciliation apply it.

Do not copy cluster IPs, workstation kubeconfig paths, runner image contents or access-policy assumptions into Ploeg's setup instructions. Resolve those from the deployment's current configuration.

## Forge webhooks

`POST /webhooks/forge/forgejo` and `POST /webhooks/forge/gitlab` act only when two things are in place:

1. **A webhook secret.** Set `executor.forgejo.webhookSecret` (`PLOEG_FORGEJO_SECRET`) or `executor.gitlab.webhookSecret` (`PLOEG_GITLAB_SECRET`) and give the forge's webhook the same value. Without it ploegd rejects every delivery and logs a warning at start ([configuration](../reference/configuration.md)).
2. **A network path from the forge to ploegd on port 8080.** Both the forge's egress policy and ploegd's ingress policy must allow it.

Until both hold, merges still reach Ploeg through the periodic pull request reconcile, but a person's review and a failed check do not.

On 2026-09-27, homelab-cluster's `kubernetes/apps/forgejo/networkpolicy.yaml` allowed Forgejo egress to the `ploeg` namespace on 8080, but `kubernetes/apps/ploeg/ploeg/app/networkpolicy.yaml` admitted no traffic from the `forgejo` namespace, and the Ploeg HelmRelease set no webhook secret. Forgejo webhooks therefore did not reach Ploeg in that deployment. Wiring them is a change to homelab-cluster: an ingress rule, a secret and the webhook registration.

## Credentials and signing

Follow the [estate secrets model](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0055-one-secrets-model-six-levels.md): OpenBao holds the original; jobs use configured scoped bridge credentials or short-lived OIDC access. The [artifact workflow](../../../../.forgejo/workflows/on_release_published.yml) is the source for Ploeg's actual signing and publishing inputs.

Before changing signing or publication, check both the caller workflow and the shared action it references. A local gate cannot establish live vault permissions, registry access or enforcement in a target cluster.

## Historical incidents

The [July infrastructure notes](https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/f2333b96c6b44f489c562f74d6a4654fed29cc01/docs/ops/ci-and-infra.md) preserve the DNS/TLS investigation, package-linking observations and signing rollout context. They contain deployment-specific values and superseded credential advice.

A resolved incident is a diagnostic lead. Its prior cause is neither confirmed nor ruled out when the same symptom returns; verify the current runner, DNS path, action version and relevant service response.
