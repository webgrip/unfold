# Session execution migration

## ADDED Requirements

### Requirement: Stored standalone sessions become read-only history

After the upgrade that removes local execution, a stored session that ran on
the `opencode` or `command` runtime SHALL keep its events, Runs, artifacts,
spend and review as history. A session stored as `queued`, `running`,
`waiting_input`, `exporting` or `paused` SHALL be shown as `interrupted` with
the reason "local execution was removed". Unfold MUST NOT start, resume or
retry it.

#### Scenario: Paused local session after upgrade

- **WHEN** Unfold starts with a stored `paused` session whose runtime is
  `opencode`
- **THEN** the session shows `interrupted`, its history is intact, no Workspace
  is created, and only "Run again in Ploeg" or "Close" are offered

### Requirement: A removed local session can be run again only by a person

Unfold SHALL offer "Run again in Ploeg" on a session interrupted by the
removal. It SHALL open the New-session dialog prefilled from that session and
make a new submission only on a person's confirmation.

#### Scenario: Run again creates a new submission

- **WHEN** a person confirms "Run again in Ploeg" on such a session
- **THEN** a new session is created with a link to the old one, and its
  submission is the only paid work that starts

### Requirement: In-flight Operator Executions drain before their code is deleted

The release that makes submission the default SHALL keep the Operator
Execution client so that every managed session admitted before it can finish,
be cancelled, or be closed under the existing contract. Unfold SHALL report the
number of open Operator Executions on its health route. The release that
deletes `execution-authority.ts` MUST refuse to start while its store holds a
session bound to an Operator Execution that is not finished, cancelled or
closed, and SHALL name those sessions.

#### Scenario: Upgrade with an open managed session

- **WHEN** an operator upgrades to the deleting release while one managed
  session is still `running`
- **THEN** Unfold exits with an error naming the session and the drain step in
  the operations guide, and the previous release keeps serving

#### Scenario: Managed session after the default switch

- **WHEN** Unfold restarts on the switching release with a managed session
  admitted before it
- **THEN** that session reconciles under the Operator Execution contract as
  before, and new sessions are submitted as Work Items

### Requirement: Removed configuration is rejected with a migration message

Configuration validation SHALL reject every setting that only local execution
reads, each with a message naming its replacement in the operations guide:
`runtime.kind` other than `demo`, the other `runtime` Workspace keys, the
`docker`, `kubernetes` and `execution` blocks, and the broker's LiteLLM
settings. Settings Asks and the status page still read SHALL stay accepted.

#### Scenario: Gateway URL kept for Asks

- **WHEN** Unfold starts with `litellm.baseUrl` set and no `LITELLM_MASTER_KEY`
- **THEN** it starts, Asks reach the gateway, and no session mints a key

#### Scenario: Old live configuration

- **WHEN** Unfold starts with `runtime.kind: "opencode"`
- **THEN** it exits with "runtime.kind opencode was removed: sessions run in
  Ploeg" and a link to the guide, and starts nothing

### Requirement: The chart drops the Workspace values

The `unfold` chart SHALL drop the `workspace*` values, `workspace-rbac.yaml`
and the workspace namespace. A values file that still sets them SHALL fail
`helm template` through the chart's schema.

#### Scenario: Old values file

- **WHEN** an operator renders the chart with a values file that sets
  `workspaceImage`
- **THEN** `helm template` fails naming the removed value, and nothing is
  deployed

### Requirement: The agent image and its version pins are retired together

The `unfold-agent` image SHALL no longer be built or published, and every
reference to it (example configurations, Renovate's regex manager, the
`opencode` package rule, `apps/unfold/mise.toml` probe tasks, release scripts,
the artifacts table) SHALL be removed in the same change. The OpenCode version
Unfold shows SHALL come only from Ploeg's per-Run record.

#### Scenario: Renovate after the removal

- **WHEN** Renovate runs on `development` after the change
- **THEN** it opens no `opencode` group update against this repository, and no
  configuration, build or release file names `unfold-agent`
