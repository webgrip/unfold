# Integration registries

## ADDED Requirements

### Requirement: Providers are registered adapters

Unfold SHALL reach task trackers, linked accounts and forge publishers only
through adapters registered by name. A configuration that names a provider no
adapter registered MUST fail at start-up. Code outside an adapter MUST NOT
compare a provider name or declare a union of provider names.

#### Scenario: An unknown task provider

- **WHEN** a task source names `provider: jira` and no adapter registered `jira`
- **THEN** Unfold refuses the configuration with "Unsupported task source provider"

### Requirement: Capabilities come from the adapter

Hand-off to Ploeg, issue filing for Report a problem, tracker assignment
routes and the tracker's name in messages SHALL be capabilities the adapter
declares. Unfold SHALL offer a capability for a source only when its adapter
declares it.

#### Scenario: A provider without hand-off

- **WHEN** a GitHub source is assigned to Ploeg
- **THEN** hand-off is refused with the names of the providers that declare it

### Requirement: Reference formats are adapter data

A tracker reference such as Vikunja's SHALL be built and recognised only from
the reference format its adapter supplies.

#### Scenario: A Vikunja Work Item on a card

- **WHEN** a Run Card names a Work Item from Vikunja with external id 2051
- **THEN** its reference is the Vikunja adapter's prefix followed by `-2051`

### Requirement: Every supported forge publishes

Approving a delivery candidate SHALL push the branch and open the pull request
on the forge `delivery.publisher.kind` names: Forgejo, GitHub or GitLab. A
restart SHALL find the existing proposal by its publication marker instead of
opening a second one.

#### Scenario: A GitLab repository

- **WHEN** `delivery.publisher.kind` is `gitlab` and a candidate is approved
- **THEN** Unfold pushes the branch and opens one merge request through the GitLab REST API
