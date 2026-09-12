# Ploeg and Vloer — Domain Overview

A supported way to work with AI for developers and agents. Vloer is the human workplace. This model includes intended product rules; it is not a feature inventory. Current behavior is documented in ../architecture.md. Local work must be usable without Ploeg. A common runner remains a proposed implementation.

*Model version 0.2. Generated from `model.yaml` — do not edit by hand.*

## Bounded contexts

- **Work** — Requested outcomes, their evidence, and their acceptance.
- **Participation** — How people take part in AI work and inspect what happened.
- **Execution** — Performing authorized AI work within its constraints.

## ⚠ Open ambiguities

These terms are contested or vague. Resolve them before writing specs that depend on them.

- **shared execution implementation** — Local work must be usable without Ploeg, but that requirement does not determine which execution code the applications should share.
  - Options: Keep separate implementations behind compatible contracts, Extract a runner callable by either application
  - Recommendation: Compare one standalone run and one Ploeg-managed run before extracting common behavior. Keep authorization, runner placement and code reuse separate.
- **a CI failure with no original ticket** — Repair subtickets require a parent, but a human-written change may not already have an external ticket.
  - Options: Create a parent work ticket linked to the change, Attach repair to a project incident ticket
  - Recommendation: Preserve a direct link to the failed change and agree the external parent-ticket rule.
- **limits on automatic repair** — Repeated CI failures could create duplicate subtickets or consume an unbounded amount of work.
  - Options: One active repair subticket per failure with bounded attempts, A new subticket per failed check run
  - Recommendation: Reuse an active repair subticket for the same failure and stop at agreed limits.
- **agents create and execute follow-up work** — Creating a proposed ticket and authorizing its execution grant different powers.
  - Options: Agents propose and people authorize, Explicit project rules authorize bounded follow-up work
  - Recommendation: Separate permission to propose from permission to spend and execute.
- **which decision records are required** — Visibility into decisions needs a defined record beyond raw model messages and tool logs.
  - Options: Written decision with options and evidence, Transcript and actions alone
  - Recommendation: Capture the decision, responsible person or rule, evidence, and expected consequence.

## Contents

- [Glossary](glossary.md)
- [Entities](entities.md)
- [Business rules](rules.md)
