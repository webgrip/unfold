## ADDED Requirements

### Requirement: Explicit scoped review evidence

Unfold SHALL expose optional CodeRabbit remote review evidence only through authenticated, object-authorized session operations. Mutations MUST require live Ploeg-managed execution and the person's execution scope. The adapter MUST use an operator-configured GitHub repository, full source commit SHA, base reference and pinned CLI binary. It MUST NOT issue a verification receipt or record delivery acceptance from a CodeRabbit result.

#### Scenario: Completed external review

- **WHEN** an authorized operator explicitly accepts provider billing and requests a review of a pushed GitHub commit
- **THEN** Unfold records the request before calling CodeRabbit and labels its evidence as external and supplemental

#### Scenario: Incomplete provider result

- **WHEN** findings arrive with missing completion, a nonzero exit, failed outcome or unreviewed files
- **THEN** Unfold MUST NOT report a completed review

### Requirement: Durable request and spend fencing

Requests MUST use durable idempotency keys and bounded per-repository daily request quotas. Retrying a request ID MUST NOT repeat provider work. Restart and cancellation MUST NOT automatically retry a review. Unknown cost MUST remain distinct from measured Run spend.

#### Scenario: Restart after request submission

- **WHEN** the workbench restarts before a review result is recorded
- **THEN** its next read marks the review interrupted without contacting CodeRabbit

#### Scenario: Response after cancellation

- **WHEN** a provider response arrives after local cancellation
- **THEN** the cancelled record remains cancelled

### Requirement: Scoped complete security inventory

Security imports MUST use the documented read-only findings API, bounded pagination and exact repository/organization checks. An incomplete or out-of-scope response MUST preserve the previous snapshot. Imports MUST NOT start scans or claim runtime reproduction. Missing provenance MUST remain explicit.

#### Scenario: Foreign finding in a later page

- **WHEN** a findings page contains a row for another repository or organization
- **THEN** Unfold rejects the import and retains the previous complete snapshot

### Requirement: Credentials stay outside agent workspaces

CodeRabbit credentials MUST be server environment references, MUST be redacted before persistence or display and MUST NOT be inherited by agent workspaces. CLI authentication MUST use a private temporary home outside a checkout and remove it after the invocation. Helm MUST reject CodeRabbit Secrets listed as workspace agent Secrets.

#### Scenario: Shared workspace Secret

- **WHEN** Helm values list a CodeRabbit Secret in `workspaceAgentSecrets`
- **THEN** rendering fails before deployment
