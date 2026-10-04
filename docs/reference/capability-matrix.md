---
type: reference
audience: [owner, operator, integrator]
owner: unfold
last_verified: 2026-10-03
verified_by: "VIK-1749: each row read against apps/ploeg/ops/helm/ploeg/values.yaml, templates/_helpers.tpl and deployment.yaml, ci/golden/executor.yaml, the named Go tests and package documentation, apps/unfold/docs/architecture.md, docs/contracts/ploeg-execution.md, src/main.ts and test/execution.test.ts, and ADR-0002's Confirmation; the named tests ran in mise run verify. LiteLLM's own budget enforcement was not tested here; nothing ran against a live cluster"
---

# Capability matrix

This page lists every security and execution claim on the [marketing site](../../apps/site/src/i18n/en.ts), the settings each claim needs, whether those settings are the default, and the test or source that shows it. When a claim holds only with a setting, the site says so. A claim the code does not meet yet is labelled planned.

The settings are values of Ploeg's Helm chart, `apps/ploeg/ops/helm/ploeg/values.yaml`, and of Unfold's configuration. The [Ploeg configuration reference](../../apps/ploeg/docs/reference/configuration.md) describes each one.

## Credentials

| Claim on the site | Needs | Default? | Shown by |
| --- | --- | --- | --- |
| Each managed Run gets its own model key with a budget and an expiry | `executor.workerAuth.mode: managed`; the expiry is `executor.litellm.keyDuration` (`4h`) | Yes. `legacy` mode hands every Run one static key with neither | `TestMint_AliasFormatIsLoadBearing` and `TestMint_RefusesAnUncappedKey` in [`pkg/llmbroker`](../../apps/ploeg/pkg/llmbroker/litellm_test.go); `TestManagedMintUsesControllerPolicyAndDoesNotRetryUnknownEffects` in [`pkg/httpapi`](../../apps/ploeg/pkg/httpapi/worker_auth_test.go) |
| The gateway refuses further model calls once the budget is spent | Managed mode, as above | Yes | Ploeg sets the key's `max_budget`; LiteLLM enforces it. No Unfold test exercises LiteLLM's enforcement, and a call already in flight can finish over the budget ([Unfold architecture](../../apps/unfold/docs/architecture.md)) |
| A Run's model key is revoked when the Run ends | Managed mode | Yes | `TestRegression_AgentSuccess_RevokesKey` and `TestRegression_AgentFailure_RevokesKey` in [`pkg/worker`](../../apps/ploeg/pkg/worker/worker_test.go) |
| Management keys stay in Ploeg | Chart as shipped | Yes | The LiteLLM master key and the Forgejo bot password are rendered only into the ploegd Deployment ([`templates/deployment.yaml`](../../apps/ploeg/ops/helm/ploeg/templates/deployment.yaml), golden render [`ci/golden/executor.yaml`](../../apps/ploeg/ops/helm/ploeg/ci/golden/executor.yaml)) |
| Reviewers get a read-only forge token | `executor.forgejo.readTokenSecret` or `executor.gitlab.readTokenSecret` once a team has a reading Role | Required: the chart refuses to render without it | [`ci/reject-reader-without-read-token-values.yaml`](../../apps/ploeg/ops/helm/ploeg/ci/reject-reader-without-read-token-values.yaml); `TestReadingClaimIsRefusedWithoutAReadOnlyForgeToken` in [`pkg/worker`](../../apps/ploeg/pkg/worker/reader_token_test.go) |
| Writers share one push token unless a Forgejo bot password is set | Nothing; this is the fallback | Yes, the shared `tokenSecret` | `TestStatic_IsTheUnmintedFallback` in [`pkg/forgebroker`](../../apps/ploeg/pkg/forgebroker/forgejo_test.go); `TestForgeCredentials_AnAdminTokenAloneKeepsTheSharedTokenAndSaysWhy` in [`cmd/ploegd`](../../apps/ploeg/cmd/ploegd/forgecreds_test.go) |
| With a Forgejo bot password, each writing Run gets a token for its own repository | `executor.forgejo.botPasswordSecret` | No. GitLab has no per-Run minting; its writers always share one token | `TestMint_ScopedToTheRunsRepositoryAndTraceable` in [`pkg/forgebroker`](../../apps/ploeg/pkg/forgebroker/forgejo_test.go); `TestClaim_ReturnsAMintedForgeToken` and `TestClaim_NeverReturnsTheSharedForgeToken` in [`pkg/httpapi`](../../apps/ploeg/pkg/httpapi/claim_forge_token_test.go); [Ploeg ADR-0016](../../apps/ploeg/docs/adrs/0016-forge-registry-and-per-run-repo-scoped-credentials.md) |
| That per-Run token is revoked when the Run ends | `botPasswordSecret`, as above | No | The orphan sweep tests in [`pkg/forgebroker`](../../apps/ploeg/pkg/forgebroker/sweep_test.go). The token itself never expires: Forgejo's token API has no lifetime, so revocation is its only limit ([`broker.go`](../../apps/ploeg/pkg/forgebroker/broker.go)) |
| Keeping keys and tokens out of the agent's reach is a setting you turn on | `executor.litellm.keyIsolation: proxy` for the model key; `executor.forgeTokenIsolation: proxy` for the forge token. Qualify each per harness: a harness that calls out from inside DinD cannot reach the worker's loopback | No, both are `""` | `TestIsolatedRunNeverHandsTheKeyToTheHarness` and `TestUnisolatedRunKeepsHandingTheKeyOver` in [`llmproxy_test.go`](../../apps/ploeg/pkg/worker/llmproxy_test.go); `TestForgeProxyRefusesEverythingOutsideTheRunsRepository` in [`forgeproxy_test.go`](../../apps/ploeg/pkg/worker/forgeproxy_test.go) |

