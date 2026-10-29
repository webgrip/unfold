---
status: proposed
date: 2026-10-29
decision-makers: Ryan Grippeling
---

# Projects share accounts and repositories within a Tenant, and a Work Item has one origin

## Context and Problem Statement

An Agency's Clients rarely have tidy one-board-one-repository setups. Three cases come up in every agency:

* One tracker account serves several Clients: one ClickUp workspace, one Jira site, one Vikunja instance, with a List or board per Client.
* One repository serves several Clients or projects: a shared component library, a monorepo, the Agency's own deployment templates.
* The same piece of work shows up in two systems: a ClickUp task and the GitHub issue a Client's developer opened for it.

All of these should work together. Today none of them can be configured safely:

* [ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) says a Client *owns* its tracker sources and repositories, so a shared repository has no Client to belong to.
* Ploeg keys board pins by the bare container id (`File.ScopeTeams` in [`pkg/config/resolve.go`](https://github.com/ploeg-hq/ploeg/blob/development/pkg/config/resolve.go)), so two boards with the same id on different instances overwrite each other.
* Ploeg's workers push to one forge per installation (`pkg/worker/target.go`: "forge is global today"), so one installation cannot serve a Client on GitHub and another on Forgejo.
* Unfold's interactive tracker binding supports one Ploeg tracker instance per provider ([application ADR 0018](../../apps/unfold/docs/adrs/0018-bind-tracker-imports-to-existing-ploeg-work.md)).
* Unfold does not recognise the same work in two systems; [task connections](../../apps/unfold/docs/operations/task-connections.md) tells operators to keep one authoritative source per Work Item.
* Every repository and board is declared twice, once for Ploeg and once for Unfold, and nothing compares the two ([connect a repository](../concepts/connect-a-repository.md)).

What may be shared between projects, what may never be, and what decides which Client, repository and budget a Work Item belongs to?

## Decision Drivers

* A Work Item has exactly one Client (or none, for the Agency's own work), one budget pool and one Acceptance record, or billing per accepted ticket ([ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md)) and client visibility ([ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)) break.
* An Agency connects each tracker account and forge account once and reuses it, instead of one credential per board.
* Nothing is shared across Tenants ([ADR-0009](adr-0009-one-tenant-per-agency.md)).
* Content never selects authority: task text cannot choose a repository, a credential, a Client or a link.
* Deduplication is explicit. Two items are the same work only because a person says so, never by a similarity guess.
* Ploeg keeps its own vocabulary and never learns about Unfold's projects; any need becomes a Ploeg contract that Unfold adopts.

## Considered Options

* Share accounts and repositories inside a Tenant; a Work Item has one origin, and its Client comes from that origin
* Keep ADR-0017 as written: a Client owns its sources and repositories, and shared code is copied or forked per Client
* Merge items across systems automatically, so one Work Item collects every task and issue about the same work

## Decision Outcome

Chosen option: "**Share accounts and repositories inside a Tenant; a Work Item has one origin, and its Client comes from that origin**", because it is the only option that lets a repository serve several Clients while every Work Item keeps one Client, one budget and one Acceptance.

The model has three layers. Each thing belongs to exactly one Tenant.

1. **Integration Account.** One account on one tracker or forge instance, such as a ClickUp workspace token or a GitHub App installation, with its credential reference. Any number of sources and repositories in the Tenant use it. It grants nothing on its own. The existing **Settings → Connections** page keeps its meaning: it checks the wiring of each board and repository, and will show which Integration Account each one uses.
2. **Source and repository.** A *source* is one container on a tracker instance (a ClickUp List, a Vikunja project, a GitHub repository's issues). A *repository* is one Work Target on a forge instance: owner, name, base branch. Both are keyed by **instance plus container id**, never by the bare id and never by the account, so equal ids on two instances never collide and rotating or replacing an account changes no identity. The Integration Account used to reach them is an attribute, and a source or repository uses one at a time.
   * A source is owned by **at most one Client**. A source with no Client is the Agency's own.
   * A repository is owned by the **Tenant**. A Client Project is **granted** a repository; several may hold a grant on the same one. This refines ADR-0017's "a Client owns repositories": Clients still own sources, and reach repositories only through grants.
3. **Client Project.** A named grouping inside one Client, or inside the Agency's own work, that bundles its sources, its repository grants, its Routing Rules, its default Team and its budget: a share of the Client Budget, or of the Agency Budget for the Agency's own work. It is the single declaration that [connect a repository](../concepts/connect-a-repository.md) direction 3 calls for. Where that declaration lives, and how Ploeg's configuration is derived from it, stays that page's open question 3.

**A Work Item has one origin**, and its Client and Client Project follow from it, never from the repository and never from task content.

* **Tracker work** takes them from the source it arrived on. Its identity is the tracker item (instance, container, item id).
* **Manual work** started in Unfold takes them from what the person chose, within what they may reach.
* **Created work** (a Follow-Up from a Forge Event, a split, discovered work) inherits its parent Work Item's Client and Client Project. It may target only repositories that Client Project holds a grant for.
* **A Pull Request Reading** of a pull request someone else opened belongs to the Agency's own work and is visible to no Client user, unless the pull request comes from a Work Item, in which case it inherits that Work Item's.
* Its **repository** comes from the Routing Rules and must be one its Client Project holds a grant for. One board may feed several repositories, as Ploeg's label routing already allows. An Agency-own source may route to a repository granted to a Client; that Client's users do not see the Agency's Work Item.
* **Work across several repositories** is split into Work Items, one per repository, under one root Work Item. Each child needs its own grant, shares the root's budget pool and Client, and is its own ticket: each accepted child carries its own Delivery Fee.
* **The same work in another system** is a *Work Item Link*: a tracker item or forge issue recorded as "same work as". A reference in the item, such as an issue URL in a ClickUp task, only *proposes* a link; a person with access to both items confirms it. Links stay within one Client, or within the Agency's own sources. Assigning a linked item to a Team user creates no second Work Item.
* **A shared repository is reviewed per Work Item.** Two Clients' Work Items on one repository are two pull requests with two Acceptances and two Delivery Fees. A grant on a repository never grants sight of another Client's Work Items on it.

**Never shared:** Integration Accounts, sources and repositories across Tenants. A repository two Agencies both work on belongs to one Tenant; the other Agency works through its own fork or its own repository.

**What changes, in order.** Not implemented yet.

1. Ploeg: instance-qualified source and target keys, and refusing a duplicate key at startup (VIK-1879).
2. Ploeg: the worker takes the forge URL and credential from the target's Forge, not from the installation, so one installation serves several forges (VIK-2247).
3. Ploeg: a Work Item can carry further tracker identities, and an Assignment on one of them resolves to the existing Work Item. This is a Ploeg contract in Ploeg's own words; Unfold's Work Item Link maps to it.
4. Unfold: Integration Accounts, sources with an optional Client, repositories with grants, and Client Projects in one declaration (VIK-2248). Tenant and Client enforcement stays behind ADR-0017's checks, which check grants instead of Client ownership of repositories.
5. Unfold: the Work Item page and Tasks page show links, propose them from references, and let a person confirm one.

### Consequences

* Good, because an Agency connects ClickUp or GitHub once and adds Clients and projects without new credentials.
* Good, because a shared library or monorepo becomes a normal repository with several grants instead of a copy per Client.
* Good, because one origin keeps billing, budgets and Acceptance unambiguous: one Work Item, one Client, one Delivery Fee.
* Good, because the duplicate Ploeg and Unfold declarations become one.
* Bad, because ADR-0017's Client ownership of repositories changes into grants, and the enforcement tickets VIK-1740 and VIK-1878 must check grants instead of ownership.
* Bad, because a link needs a person to confirm it; two copies of the same work that nobody links stay two Work Items.
* Bad, because two Clients changing one repository at once can conflict on the base branch. That is the normal forge merge problem; Ploeg rebases a conflicting pull request only for a Team that sets `forgeFollowUps.rebaseOnConflict` (Ploeg ADR-0146), and otherwise a person resolves it.

### Confirmation

Proposed tests, none of which exist yet:

* A Ploeg configuration test: two sources with container id `42` on two Vikunja instances resolve to two keys, and a repeated key fails startup.
* A Ploeg worker test: two targets on two Forges in one installation push to their own forge with their own credentials.
* A Ploeg intake test: assigning a Work Item's further tracker identity to a Team user leaves one Work Item and records the attempt.
* An Unfold test with Clients A and B both granted repository `shared-ui`: each Client's user sees only their own Work Items on it, a task from A's source can never be routed under B's Client Project, and a Routing Rule naming a repository without a grant is refused at load time.
* An Unfold test: a Follow-Up and a child Work Item keep their parent's Client, and a child routed to a repository without a grant is refused.
* An Unfold test: a ClickUp task containing a GitHub issue URL proposes a link; only after a person confirms it does the issue show the Work Item's status, and a proposed link between two Clients' items cannot be confirmed.

## Pros and Cons of the Options

### Keep ADR-0017 as written

* Good, because ownership is simple: every repository has exactly one Client.
* Bad, because shared code must be copied or forked per Client, which agencies do not do.
* Bad, because the Agency's own repositories (templates, shared infrastructure) have no Client to own them.

### Merge items across systems automatically

* Good, because nobody has to link anything.
* Bad, because a wrong merge joins two Clients' work, shows one Client the other's task and charges the wrong Client.
* Bad, because matching on titles or text lets task content decide authority, which every other rule forbids.

## More Information

* Refines [ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md): Clients own sources; repositories belong to the Tenant and are granted. Ploeg's glossary entry for Client still says a Client owns repositories; that changes upstream if this ADR is accepted.
* Builds on [connect a repository](../concepts/connect-a-repository.md) directions 3 and 4, and on [ADR-0003](adr-0003-the-unit-of-work-is-the-work-item.md), which lets work be split into further Work Items.
* 2026-10-29 — Proposed. The owner asked how Work Items work for projects that share a repository, a forge, an issue tracker or other integrations, and agreed with this direction.
