---
type: reference
audience: [owner, integrator, contributor, agent]
owner: unfold
generated_by: "mise run domain"
---

# Unfold — Domain Overview

Unfold turns units of work (Work Items) into pull requests that are ready for human review. Ploeg authorizes, budgets and executes every agent Run; Unfold is its front end (system ADR-0002). Without Ploeg, Unfold runs only its deterministic demo, which makes no model calls. Until Unfold's own engine is retired, a managed execution never falls back to it. This model includes intended product rules; it is not a feature inventory. Current behavior is documented in ../index.md and the application architecture guides. Execution terms such as Run, Shift, Lease, Team, Role and Outcome belong to Ploeg's model; this model imports them. The agency offering (system ADRs 0005 to 0010) is decided and not implemented; its terms are in the Offering and Billing contexts.

*Model version 0.6. Generated from `model.yaml` — do not edit by hand.*

## Bounded contexts

- **System** — The applications that make up Unfold and how they divide the work.
- **Work** — Requested results, their evidence, and their acceptance.
- **Participation** — How people take part in AI work through Unfold and inspect what happened.
- **Execution** — The product view of AI work. Ploeg's model owns the execution vocabulary.
- **Offering** — Who uses Unfold and what they see: Agencies, their Clients and the Client Portal. Decided in system ADRs 0005 to 0010; not implemented yet.
- **Billing** — How work is sized, quoted and charged: Sizes, Quotes, Credits and the two parts of a price. Decided in system ADR-0006; not implemented yet.
- **Cards** — Run Cards: the record of each delivered change and its life in production. Unfold assembles a card per Work Item from Ploeg's delivery facts, keeps the card's own state and draws it (system ADR-0030, Ploeg ADR-0079, Unfold ADR 0026); Ploeg keeps no card logic (Ploeg ADR-0080). Terms marked proposed or not implemented are not built. See ../concepts/run-cards.md.
- **Release** — How Unfold's own source, releases and documentation are proven and switched over.
- **Tooling** — External tools and protocols that Unfold builds on or has evaluated.

## ⚠ Open ambiguities

These terms are contested or vague. Resolve them before writing specs that depend on them.

- **a CI failure with no original ticket** — Repair subtickets require a parent, but a human-written change may not already have an external ticket.
  - Options: Create a parent work ticket linked to the change, Attach repair to a project incident ticket
  - Recommendation: Preserve a direct link to the failed change and agree the external parent-ticket rule.
- **limits on automatic repair** — Repeated CI failures could create duplicate subtickets or consume an unbounded amount of work.
  - Options: One active repair subticket per failure with bounded attempts, A new subticket per failed check run
  - Recommendation: Reuse an active repair subticket for the same failure and stop at agreed limits.
- **agents create and execute follow-up work** — Creating a proposed ticket and authorizing its execution grant different powers.
  - Options: Agents propose and people authorize, Explicit project rules authorize bounded follow-up work
  - Recommendation: Separate permission to propose from permission to spend and execute. Ploeg's Admission grants the second.
- **which decision records are required** — Visibility into decisions needs a defined record beyond raw model messages and tool logs.
  - Options: Written decision with options and evidence, Transcript and actions alone
  - Recommendation: Capture the decision, responsible person or rule, evidence, and expected consequence.
- **a Request that arrives through a tracker** — Ploeg mirrors every assigned Tracker Item into a Work Item. A Client's ask that arrives as a ClickUp or Vikunja task is a Request, not yet a Work Item, so either the mirror must wait for Refinement or the Request must live in Unfold beside the Tracker Item.
  - Options: The tracker task is the Request; Refinement's Work Items become new Tracker Items or stay in Ploeg (Ploeg ADR-0031), Ploeg mirrors it as an unready Work Item that Refinement replaces with the real ones, Requests only come through the Client Portal; tracker tasks are always Work Items
  - Recommendation: The tracker task is the Request. Refinement's Work Items stay in Ploeg as proposed until their Quotes are approved, which reuses Ploeg ADR-0031 and keeps the Agency's tracker as the one place its Clients' asks live.
- **the period a Pack covers** — A Pack was proposed once per sprint, but Unfold had no sprint concept and some teams do not work in sprints.
  - Options: The tracker's iteration or cycle, where it has one, A fixed calendar period for every team, A period each Team sets in Ploeg's configuration
  - Recommendation: Built in Unfold as an ISO week by default, with a Team's own sprint length and start date instead (Unfold ADR 0029, proposed). The ambiguity closes when that ADR is decided.

## Contents

- [Glossary](glossary.md)
- [Entities](entities.md)
- [Business rules](rules.md)
