# Tenant and Client scoping

## ADDED Requirements

### Requirement: Every repository and task source has one owner

Each entry in `repositories[]` and `taskSources[]` SHALL belong to exactly one
Tenant, `default` unless it sets `tenant`, and to at most one Client, the one
its `client` names. Unfold MUST refuse to start when one repository key or one
task source key is registered for two owners, and the error MUST name both
entries.

#### Scenario: The same repository for two Tenants

- **WHEN** two `repositories` entries name `https://forge.example/team/orders.git`
  and `https://FORGE.example/Team/orders` with Tenants `a` and `b`
- **THEN** startup fails naming both entries and both owners

#### Scenario: The same project id on two tracker instances

- **WHEN** two Vikunja sources read project `42` on different API roots for
  different Clients
- **THEN** both load as separate sources

#### Scenario: An existing configuration

- **WHEN** no entry sets `tenant` or `client`
- **THEN** the configuration loads into the same objects as before

### Requirement: A task source fits its repository's owner

A task source's Tenant MUST be its repository's Tenant, and a repository a
Client owns MUST take only that Client's sources.

#### Scenario: A source of another Tenant

- **WHEN** a source of Tenant `default` maps to a repository of Tenant `agency`
- **THEN** startup fails naming the source, the repository and both owners

### Requirement: Enforcement is off unless configured

Unfold SHALL check memberships only when `tenancy.enforce` is `true`. With it
absent or `false`, every response MUST be byte-identical to an Unfold without
this change.

#### Scenario: Flag off

- **WHEN** `tenancy.enforce` is unset and a person with no memberships lists
  sources, reads a task and reads bootstrap
- **THEN** each answer equals the answer of a configuration without owners

### Requirement: People reach only what their memberships reach

With `tenancy.enforce` on, Unfold SHALL list, read, look up, import and hand
off tasks only from task sources the person reaches, and list only
repositories they reach, checking before any read with a service token. A
Tenant membership reaches what its Tenant owns; a Client membership reaches
only what its Client owns. Anything else MUST answer the same 404 as a missing
object.

#### Scenario: Another Tenant's source

- **WHEN** a person in Tenant A requests Tenant B's source, task, hand-off
  status or import
- **THEN** Unfold answers 404 and the tracker receives no request

#### Scenario: Another Client's source

- **WHEN** a Client user of Client X requests a source of Client Y in the same
  Tenant
- **THEN** Unfold answers 404 and the tracker receives no request

#### Scenario: Reading but not changing

- **WHEN** a Client user or a Tenant Viewer imports a task from a source they
  reach
- **THEN** Unfold answers 403 and imports nothing

### Requirement: Ploeg reads follow the target repository's owner

With `tenancy.enforce` on, Work Items, Now, Proposed and Runs SHALL include
only Work Items whose target repository's owner the person reaches, and a read
of one other Work Item MUST answer 404.

#### Scenario: A Client user reads Now

- **WHEN** Ploeg holds Work Items for Client X's and Client Y's repositories
  and a Client X user reads Now
- **THEN** Now lists Client X's Work Items only

### Requirement: A delegated credential never widens memberships

A delegated `unfold-mcp` credential MUST hold only the memberships held both
when it was minted and when it is used, each Tenant role capped at the role
the credential acts with.

#### Scenario: A viewer token for an admin account

- **WHEN** an account with `unfold/a/admin` calls unfold-mcp with a token that
  entitles viewer and carries `unfold/a/admin`
- **THEN** the credential holds Viewer in Tenant A and cannot hand off
