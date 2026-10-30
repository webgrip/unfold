# Tenant and Client scoping in Unfold

## Why

[System ADR-0017](../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)
decided that a Tenant owns its users, task sources and repositories, that a
Client inside a Tenant owns some of them, and that Unfold lists, reads, imports
and hands off only within a person's Tenant before any read with a service
token. Since PR #678, Unfold saves each person's Tenant and Client memberships
at sign-in, but nothing says who owns a repository or a task source, and every
signed-in person still reaches every source and task (VIK-1740, VIK-1878).

Application: `apps/unfold`. Ploeg does not record a Tenant yet (VIK-1876), so
Unfold's checks are the first line, and Ploeg's own checks come later.

## What Changes

Two slices, one pull request each:

- **P1.2 Tenant and Client in config.** `repositories[]` and `taskSources[]`
  take an optional `tenant` (the default Tenant `default` when unset) and an
  optional `client`. Startup refuses an invalid id, one repository or one
  tracker project registered for two owners (VIK-1879, Unfold side), and a
  source whose owner does not fit its repository's owner. The chart's values
  schema documents both fields. Nothing else changes.
- **P1.3 Enforcement behind `tenancy.enforce`.** Off by default. When on,
  task sources, tasks, task lookup, imports, hand-off and repositories are
  filtered by the person's Tenant memberships, then Client memberships, before
  any read with a service token. Out-of-scope objects answer the same 404 as
  missing ones. The Ploeg reads Unfold already filters by Team (Work Items,
  Now, Proposed, Runs) are also filtered by the owner of each Work Item's
  target repository. A delegated `unfold-mcp` credential holds no wider
  memberships than its lowered role allows. With the flag off, every answer is
  byte-identical to today.

Turning the flag on in a deployment is the owner's change in
`webgrip/homelab-cluster`.

## Capabilities

### New Capabilities

- `tenant-client-scoping`: who owns a repository and a task source, and what a
  person's memberships let them reach in Unfold.

### Modified Capabilities

- none

## Impact

- `apps/unfold/src/tenancy.ts`, `config.ts`, `tasks.ts`, `types.ts`: owner
  fields, keys and startup checks (P1.2).
- `apps/unfold/src/tenant-scope.ts` (new), `http.ts`, `ploeg.ts`, `auth.ts`,
  `mcp-http.ts`, `task-handoff.ts`: enforcement (P1.3).
- `apps/unfold/ops/helm/unfold/values.yaml` and `values.schema.json`.
- `apps/unfold/docs/operations/task-connections.md` and `live.md`.
- Tickets: VIK-1740, VIK-1878, VIK-1879 (Unfold side). VIK-1877's Tenant
  switcher is not part of this change.
