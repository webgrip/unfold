---
status: proposed
date: 2026-10-03
decision-makers: Ryan Grippeling
---

# A Tenant sits above Teams and bounds what users, sources and budgets can reach

## Context and Problem Statement

The owner's requirement (2026-10-03): Unfold is an RBAC'd, SSO'd, multi-tenant environment, and a user sees only what they are allowed to see. [ADR-0009](adr-0009-one-tenant-per-agency.md) decided one Tenant per Agency, isolated in the cluster by namespace, network, runtime and credentials, and says Ploeg records the Tenant on every Team, Work Item, Shift and credential. It does not say which entity Ploeg and Vloer check a request against. Today that entity is the Team, and a Team is not an access boundary:

* In Ploeg a Team is a capability pool: Roles, harness, models and caps such as `bronze` or `silver`. It never names a repository, forge or credential ([Ploeg model](../../apps/ploeg/docs/domain/model.yaml), R11).
* Created work may go to any registered Team (`followup.Decide` in `apps/ploeg/pkg/followup/followup.go`). `createWorkItems` in `apps/ploeg/pkg/store/created_work.go` locks by the source Team but sums the pool by root Work Item, so children created under different Teams can overrun one root budget.
* The deploy endpoint accepts one deployment-wide token for every repository (`NewDeployAuth` in `apps/ploeg/pkg/httpapi/deploys.go`).
* `File.ScopeTeams` in `apps/ploeg/pkg/config/resolve.go` keys pins by bare container id across Vikunja and ClickUp, so a repeated pin silently overwrites the previous one.
* Operator admission checks the Team against the consumer's scope, but takes the repository id and URL from the request (`handleAdmitExecution` in `apps/ploeg/pkg/httpapi/operator_execution.go`).
* Vloer returns every configured repository and task source to every signed-in user and reads tasks with the source's service token without a per-user check (`apps/vloer/src/http.ts`, `src/tasks.ts`, `src/task-handoff.ts`). Only Ploeg team access is enforced, by `PloegClient.allowed` and `authorize` in `apps/vloer/src/ploeg.ts`.

Which entity bounds what a user, a source and a budget can reach, how does it relate to Team and to ADR-0009's Tenant, and where is it enforced?

## Decision Drivers

* A user never sees, imports or runs another Tenant's tasks, repositories, Work Items, Run Cards or spend.
* Each check happens in the service that owns the data. Ploeg does not trust Vloer to have filtered, and Vloer does not trust the browser.
* A Team keeps meaning one thing: what agents and models run the work. Capacity and access stay separate axes, as capacity and codebase already are.
* One code path for self-hosted and hosted Unfold, so isolation is tested where it is used.
* A forbidden object looks like an absent one: probing ids must not reveal another Tenant's work.

## Considered Options

* A Tenant above Teams, owning users, sources, repositories, budgets, deploy identities and Work Items
* Team is the Tenant
* One deployment per Tenant, with no Tenant inside the software

## Decision Outcome

Chosen option: "A Tenant above Teams", because it is the only option that gives one shared Ploeg and Vloer the access boundary ADR-0009 assumes while keeping Team as a capability pool.

**The entity.** A Tenant is ADR-0009's Tenant: one per Agency in hosted Unfold. ADR-0009 means one shared Ploeg and Vloer deployment per cluster, with per-Tenant namespaces for Runs and previews; this ADR adds the application boundary inside that shared deployment. Every install has at least one Tenant. A self-hosted install starts with one default Tenant and may add more, so the checks below always run. A Client is a user inside its Agency's Tenant, as ADR-0009 says.

**What a Tenant owns.** Each item belongs to exactly one Tenant:

* Users and their roles, mapped from SSO groups: a group grants membership of one Tenant and a role in it (viewer, member, admin), and optionally access to some of its Teams.
* Tracker sources, keyed by provider, instance URL and container id.
* Repositories and Work Targets, keyed by forge instance, owner and name.
* Teams. A Team belongs to one Tenant. A shared definition such as `bronze` may be copied into several Tenants as a template, but no Team claims work for two Tenants, because a Team carries budget, concurrency and model routing that ADR-0009 makes per-Agency.
* Budgets and root pools: a root Work Item's pool and every Work Item created under it stay in the root's Tenant.
* Deploy identities: one deploy token per Tenant, valid only for that Tenant's repositories.
* Work Items, Shifts, Runs, Run Cards, audit entries and operator consumers.

**Enforcement in Ploeg.** Not implemented yet.

* Store: every owned row carries `tenant_id`. A Work Item takes it from its source binding or its root, never from a request field.
* Operator API: each consumer is bound to one Tenant and, within it, to Teams. Every read and write filters by Tenant first, then Team. An object outside the scope returns 404.
* Created work: a child stays in its root's Tenant. `knownTeam` accepts only Teams of that Tenant, and the pool lock is taken on the root, not the source Team.
* Admission: the repository must be a registered repository of the Team's Tenant. Request-supplied repository ids and URLs are checked against that registry.
* Deploys: a token resolves to a Tenant, and a report for another Tenant's repository returns 404.
* Configuration: scope pins and routing keys are instance-qualified. A duplicate key is a startup error, not an overwrite, and a pin's Team must belong to the source's Tenant.

