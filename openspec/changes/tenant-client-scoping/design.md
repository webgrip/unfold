## Context

`apps/unfold/src/tenancy.ts` parses SSO groups `unfold/<tenant>/<role>` and
`unfold/<tenant>/client/<client>` into memberships, and the store saves them at
each sign-in. A local password account holds its role in the `default`
Tenant. Repositories and task sources are listed in the server configuration
and returned to everyone; tasks are read with each source's service token.

## Goals / Non-Goals

**Goals:**

- Every repository and task source has exactly one owner: a Tenant and at most
  one Client.
- With `tenancy.enforce` on, a person reaches only what their memberships
  reach, and anything else looks absent.
- With it off, nothing changes.

**Non-Goals:**

- The Tenant switcher and the active Tenant on every request (VIK-1877).
- Ploeg's own Tenant column and checks (VIK-1876, VIK-1786).
- Client actions such as approving or signing off (the `client-sign-off` change).

## Decisions

**D1 Owner fields.** `tenant` and `client` are optional on both entries. An
entry without them belongs to `default` with no Client. They are kept only when
set, so an existing configuration loads into the same objects.

**D2 Keys.** A repository is keyed by forge host and `owner/name`, lower-cased,
without `.git`. A task source is keyed by provider, API root and project id.
Two entries with one key must name the same owner; otherwise startup fails
naming both entries. Two connection ids for one project and one owner stay
allowed, because the task API already treats them as one task identity.

**D3 Source and repository fit.** A source's Tenant is its repository's Tenant.
A repository a Client owns takes sources of that Client only. A Client's source
may use a repository of its Tenant that no Client owns.

**D4 Reach.** A Tenant membership with any Access Role reaches everything the
Tenant owns. A Client membership reaches only what that Client owns, never
what no Client owns. Unfold's workbench role (admin, operator, viewer) grants
no Tenant access, so a workbench admin without a membership reaches nothing,
as the ADR's "Unfold staff never see Tenant content" requires.

**D5 Changing.** Importing, handing off and taking back need a Tenant
membership as Developer or Admin in the source's Tenant. A Viewer membership or
a Client membership reads but does not change; they get the existing 403,
because the object is visible to them. The workbench viewer check still runs
first.

**D6 Absence.** An out-of-scope source answers `404 source_not_found`, the
answer for an unknown id, before any tracker request. An out-of-scope
repository in `POST /api/sessions` answers the `400 unknown_profile` an
unknown repository gets. An out-of-scope Work Item answers Ploeg's usual
`404 ploeg_not_found`.

**D7 Work Items.** Ploeg records no Tenant yet, so a Work Item's owner is the
owner of the registered repository its target names: a task source's Ploeg
target first, then a repository whose `owner/name` matches. A Work Item with no
target, or a target no repository matches, belongs to `default` with no
Client, like a repository that names no owner. A target that matches
repositories of different owners reaches nobody. Lists drop out-of-scope
items; reads of one item answer 404. Runs are kept when their Work Item is
reached; Unfold reads an unknown Work Item's target once and remembers it.

**D8 Delegated credentials.** A delegated `unfold-mcp` credential acts with
the lower of the account's role and the role the caller's token entitles.
Its memberships are the ones held both when it was minted and when it is
used, each Tenant role capped at the role the credential acts with (viewer as
Viewer, operator as Developer, admin as Admin), and Client memberships kept
only when held at both times. Over HTTP, "when minted" is the intersection of
the account's saved memberships and those the access token's groups grant,
so a token without membership groups reaches nothing while the flag is on.

## Risks / Trade-offs

- A person in two Tenants sees both until the switcher exists; nothing mixes
  inside one object, but lists combine.
- D7's default owner makes an unknown target visible to the `default`
  Tenant's members. On an install that uses only named Tenants, nobody holds
  `default`, so nobody sees it.
- Runs, audit events and unsettled accounts whose Work Item Unfold has not
  read cost one Ploeg read each while the flag is on.
- The Insights figures from delivery facts (economics, the Delivery ledger
  and its CSV) keep only reached Work Items, read from each fact's target.
- Ploeg's per-Team summary counts and spend, Run Cards, crack attributions,
  connections, and the folders the agent host offers over its own protocol
  are still filtered by Team or not at all.
  `GET /api/agent-host` lists only reached repositories.
