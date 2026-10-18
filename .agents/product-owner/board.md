Extends: webgrip/default

# Unfold board — additions to the webgrip default team

The default team's Definition of Ready, ticket template, golden tickets and Definition of
Done apply unchanged (the `product-owner-contract` skill, `teams/default/`). This file holds
only what Unfold adds.

## Additions

- Project: `Unfold` (Vikunja id 10). Ids are a cache: re-resolve with `projects_list` when a
  call behaves oddly.
- Fixture projects, never backlogs: `Ploeg Test` (id 11) and `Ploeg Bench` (id 49). They feed
  Ploeg's tests and benchmarks; do not groom, split or close their tickets.
- `repo/*` names the repository the work lands in; on a board that serves several
  repositories Ploeg routes a ticket by it
  ([assign work to an agent](../../docs/how-to/assign-work-to-an-agent.md)). A ticket without
  one is not `ready`.
- Assigning a ticket to a Team's user dispatches it to agents. Grooming never assigns; only
  an `agent-ready` ticket is assigned, and only by a human.
- Domain language: the [glossary](../../docs/reference/glossary.md) is authoritative — Work
  Item, Run, Shift, Role, Verdict, Acceptance in the meaning it gives them, in titles,
  TL;DR and criteria alike. A ticket that needs a new term proposes it in Open questions.
- The template's `## Outcome` heading is the ticket's end state. Ploeg's Outcome (how a Run
  ended) is written as "Run outcome" inside a ticket, so the two never read as one.
- Ploeg changes land in `ploeg-hq/ploeg` first; an Unfold ticket that needs one names the
  Ploeg ticket or pull request as a dependency and covers only the pin
  ([ADR-0019](../../docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)).
- Into `ready`: work that crosses Ploeg and Unfold links
  [managed execution](../../docs/workflows/managed-execution.md) under Technical context.
- Verification names `mise run verify`; live-provider tests stay opt-in and are named as such.
- Protected areas for agents, in addition to tests and CI config: `apps/ploeg` (the unpacked
  Ploeg release) and production desired state, which lives in `webgrip/homelab-cluster`.
- Proposed behaviour is labelled as proposed in the ticket, never written as if implemented.