**Enforcement in Vloer.** Not implemented yet.

* Sign-in maps the SSO groups claim to Tenant membership and role. A user with no Tenant group gets no data.
* Repositories, task sources and their tasks are listed, read, imported and handed off only within the user's Tenant. The Tenant check comes before any read with a service token. Anything outside it returns 404.
* Vloer forwards the user's Tenant and identity to Ploeg, and Ploeg checks them again against the consumer's scope.

**Follow-up work.** Each item is enforcement of this ADR:

* VIK-1740 — Vloer filters task sources and repositories per Tenant, and checks before any service-token read.
* VIK-1742 — created work keeps its root's Tenant and root budget, with the lock on the root.
* To file — one deploy identity per Tenant.
* To file — instance-qualified tracker and forge keys; duplicate pins fail at startup.
* To file — operator admission accepts only registered repositories of the Team's Tenant.
* To file — `tenant_id` in Ploeg's store and operator consumer scope, and SSO group to Tenant mapping in Vloer.

### Consequences

* Good, because Team keeps one meaning, and access becomes one check in two services rather than a set of per-feature team lists.
* Good, because self-hosted and hosted Unfold run the same checks, so the isolation tests exercise the code customers use.
* Good, because it closes the found gaps: the cross-team budget overrun, the shared deploy token, colliding pins and unscoped Vloer reads.
* Bad, because every Ploeg table, query and operator contract gains a Tenant column or filter, and existing data needs a migration to a default Tenant.
* Bad, because two Tenants cannot share one Team's concurrency. A small Tenant pays for its own idle capacity.
* Neutral, because cluster-level isolation is still ADR-0009's; this ADR does not replace namespaces, network policy or per-Run credentials.

### Confirmation

Proposed tests, none of which exist yet:

* A Vloer HTTP test with two users in disjoint Tenants: neither can list, read, import or hand off the other's tasks, repositories or task sources. Each request for the other Tenant's object returns 404, and the tracker stub records no service-token call.
* A Ploeg operator API test: a consumer scoped to Tenant A gets 404 for Tenant B's Work Item, Run, Run Card and proposed work, and for every list it is filtered out.
* A Ploeg store test: a Run proposing created work for another Tenant's Team is refused and audited, and concurrent children under one root in different Teams cannot exceed the root pool.
* A Ploeg deploy test: Tenant A's token reporting a Tenant B repository gets 404 and records nothing.
* A configuration test: two sources with the same container id on different instances resolve to different keys, and a duplicate key fails startup.

## Pros and Cons of the Options

### Team is the Tenant

* Good, because Team scoping already exists in Ploeg's operator API and in Vloer's `PloegClient`.
* Bad, because a Team is a capability pool. An Agency with `bronze` and `silver` would be two Tenants, or one Team would need every model and cap.
* Bad, because sources, repositories, deploy tokens and users are not Team-shaped: a repository is reached by several Teams, and a user works across them.
* Bad, because created work already moves between Teams, so the boundary would leak by design.

### One deployment per Tenant, with no Tenant inside the software

* Good, because it is the strongest separation and needs no application checks.
* Good, because it already serves the first pilot, which self-hosts (ADR-0009).
* Bad, because a Ploeg, Vloer, database and gateway per Agency costs more than a small Agency pays, as ADR-0009 found for clusters.
* Bad, because a self-hosted install with several departments still needs users limited to what they can see, so the checks are needed anyway.

## Open questions for the owner

1. Teams: per Tenant (proposed), or global capability pools that several Tenants can be granted?
2. Self-hosted: does every install have a default Tenant (proposed), replacing the domain model's "Self-hosted Unfold has no Tenants"?
3. Can one user belong to several Tenants, for example a freelancer working for two Agencies, and if so how do they switch?
4. Does a platform operator, meaning Unfold staff in hosted Unfold, see Tenant content? Proposed: no, apart from an audited break-glass role.
5. Which SSO group format maps to Tenant and role, and does Vloer's per-user `ploeg.userTeams` stay as an override?

## More Information

* Technical story: VIK-1741.
* Refines [ADR-0009](adr-0009-one-tenant-per-agency.md): that ADR's Tenant is the entity defined here, and its cluster isolation is unchanged.
* Relies on [ADR-0002](adr-0002-ploeg-is-the-only-engine.md): Ploeg is the Authority, so Ploeg's checks are the binding ones and Vloer's are the first line.
* 2026-10-03 — Proposed. The owner stated that Unfold is RBAC'd, SSO'd and multi-tenant, and that users are limited to what they can see. The code facts in the problem statement were read on `development` that day.
