# 0001 — The human workbench beside Ploeg

Date: 2026-09-09. Status: accepted for v0.1.

## Context

Ploeg already owns unattended dispatch, leases, agent runs and budget settlement. Its [Paperclip decision](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/adrs/0009-paperclip-mine-for-design-never-integrate.md) rejects adding a competing dispatch and board layer. Its [onboarding research](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/research/2026-08-28-onboarding-friction.md) identifies manual coordination across configuration, webhook wiring, team sharing, forge access and ticket preparation. Its target of first useful results within ten minutes is an aspiration, not a reported benchmark.

Interactive work adds another need: people should supervise a durable engagement from any workstation, inspect evidence and intervene without taking ownership of agent processes. Reimplementing the unattended queue would blur authority and expand the first release substantially.

## Decision

Create a separate, self-hosted operator workbench. De Vloer owns interactive sessions and their human actions. The tracker retains priority and work content; Ploeg retains unattended execution. Expose Ploeg queue information through a read-only connector and retain tracker links on sessions. Do not label a De Vloer session a Ploeg Shift or dispatch work through an imagined Ploeg endpoint.

An operator session has a registered target, objective, crew, authorization limit and durable evidence. A browser connection is replaceable. Pause, cancellation, budget additions and restart recovery are explicit decisions with recorded actors.

## Alternatives considered

[Kandev](https://github.com/kdlbs/kandev) is a credible broader workbench to evaluate: it has agent adapters, worktrees and remote executors. At inspection, its Kubernetes operator was on the roadmap and its persistent office/teams feature was marked in progress. [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) offers a mature task/worktree review interaction; its [site](https://www.vibekanban.com/) announced sunsetting with continued community maintenance. Neither statement is a claim that those projects cannot meet future needs.

This release tests a narrower fit with Ploeg's authority model, LiteLLM credentials and a consistent operator experience. It must earn its maintenance cost. No competitor implementation code is copied into this Apache-2.0 project.

## Consequences and reconsideration

There are two execution products, so their labels and authority must remain clear. The first release does not synchronize task edits or migrate ongoing Ploeg work into an interactive session. A real request for that capability requires an explicit integration contract.

Reconsider building this workbench if an existing project satisfies the required remote isolation, spend attribution, intervention and tracker boundaries with a small maintained extension. Compare one real workflow, including teardown and review, before expanding either codebase.
