---
type: landing
audience: [owner, operator, integrator, contributor, agent]
owner: glide
last_verified: 2026-09-22
verified_by: "ADR-0002; mise run docs-check"
---

# Glide

Glide turns units of work into pull requests that AI agents write and you review.

A unit of work, a **Work Item**, is something you have decided to do, or a problem described well enough that a solution can be formulated or at least conceived. You assign it to an agent team. Glide runs the agents with a budget and a credential that expires, until a pull request is ready for your review, and you merge. Work can also create work: splitting a Work Item, or making it ready, is a job for agents too.

**Status:** internal tool, pre-1.0, one owner, self-hosted on Kubernetes. Not a hosted service.

**Parts:**

* [Ploeg](../apps/ploeg/docs/index.md) authorizes, budgets and runs every agent Run. It is a Go controller plus short-lived worker pods.
* [Vloer](../apps/vloer/docs/index.md) is its front end, where you follow and steer work, in the browser or in VS Code.

Both applications live in this repository and deploy separately ([ADR-0002](adr/adr-0002-ploeg-is-the-only-engine.md)).

| I want to… | Go to |
| --- | --- |
| See it work without spending money | [Run the local demo](workflows/local-demo.md) (deterministic, no model calls) |
| Understand how a Work Item becomes a pull request | [How work flows](concepts/how-work-flows.md) |
| Understand the parts and why they exist | [Architecture](concepts/architecture.md) |
| Give real work to agents | [Assign work to an agent](how-to/assign-work-to-an-agent.md) |
| Check an agent's pull request before merging | [Review an agent pull request](how-to/review-an-agent-pr.md) |
| Let agents work in a repository | [Prepare a repository](how-to/prepare-a-repository.md) |
| Operate Ploeg or Vloer | [Ploeg](../apps/ploeg/docs/index.md) · [Vloer](../apps/vloer/docs/index.md) |
| Look up a term or a decision | [Glossary](reference/glossary.md) · [Decisions](reference/decisions.md) |
| Change Glide | [Repository instructions](../AGENTS.md) · [Documentation policy](documentation.md) · [CI and releases](operations/ci.md) |

**Out of scope:** Glide does not merge or deploy the changes agents make. It does not host models; it reaches providers through your LiteLLM gateway.

Research, dated evidence and superseded explanations are kept as records. They are linked where they support a decision and are not current guidance. The [22 September inventory](research/2026-09-22-glide-inventory.md) explains the current structure.
