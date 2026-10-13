# Harness selection

All behaviour below is proposed. The shape of a Team's Harness offer and of
the admission fields is owned by Ploeg's operator API contract as extended by
the ploeg-hq changes `record-harness-per-run` (per Role `harness`, `model` and
`observedHarness`), `select-harness-per-run` (allowlist, default and
qualification per Role, a Harness on the admission) and `interactive-runs`
(`interactive` per Harness). The models each Role's policy lists and the
model on the admission come from `select-harness-per-run`, with Ploeg ADR-0103, which narrows Ploeg
ADR-0039. The per-Run record is owned by Ploeg's Run shapes
(Ploeg ADR-0091, extended by `record-harness-per-run` with `harnessVersion` and
`harnessAgent`). This spec references them and does not restate them. The owner
decided on 2026-10-13 that a person chooses the model per session from the
Team's list (design R1).

## ADDED Requirements

### Requirement: The picker offers only what Ploeg allows for the Team

The New-session dialog SHALL show a Harness picker in place of the Runtime and
Workspace placement fields. Its options SHALL be the allowlist Ploeg's Teams
read gives for the chosen Team, each with its profile, qualification and
whether it is interactive, and the Team's default SHALL be preselected.
Changing the Team SHALL refresh the options. Unfold MUST NOT offer a Harness
Ploeg does not list, and MUST NOT keep its own list of Harnesses.

#### Scenario: Team with two allowed Harnesses

- **WHEN** Ploeg lists `acp/opencode` (default, interactive) and `openhands`
  (not interactive) for Team `delivery`, and a person picks that Team
- **THEN** the picker shows both, `acp/opencode` is selected, `openhands` says
  it runs without asking, and no Runtime or placement field is shown

#### Scenario: Unqualified entry

- **WHEN** the allowlist contains `acp/qwen-code` marked unqualified
- **THEN** the picker shows it as unqualified next to its name

#### Scenario: Ploeg is unreachable

- **WHEN** the Team offers cannot be read
- **THEN** the dialog says so, disables Create session, and offers no guessed
  default

### Requirement: The dialog offers only the models the Team's Role policy lists

The New-session dialog SHALL offer a model choice whose options are only the
models Ploeg's Teams read lists in the chosen Team's Role policy, and SHALL
preselect the Role's model. Changing the Team SHALL refresh the options. Unfold
MUST NOT offer a model Ploeg does not list, and MUST NOT keep its own list of
models for sessions.

#### Scenario: Role policy with two models

- **WHEN** Ploeg lists the models `sonnet` (the Role's model) and `opus` for
  the builder Role of Team `delivery`, and a person picks that Team
- **THEN** the dialog offers exactly those two models with `sonnet` selected

#### Scenario: Role policy with one model

- **WHEN** Ploeg lists only the Role's model for the chosen Team
- **THEN** the dialog shows that model selected and offers no other

### Requirement: The dialog shows the observed version

The dialog SHALL show the last observed Harness version as Ploeg states it,
and SHALL label the version as last observed, not as the version the session
will get.

#### Scenario: Version observed

- **WHEN** Ploeg's Teams read gives a Role `observedHarness` with version
  `1.18.30`
- **THEN** the dialog shows "last observed 1.18.30" with its time

#### Scenario: No version observed yet

- **WHEN** Ploeg's Teams read gives a Role no `observedHarness`
- **THEN** the dialog shows the configured Harness and "no version observed
  yet", and infers no version

### Requirement: The choice travels with the submission and is enforced by Ploeg

Unfold SHALL send the chosen Harness and the chosen model on
`POST /api/v1/operator/work-items` and SHALL store both on the session as part
of the submission fingerprint, persisted before the call. Ploeg is the
authority on whether the choice is allowed. When Ploeg refuses it, Unfold
SHALL show the refusal and MUST NOT fall back to another Harness or model or
resubmit on its own.

#### Scenario: Offer changed between dialog and submit

- **WHEN** an administrator removes a Harness from the Team after the dialog
  opened, and a person submits with it
- **THEN** Ploeg refuses the admission and records nothing, the session is not
  started, and the dialog shows the refusal with the current offer

#### Scenario: Model not on the Role's list

- **WHEN** an administrator removes `opus` from the Role's policy after the
  dialog opened, and a person submits with `opus`
- **THEN** Ploeg refuses the admission and records nothing, the session is not
  started, and the dialog shows the refusal with the current model list

#### Scenario: Restart between persisting and submitting

- **WHEN** Unfold restarts after it persisted the session's `requestId`,
  Harness and model and before Ploeg answered
- **THEN** recovery replays the same `requestId` with the same Harness and
  model, and
  Ploeg holds one Work Item

### Requirement: Unfold shows the Harness and model Ploeg resolved for each Role

Unfold SHALL show, from the admission response and later from each Run, the
Harness and model Ploeg resolved for every Role of the session, including where
a Role uses its default instead of the person's choice. Try again SHALL be
Ploeg's requeue, which reuses the Harness and model stored on each Run; Unfold
MUST NOT offer a different Harness or model on Try again, and a different one
SHALL need a new session.

#### Scenario: Reviewer Role on its default

- **WHEN** a person picks `acp/opencode` and Ploeg resolves the reviewer Role
  to `openhands`
- **THEN** the session shows `acp/opencode` for the builder and `openhands`
  for the reviewer before the first Run starts

#### Scenario: Try again keeps the Harness

- **WHEN** a person chooses Try again on a session whose builder Run stored
  `acp/opencode` and `opus`
- **THEN** the requeued Runs use the Harness and model Ploeg stored, and the
  dialog for Try again has no Harness or model field

### Requirement: Each Run shows its Harness and version

Every Run Unfold shows (session view, Work Item page, Agents window) SHALL
display `harness`, `harnessProfile`, `harnessVersion` and `harnessAgent` as
Ploeg recorded them. A field Ploeg reports as null SHALL be shown as "not
recorded", never inferred from the session's choice, the Team default or the
observed version.

#### Scenario: Run recorded before the version existed

- **WHEN** Ploeg returns a Run with `harness` set and `harnessVersion` null
- **THEN** Unfold shows the Harness and "version not recorded"

#### Scenario: Run served by a fallback model

- **WHEN** Ploeg marks a Run with `modelMismatch: true`
- **THEN** Unfold shows the configured and served model groups next to the
  Harness
