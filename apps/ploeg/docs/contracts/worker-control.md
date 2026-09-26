# Managed worker control

The implementation follows [ADR 0025](../adrs/0025-management-authority-stays-in-the-control-plane.md), which remains proposed for human ratification. The existing work payloads remain in the [executor contract](executor.md). Deployment and reconciliation are covered in the [managed-worker operations guide](../ops/managed-workers.md).

## Authority

The controller holds LiteLLM management authority. Worker containers receive a bootstrap capability scoped to one team and role. Successful admission exchanges that capability for a signed capability bound to the Run, worker identity, team, role and worker-control audience. The worker identity travels in `X-Ploeg-Worker-ID`; HTTP authentication uses an Authorization bearer header. Transport must be authenticated and confidential across trust boundaries.

A Run token identifies work; it does not authenticate a managed request. The signed control capability has a maximum lifetime of 24 hours, and each control operation also checks the current Run deadline and state. A finished managed outcome can be delivered again only with its original authenticated capability and identical outcome digest. A changed outcome cannot revise a finished Run.

| Operation | Required authority | Result |
| --- | --- | --- |
| `POST /api/v1/claim` | Bootstrap capability matching the requested team and role; worker identity | Existing claim payload plus `controlToken`; managed inference authorization is reserved first |
| Run renew, checkpoint and outcome routes | Matching signed Run capability and worker identity | Existing work-control behavior |
| `POST /api/v1/runs/{token}/llm/credential` | Live signed Run capability | One inference key and alias; controller policy selects the budget, models and TTL |
| `POST /api/v1/runs/{token}/llm/block` | Live signed Run capability | Blocks matching gateway keys while retaining accounting identities |
| `GET /api/v1/runs/{token}/llm/spend` | Live signed Run capability | Provisional observed cost; absent gateway accounting is an error |

Managed worker queue snapshots are unavailable. `GET /api/v1/queue/depth` was removed on 2026-09-23 because nothing consumed it. Human applications use the separately authorized [operator contract](README.md#operator-read-consumers).

Operator execution credential issuance uses the same account but also checks its exact execution generation, live deadline and running state under the execution lock. The checks occur before the external mint and again before recording the returned credential. A pause or generation change during mint prevents credential delivery; cleanup attempts to block the returned key and retains the unresolved hold.

## Accounting states

The account is independent of the worker outcome and lives in [migration 0012](../../pkg/store/migrations/0012_run_llm_accounts.sql). The controller records account mutations and audit events atomically. The following states are implemented in [the account store](../../pkg/store/llm_accounts.go):

| State | Meaning | Budget treatment |
| --- | --- | --- |
| `reserved` | Admission exists; no mint has begun | Authorization remains held |
| `minting` | Durable external-mint intent has been claimed | Authorization remains held; another request cannot mint |
| `issued` | Gateway identity was recorded after a successful mint | Hold is at least the authorization or higher observed cost |
| `unknown` | An external effect or response cannot be established | Hold remains; no automatic replacement credential |
| `blocked` | Gateway blocking was confirmed, or an untouched reservation was atomically prevented from minting | Hold remains because observed spend is provisional |
| `reconciled` | A trusted caller supplied final evidence for a finished Run | Reconciled cost is charged to its Shift; any subsequently observed positive delta remains held |

Mint intent has one durable winner. If a response is lost, retry does not mint another key or reconstruct the plaintext credential. A controller restart cannot turn an unknown mint into a new paid attempt.

Managed worker outcomes do not settle the account. Worker failure, lease expiry, repeated zero gateway observations and successful key blocking do not prove final zero cost. `ReconcileLLMAccount` requires a finished Run, trusted evidence and a nonnegative amount no lower than recorded observations or previous reconciliation. An unchanged reconciliation adds no duplicate spend; a later positive correction charges only its delta. An untouched reserved account may be reconciled as zero with evidence that mint never began. Blocking an untouched reservation records a zero observation and prevents any later mint; it retains the hold until trusted reconciliation. Repeated blocking is idempotent. The controller's settlement sweep is the trusted caller: it settles never-minted accounts at zero and blocked accounts at the gateway's spend-log total after a quiet period, as described in [the managed-worker runbook](../ops/managed-workers.md#reconcile-uncertainty).

## Workspace boundary

Workers cannot instantiate a LiteLLM administrative broker. Startup rejects known administrative environment variables as an additional configuration check. The deployment boundary is the controller-only Secret wiring in [the Helm chart](../../ops/helm/ploeg/templates/_worker_control.tpl); a name denylist alone is not isolation.

Harness child environments are built from a small allowlist and a dedicated HOME, temporary directory and XDG paths. They receive the assigned inference key and, for a writer, its selected forge capability. OpenCode configuration stores an environment reference to `LLM_API_KEY`. Git authentication uses transient environment configuration scoped to the exact repository URL; clone URLs and `.git/config` do not contain the credential. At startup the worker marks its own process non-dumpable ([conceal_linux.go](../../pkg/worker/conceal_linux.go)), so a harness running as the same user cannot read the worker's environment or memory through `/proc`; the bootstrap token and the builder forge token therefore stay out of the harness's reach unless the worker hands them over.

The worker parent and harness still share a process/container boundary. A workspace may inspect same-identity parent resources such as `/proc` and discover its scope-limited bootstrap or forge capability. The controller's management, signing and operator credentials must therefore remain absent from that container. This foundation does not establish stronger process confinement, repository write fencing or cluster egress policy.

## Compatibility

Managed mode is the default and fails closed when identity, policy or broker configuration is missing. Legacy operation requires the controller's explicit `legacy` worker-auth mode and the worker's `static-compatibility` credential mode. Legacy mode cannot simultaneously carry the managed signing key or bootstrap registry. Existing unmanaged rows preserve their previous accounting interpretation; they are not upgraded into evidence of managed settlement.

No automatic downgrade, live deployment or migration of existing external credentials is performed by this change.
