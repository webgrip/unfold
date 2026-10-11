---
status: proposed
date: 2026-10-11
decision-makers: Ryan Grippeling
---

# Agent knowledge is scoped to Tenant, Client, repository and Work Item, in two graphs per Tenant

## Context and Problem Statement

[ADR-0021](adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md) (proposed) briefs Runs from one Omnigraph graph per Tenant and holds every learning back until a person accepts it. On 2026-10-11 the owner asked for more: "I want my agents to write per ticket / client / project / org to Omnigraph." Agents should write knowledge at four levels, a Work Item, a Client, a repository and the Tenant, and every agent should read the levels that apply to its work. That includes interactive sessions next to a person ([ADR-0035](adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp.md)) as well as Ploeg's Runs.

Two facts about Omnigraph shape the answer. Its policy grants an actor actions per graph and per branch class (protected `main` or unprotected); it cannot filter rows or pin a branch prefix. And it refuses a schema change while any branch of the graph is open. How are the four levels stored, who may write each without review, and what enforces the boundaries?

## Decision Drivers

* A Run of a Work Item reads its Tenant's, its Client's, its repository's and its own work's knowledge, and nothing of other Clients, repositories or work ([ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)).
* The next Run of the same work gets what the last one learned without waiting for a person.
* Nothing a model wrote reaches other work before a person accepts it, and Omnigraph itself refuses the shortcut.
* No graph token reaches a harness, a laptop or a browser.
* One code path for self-hosted and hosted Tenants.
* A Tenant can take all its knowledge away as OKF.

## Considered Options

* Two graphs per Tenant: reviewed knowledge and Work Item notes
* One graph per Tenant, every level a property
* One graph per level

## Decision Outcome

Chosen option: "Two graphs per Tenant: reviewed knowledge and Work Item notes", because it is the only option where Omnigraph policy, not only application code, keeps unreviewed agent text out of other work, while keeping one actor set per Tenant.

* **Levels.** A concept in a Tenant's knowledge graph is scoped to the Tenant, to one Client or to one repository. A Work Item Note in its notes graph belongs to one Work Item and is read under that Work Item's root, so work created under it shares its notes ([ADR-0003](adr-0003-the-unit-of-work-is-the-work-item.md)).
* **Writing.** A Run, or a person, writes Work Item Notes without review. Any wider scope is a Promotion: a Tenant admin accepts it, possibly edited or narrowed, or rejects it. Only an accepted Promotion writes the knowledge graph.
* **Enforcement.** Ploeg alone holds each Tenant's graph tokens. Its run actor reads both graphs and writes only the notes graph's `main`; Omnigraph refuses it any write to reviewed knowledge and any access to graphs outside its Tenant. The Client, repository and root boundaries inside a graph are Ploeg's filter, derived from its own records of the Work Item, because Omnigraph cannot express them.
* **Reading.** A Run reads Tenant concepts, its Client's, its repository's and its root's notes. A Tenant member reads all of the Tenant's knowledge. A client user reads their Client's and their repositories' concepts and their Work Items' notes, but not Tenant-wide concepts, which may describe the agency's other work.
* **Hosted and self-hosted.** Both use Omnigraph, as the owner decided on 2026-10-04 and confirmed on 2026-10-11.
* **Kept from ADR-0021.** OKF stays the format at every boundary; Runs get knowledge as a file pack with only its index in the prompt, framed as evidence (Ploeg ADR-0065), and record what they were given. The owner's personal graphs are never a source.

Ploeg's side is Ploeg ADR-0085 (graphs, actors, Run delivery), ADR-0086 (notes and Promotions) and ADR-0087 (operator routes for a named person), all proposed.

### Consequences

* Good, because a Work Item's second Run starts from what its first learned, within minutes.
* Good, because a defect in Ploeg's run path still cannot publish unreviewed text to every Run: the actor has no right to do so.
* Good, because a promoted concept traces back to its note, Run, Work Item and the admin who accepted it.
* Bad, because a wrong or injected note can steer later Runs of the same work; the pull request's reviewer is the guard, and the Run records every note it was given.
* Bad, because each Tenant has two graphs and two actors to provision, back up and upgrade.
* Bad, because Client boundaries inside a graph rest on Ploeg's filter and its tests.

### Confirmation

Proposed checks, none built yet:

* Ploeg's scope tests named in ADR-0085 to ADR-0087, in ploeg-hq's `go test ./...`.
* On each deployment, a live check that a Tenant's run actor gets 403 on every graph outside its Tenant and on any write to the knowledge graph (homelab: Homelab Roadmap VIK-1872).
* Unfold: a client user's knowledge request through Unfold never returns another Client's object (VIK-2007).

## Pros and Cons of the Options

### One graph per Tenant, every level a property

* Good, because one graph keeps links across levels and halves provisioning.
* Bad, because the actor that writes notes can then write reviewed knowledge too; only Ploeg's code keeps the review line.

### One graph per level

* Good, because policy would separate Clients as well.
* Bad, because graphs and actors multiply with every Client and repository, every schema change multiplies with them, and links across levels are lost.

## More Information

* Design: Unfold OpenSpec change `openspec/changes/scoped-agent-knowledge/`; Ploeg OpenSpec change `scoped-knowledge-and-work-item-notes` (ploeg-hq pull request #107).
* Decision ticket: VIK-2004, under epic VIK-1858.
* Replaces ADR-0021 once accepted; then ADR-0021 is marked superseded by ADR-0034 here and in the index.
* 2026-10-11 — Proposed. Owner answers: two graphs per Tenant; Work Item Notes direct, review only for a wider scope; sessions through Unfold's MCP server; hosted Tenants keep Omnigraph.
