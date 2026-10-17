# Linked sessions

## ADDED Requirements

### Requirement: A session belongs to the person who first reports it

The first hook report for a harness session id SHALL create a Linked Session
owned by the signed-in person who sent it. A later report for that id from
anyone else MUST answer not found and change nothing.

#### Scenario: Someone reports another person's session id

- **WHEN** a second person posts a report for a session id the first person
  already reported
- **THEN** Unfold answers 404 and the session is unchanged

### Requirement: A session links to Work Items its person may read

A report whose branch names a tracker task SHALL link that task's Work Items
that the person may read, once per branch. An explicit link SHALL need a Work
Item the person may read. Unlinking SHALL stop the branch from linking that
Work Item again. Only the owner or an administrator MAY change links.

#### Scenario: A branch names a ticket

- **WHEN** a session starts on `feat/vik-2051-login` and the person may read
  Work Item 184 for Vikunja task 2051
- **THEN** the session is linked to Work Item 184 with `how: branch`

#### Scenario: The owner unlinks a branch link

- **WHEN** the owner unlinks Work Item 184 and the session reports a new branch
  that also names VIK-2051
- **THEN** the session stays unlinked from Work Item 184

### Requirement: Hooks never send prompts and never block

The plugin SHALL send only the session id, title, repository without
credentials, branch, model, harness version, state, commit ids and subjects,
pull request addresses, and Agent Trace records. Every hook MUST exit 0. When
Unfold is unconfigured or unreachable, a hook MUST print nothing.

#### Scenario: Unfold is down

- **WHEN** a hook cannot reach Unfold
- **THEN** it exits 0 with no output and the session continues

### Requirement: Each commit carries an Agent Trace 0.1 record

For each new commit that holds lines the session wrote, the plugin SHALL build
one Agent Trace 0.1 record and store it as a git note under
`refs/notes/agent-trace`. The record names that commit in `vcs.revision` and
links the session's Unfold page as the conversation URL. Unfold SHALL validate
the record as strictly as the hosted schema and refuse unknown fields outside
`metadata`.

#### Scenario: A commit mixes agent and person lines

- **WHEN** a commit adds three lines the session wrote and one a person wrote
- **THEN** the record holds one range over the three agent lines, and the
  person's line is not attributed

### Requirement: Telemetry is read, labelled an estimate, and shown only to the owner

Unfold SHALL read a session's cost, tokens and active time from
`observability.metricsUrl`, and its event counts, top tools and Claude account
id from `observability.logsUrl`, by session id. It MUST NOT query prompt or tool
content. Cost SHALL be labelled an API-price estimate. Telemetry SHALL be shown
only to the session's owner and administrators.

#### Scenario: A teammate opens the session

- **WHEN** a person who may read the linked Work Item opens the session
- **THEN** they see its state, Work Items and commits, and no telemetry
