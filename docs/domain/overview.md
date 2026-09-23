---
type: reference
audience: [owner, integrator, contributor, agent]
owner: glide
generated_by: "mise run domain"
---

# Glide — Domain Overview

Glide turns units of work (Work Items) into pull requests that are ready for human review. Ploeg authorizes, budgets and executes every agent Run; Vloer is its front end (Glide ADR-0002). Without Ploeg, Vloer runs only its deterministic demo, which makes no model calls. Until Vloer's own engine is retired, a managed execution never falls back to it. This model includes intended product rules; it is not a feature inventory. Current behavior is documented in ../index.md and the application architecture guides. Execution terms such as Run, Shift, Lease, Team, Role and Outcome belong to Ploeg's model; this model imports them.

*Model version 0.3. Generated from `model.yaml` — do not edit by hand.*

## Bounded contexts

- **System** — The applications that make up Glide and how they divide the work.
- **Work** — Requested results, their evidence, and their acceptance.
- **Participation** — How people take part in AI work through Vloer and inspect what happened.
- **Execution** — The product view of AI work. Ploeg's model owns the execution vocabulary.
- **Delivery** — How Glide's own source, releases and documentation are proven and switched over.
- **Tooling** — External tools and protocols that Glide builds on or has evaluated.

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

## Contents

- [Glossary](glossary.md)
- [Entities](entities.md)
- [Business rules](rules.md)
