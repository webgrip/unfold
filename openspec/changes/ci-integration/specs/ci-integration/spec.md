# CI integration

## ADDED Requirements

### Requirement: The CI panel shows Ploeg's CI facts

Unfold SHALL show a Work Item's CI from Ploeg's CI facts only: each job with its
required flag, state and cause class, required jobs first. Advisory jobs MUST
NOT set the reason a Work Item waits.

#### Scenario: A cancelled required job

- **WHEN** Ploeg reports a required job with cause class `cancelled`
- **THEN** the panel shows it cancelled, and the waiting reason says to re-run
  CI in the forge

#### Scenario: Only an advisory job is red

- **WHEN** every required job passed and an advisory job failed
- **THEN** the advisory job shows under "Not required", and the Work Item does
  not read as waiting on CI

### Requirement: CI actions call Ploeg after a confirmation

Unfold SHALL offer Re-run CI, Ignore for Ploeg and Mark as flaky, and MUST call
Ploeg's route only after the person confirms. Ignore for Ploeg and Mark as
flaky MUST carry a reason.

#### Scenario: Re-run where the CI cannot re-run

- **WHEN** Ploeg answers `409 rerun_unavailable`
- **THEN** Unfold shows a link to the forge's run and records no action

#### Scenario: Ignore a check

- **WHEN** a person confirms Ignore for Ploeg on a check with a reason
- **THEN** Unfold calls Ploeg's ignore route with the reason, and the
  confirmation said that merging still needs the check

### Requirement: Each CI close reason has a cause and a fix

Unfold SHALL word each of Ploeg's CI close reasons with a chip, a sentence and
a fix, on the Work Item page, Now, notifications, the MCP tools and the Agents
window.

#### Scenario: Base branch red

- **WHEN** a Work Item closes with `ci_base_red`
- **THEN** every surface says the base branch is red and that the Work Item
  continues once it is green

### Requirement: A notice when CI stops a Work Item

Unfold SHALL send one notice when CI parks a Work Item, naming the cause and
the fix, with links to Unfold and the tracker task.

#### Scenario: Infrastructure failure

- **WHEN** a Work Item closes with `ci_infrastructure`
- **THEN** its people get one notice saying CI infrastructure failed and to
  check the runners
