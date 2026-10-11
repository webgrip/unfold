# Agent knowledge scopes

## ADDED Requirements

### Requirement: Knowledge has four scopes in two graphs per Tenant

Each Tenant SHALL have a knowledge graph holding concepts scoped to the
Tenant, one Client or one repository, and a notes graph holding Work Item
Notes (ADR-0034).

#### Scenario: A new Tenant

- **WHEN** a Tenant is provisioned with knowledge enabled
- **THEN** it gets one knowledge graph, one notes graph, a run actor and a review actor, and no right on any other graph

### Requirement: A Run reads every level that applies to its Work Item

A Run SHALL be briefed from its Tenant's concepts, its Client's concepts, its
repository's concepts and the Work Item Notes of its root Work Item, and from
nothing else in the Tenant's graphs.

#### Scenario: Another Client's knowledge

- **GIVEN** concepts for Client A and Client B in one Tenant
- **WHEN** a Run of a Client A Work Item is briefed
- **THEN** its pack holds no concept of Client B

#### Scenario: Created work shares its root's notes

- **GIVEN** a Run of Work Item X wrote a note
- **WHEN** a Run of a Work Item created under X is briefed
- **THEN** the note is in its pack, marked unreviewed

### Requirement: Only a Work Item Note skips review

An agent's or person's note SHALL reach other work only after a Tenant admin
accepts a Promotion of it. The actor that serves Runs MUST be refused any write
to the knowledge graph by Omnigraph itself.

#### Scenario: A suggested repository convention

- **WHEN** a Run suggests a learning with repository scope
- **THEN** Runs under other roots do not read it until a Tenant admin accepts the Promotion

#### Scenario: The run actor tries to write reviewed knowledge

- **WHEN** the run actor writes to the knowledge graph
- **THEN** Omnigraph answers 403

### Requirement: Repository knowledge also reaches the repository's git

An accepted repository Promotion SHALL also open a pull request that adds the
concept to the repository's `knowledge/` directory, delivered by a Run. Once
that file is on the default branch, a pack SHALL keep it over the graph copy.

#### Scenario: A client merges the knowledge pull request

- **GIVEN** an accepted repository Promotion whose pull request the client merged
- **WHEN** a Run of that repository is briefed
- **THEN** its pack holds the repository's file, not the graph copy

### Requirement: No graph token outside Ploeg

Graph tokens SHALL be held by Ploeg's ploegd only. No Run, harness, session,
browser or Unfold process MUST hold one.

#### Scenario: Unfold's configuration

- **WHEN** Unfold and unfold-mcp are configured for knowledge
- **THEN** neither has an Omnigraph URL or token

### Requirement: Graphs outside the Tenant are unreachable

A Tenant's actors MUST get 403 on every other Tenant's graphs and on every
graph that belongs to no Tenant, including the owner's personal graphs.

#### Scenario: Live check

- **WHEN** the run actor of a Tenant reads a personal or another Tenant's graph
- **THEN** Omnigraph answers 403
