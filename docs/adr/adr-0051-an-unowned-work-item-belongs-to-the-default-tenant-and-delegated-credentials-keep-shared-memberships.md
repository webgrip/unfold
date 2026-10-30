---
status: accepted
date: 2026-10-30
decision-makers: Ryan Grippeling
---

# A Work Item without a known owner belongs to the default Tenant, and a delegated credential keeps only memberships held twice

## Context and Problem Statement

[ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) puts a Tenant above Teams, and Unfold limits what a person reaches by Tenant and Client behind `tenancy.enforce` (the [tenant-client-scoping change](../../openspec/changes/tenant-client-scoping/design.md)). Two rules in that change were the builder's choice and waited for the owner. Ploeg records no Tenant yet, so who owns a Work Item whose target Unfold does not recognise? And which memberships does a delegated `unfold-mcp` credential carry when its account's memberships change after it was minted?

## Decision Drivers

* A Work Item must never become visible to a Tenant that does not own it.
* An installation with a single Tenant must keep working unchanged.
* A credential must never reach more than its account reaches now.

## Considered Options

* Default owner and memberships held twice (design D7 and D8)
* Hide every Work Item without a recognised owner from everyone
* Let a delegated credential keep the memberships it was minted with

## Decision Outcome

Chosen option: "**Default owner and memberships held twice**", because it keeps single-Tenant installations unchanged while no Tenant can reach another Tenant's work, and no credential outlives a removed membership.

1. **Unknown owner (D7).** A Work Item's owner is the owner of the registered repository its target names: a task source's Ploeg target first, then a repository whose `owner/name` matches. A Work Item with no target, or with a target no repository matches, belongs to the `default` Tenant with no Client. A target that matches repositories of different owners reaches nobody.
2. **Delegated credentials (D8).** A delegated `unfold-mcp` credential acts with the lower of its account's role and the role the caller's token entitles. Its memberships are the ones the account holds both when the credential was minted and when it is used, each Tenant role capped at the role the credential acts with. Over HTTP, "when minted" is the intersection of the account's saved memberships and the memberships the access token's groups grant.

### Consequences

* Good, because a single-Tenant installation sees everything as before.
* Good, because removing a membership at the identity provider takes effect on a delegated credential's next request.
* Bad, because on an installation that also uses `default`, a Work Item with an unknown target is visible to `default`'s members. An installation that uses only named Tenants gives `default` to nobody.
* Neutral, because Ploeg's own Tenant on records ([Ploeg ADR-0178](https://github.com/ploeg-hq/ploeg/pull/389), proposed) replaces rule 1 once Ploeg stores a Tenant.

### Confirmation

* `apps/unfold/test/tenancy-enforce.test.ts` covers a Work Item without a target, one with an unmatched target, one matching two owners, and a delegated credential whose account lost a membership after minting.

## Pros and Cons of the Options

### Hide every Work Item without a recognised owner

* Good, because nothing unowned is ever shown.
* Bad, because a single-Tenant installation would lose every Work Item whose target is not registered.

### Keep the memberships a credential was minted with

* Good, because simple.
* Bad, because a removed membership would keep working for up to the credential's lifetime.

## More Information

* Design: D7 and D8 in the [tenant-client-scoping change](../../openspec/changes/tenant-client-scoping/design.md); built in Unfold #686.
* 2026-10-30: accepted by the owner.
