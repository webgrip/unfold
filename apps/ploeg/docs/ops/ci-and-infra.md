# CI and infrastructure

The [pull-request workflow](../../.forgejo/workflows/on_pull_request.yml) defines this repository's gates. The [source workflow](../../.forgejo/workflows/on_source_change.yml) handles release decisions, and the [artifact workflow](../../.forgejo/workflows/on_release_published.yml) publishes artifacts. Read those files for the configured actions, permissions and inputs.

## Operate the deployment

Runner and cluster configuration belongs to [homelab-cluster](https://forgejo.webgrip.dev/webgrip/homelab-cluster). Use its [Forgejo runner runbook](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/runbooks/forgejo-runner.md) for current topology and diagnosis. Change desired state in Git and let reconciliation apply it.

Do not copy cluster IPs, workstation kubeconfig paths, runner image contents or access-policy assumptions into Ploeg's setup instructions. Resolve those from the deployment's current configuration.

## Credentials and signing

Follow the [estate secrets model](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/adr/adr-0055-one-secrets-model-six-levels.md): OpenBao holds the original; jobs use configured scoped bridge credentials or short-lived OIDC access. The [artifact workflow](../../.forgejo/workflows/on_release_published.yml) is the source for Ploeg's actual signing and publishing inputs.

Before changing signing or publication, check both the caller workflow and the shared action it references. A local gate cannot establish live vault permissions, registry access or enforcement in a target cluster.

## Historical incidents

The [July infrastructure notes](https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/f2333b96c6b44f489c562f74d6a4654fed29cc01/docs/ops/ci-and-infra.md) preserve the DNS/TLS investigation, package-linking observations and signing rollout context. They contain deployment-specific values and superseded credential advice.

A resolved incident is a diagnostic lead. Its prior cause is neither confirmed nor ruled out when the same symptom returns; verify the current runner, DNS path, action version and relevant service response.
