---
type: design
status: proposed
audience: [contributor, agent, owner]
owner: unfold
last_verified: 2026-11-01
verified_by: "Written with the Team builder behind the teams.builder Labs flag on branch feat/team-builder-labs: public/teams.js, public/views/teams.js, public/styles/teams.css, src/flag-registry.json; test/teams-model.test.mjs passed. The record, the gate and the roster are a demo: nothing reads Ploeg yet."
---

# Build agents and Teams in Unfold, and let the record pick

This is a design record for a proposed change. The Team builder behind the `teams.builder` Labs flag is a clickable demo of it; nothing in it reads or writes Ploeg, and every number follows the shape of real Runs without being one.

## The problem

Today the Team that runs a tracker card is decided by where the card sits: a List or board maps to a Team in the deployment's configuration, and the Team's tier name (`bronze`, `silver`) stands for its harness, its models, its budget and the repositories its harness happens to work in, all at once. The person assigning the card does not choose who does the work and cannot see who will. Whether the Team can enter the repository is found out when a Run fails, after a sandbox wait, because the harness refuses the repository. A change to any of it is a configuration pull request and a release. The first real ClickUp card ran into every one of these.

## The parts, kept apart

| Part | What it is | Where it lives in the proposal |
| --- | --- | --- |
| Work | A card: what, which repository, how large | The tracker |
| Capability | One agent: harness, model, skills, permissions, budget per Run | Built in Unfold, declared as data |
| Composition | A Team: agents in the positions of a workflow (Plan, Build, Review, Fix), a charter, a weekly budget, the repositories it may enter | Built in Unfold, versioned |
| Fit | Whether this Team can take this card: positions filled, repository listed, every harness able to enter, headroom above the estimate | Checked at assignment, on the card |
| Execution | Ploeg runs the Team's manifest | Ploeg, as today |
| Record | What happened, per Team version and per repository | Unfold, from Ploeg's Runs and delivery facts |

A position is a slot in the Team's flow, not a kind of agent: the same agent can build in one Team and fix in another.

## The loops the builder closes

1. **Gate loop.** Assigning a card gets an answer on the card within seconds: starting with an estimate on like work, one question when the Team has no record on that repository, not starting with the reasons and the Teams that do fit, or the ranked Teams when the Team field is empty. Nothing fails later for a reason that was knowable at assignment.
2. **Learning loop.** The record is shown where a Team is designed and where one is chosen. Each save is a new version with an empty record, and the version before stays comparable, so a change can be judged.
3. **Change loop.** An edit in Unfold applies to the Team's next Run. The deployment seeds the first roster; it no longer owns it.
4. **Selection loop.** People build Teams their own way, copy the ones with a good record (a copy keeps its lineage, and the source counts an adoption), and the roster improves without anyone mandating it.

## Rules that keep the selection loop honest

- **The record belongs to a version.** A Team's name never carries another version's results.
- **Cost never stands alone.** Cost per merged pull request and merged count sit beside review rounds, reverts within fourteen days and review minutes.
- **Like work only.** The record is per repository and per size, and the ranking at assignment reads "on work like this". There is no global score.
- **Teams, never people.** The author gets adoption and a lineage line. There is no leaderboard of developers.
- **An experiment budget** per person, outside every Team's record, keeps variation alive when everyone would otherwise copy the one winner.

## What the demo shows and what it does not

The demo shows the three screens with an invented roster whose numbers follow real Runs on this workbench: the builder with its live consequences, Teams with a versioned record, and the gate on a mocked card. It keeps the roster in the browser.

It does not read Ploeg's Teams, Runs or delivery facts, write a manifest to Ploeg, comment on a tracker card, or compute a record. Those are the build steps below.

## Build steps, if accepted

1. Ploeg: a Team manifest with positions, agents and permissions as declared data, received through its operator API by version id, with the repository constraints of each harness declared rather than discovered ([Ploeg ADR-0110](../../../ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), proposed).
2. Unfold: roster, versions and lineage in its own store, edited through these screens; the record computed per version and repository from Ploeg's Runs and delivery facts; the estimate from Run medians, as the landing estimate already does.
3. The gate: the tracker adapter resolves the Team field on assignment, runs the fit and comments; the ranked list when the field is empty.
4. The screens leave Labs once the record is real.

## Decisions for the owner

- Whether a Team field on the card plus one Unfold member is the assignment model, against one tracker member per Team, which costs a seat per Team on paid plans.
- How far the record's quality side goes: review minutes need the forge's review timestamps, reverts need a merge-to-revert link.
- Whether the experiment budget is per person or per Team.
