Extends: webgrip/default

# Unfold board — additions to the webgrip default team

The default team's Definition of Ready, ticket template, golden tickets and Definition of
Done apply unchanged (the `product-owner-contract` skill, `teams/default/`). This file holds
only what Unfold adds.

## Additions

- Tracker: **ClickUp**, overriding the default team's Vikunja. Workspace `1500520000009653`
  (webgrip), Space `Unfold` (`1500520000050331`); Ploeg work sits in Space `Ploeg`
  (`1500520000050334`). The Vikunja project (id 10) is an archive: older commits and documents
  cite `VIK-<id>`. Ids are a cache: re-resolve with `clickup_get_workspace_hierarchy` when a call
  behaves oddly. Tickets are referred to as `CU-<id>`; cross-references are full
  `https://app.clickup.com/t/<id>` links.
- Fixture projects, never backlogs, stay in Vikunja: `Ploeg Test` (id 11) and `Ploeg Bench`
  (id 49). They feed Ploeg's tests and benchmarks; do not groom, split or close their tickets.
- Use only a ClickUp MCP connection authorized for the webgrip workspace. If the connection
  lists another organisation's workspace, stop and say so; never write a webgrip ticket there.
- Stages are the List statuses, not labels: `backlog`, `ready`, `in progress`, `in review`,
  `needs you`, `done` ([the board](../../docs/contributing/way-of-working.md#the-board)).
  Tags carry the default team's dimensions with a colon: `repo:<repo>`, `impact:h|m|l`,
  `effort:s|m|l`, `time:hours|days|weeks`, `uncertainty:low|med|high`, plus `spike`, `epic`,
  `meta`, `phase-1`/`phase-2`, `agent-ready`. Enumerate the tags in use before applying one;
  never invent a dimension. Epics are parent tasks with the `epic` tag; children are subtasks.
- Each List is an area (for example `Sessions, editors & AI clients`, `Review & delivery`,
  `Docs, journeys & decisions`); a new ticket goes in the List of the area it changes.
- `repo:*` names the repository the work lands in; Ploeg routes a ticket by it
  ([assign work to an agent](../../docs/how-to/assign-work-to-an-agent.md)). A ticket without
  one is not `ready`.
- Assigning the ClickUp member **Unfold** dispatches a ticket to agents. Grooming never assigns;
  only an `agent-ready` ticket is assigned, and only by a human.
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