## Execution

| Claim on the site | Needs | Default? | Shown by |
| --- | --- | --- | --- |
| Ploeg sets a budget before a Run starts | Nothing | Yes | `LITELLM_KEY_BUDGET` in [`templates/_helpers.tpl`](../../apps/ploeg/ops/helm/ploeg/templates/_helpers.tpl); admission reserves the budget for Unfold's shared sessions ([managed execution](../workflows/managed-execution.md)) |
| With its executor enabled, Ploeg runs the Work Items it takes from trackers | `executor.enabled: true` plus the LiteLLM and forge secrets | No, `executor.enabled` is `false` | [`values.yaml`](../../apps/ploeg/ops/helm/ploeg/values.yaml); [executor contract](../../apps/ploeg/docs/contracts/executor.md) |
| In Ploeg's unattended worker workflow, the Shift ends with a pull request | Executor enabled, as above | No | Unfold's managed candidate path does not publish yet ([site architecture](../../apps/site/docs/architecture.md)) |
| With shared execution on, Ploeg authorizes and budgets the Runs started in Unfold, and Unfold still executes them | Unfold's `execution` configuration | No. Without it, Unfold runs standalone sessions with its own gateway key | `a confirmed Ploeg execution requires its authority and never resumes standalone` in [`test/execution.test.ts`](../../apps/unfold/test/execution.test.ts); [execution contract](../../apps/unfold/docs/contracts/ploeg-execution.md); [`src/main.ts`](../../apps/unfold/src/main.ts) builds the standalone broker only without `execution` |
| Planned: Ploeg executes every Run, and Unfold on its own runs only the deterministic demo | Not implemented yet | - | [ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) is accepted, and its Confirmation is not met |
| Unfold never merges and never deploys to production | Nothing | Yes | Neither Ploeg's forge client ([`pkg/worker/forge.go`](../../apps/ploeg/pkg/worker/forge.go)) nor Unfold calls a merge endpoint |
| The demo is deterministic: no model calls, no spend | Nothing | Yes | [Local demo](../workflows/local-demo.md) |

## Keep it true

To change a security or execution claim on the site, change this page in the same commit, in both [`en.ts`](../../apps/site/src/i18n/en.ts) and [`nl.ts`](../../apps/site/src/i18n/nl.ts). When a default changes in the chart, check every row that names it.
