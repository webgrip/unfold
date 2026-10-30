---
type: landing
audience: [owner, operator, integrator, contributor, agent]
owner: unfold
last_verified: 2026-09-22
verified_by: "ADR-0002; mise run docs-check"
---

# Unfold

Unfold turns units of work into pull requests that AI agents write and you review.

A unit of work, a **Work Item**, is something you have decided to do, or a problem described well enough that a solution can be formulated or at least conceived. You assign it to an agent team. Unfold runs the agents with a budget and a credential that expires, until a pull request is ready for your review, and you merge. Work can also create work: splitting a Work Item, or making it ready, is a job for agents too.

**Status:** pre-1.0, self-hosted on Kubernetes, with its owner as the only user. A hosted service for agencies is decided ([ADR-0005](adr/adr-0005-unfold-is-offered-to-agencies.md)) but not built.

**Parts:**

* [Ploeg](../apps/ploeg/docs/index.md) authorizes, budgets and runs every agent Run. It is a Go controller plus short-lived worker pods.
* [The Unfold application](../apps/unfold/docs/index.md) is the front end, where you follow and steer work, in the browser or in VS Code.

The application lives in this repository. Ploeg lives at [github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg), and Unfold depends on one tested release of it: its contract bundle, unpacked into `apps/ploeg`, and its Go module ([ADR-0039](adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)). The two deploy separately ([ADR-0002](adr/adr-0002-ploeg-is-the-only-engine.md)).

| I want to… | Go to |
| --- | --- |
| See it work without spending money | [Run the local demo](workflows/local-demo.md) (deterministic, no model calls) |
| Understand how a Work Item becomes a pull request | [How work flows](concepts/how-work-flows.md) |
| Understand the parts and why they exist | [Architecture](concepts/architecture.md) |
| See what happens inside one agent Run: pods, sandbox, harness, credentials | [Inside a Run](concepts/inside-a-run.md) |
| Understand how agent code is kept off your nodes and your data protected | [How agent code is contained](concepts/how-agent-code-is-contained.md) |
| Know who uses Unfold, what they need and the ten journeys it must support | [Users and their journeys](concepts/users-and-journeys.md) |
| Connect a repository and its board so a Team can work on it, and where that breaks today | [Connect a repository](concepts/connect-a-repository.md) |
| Follow a whole path end to end: ticket to merge, release to production, stopping work, failures | [Journeys](concepts/journeys.md) |
| See who Unfold is for and where it is heading | [Who Unfold is for](concepts/who-unfold-is-for.md) (the agency offering; not built yet) |
| See how each delivered change is recorded on a card, and what that means for privacy | [Run Cards](concepts/run-cards.md) (mostly proposed) · [Works council and DPIA pack](reference/run-cards-works-council-pack.md) |
| Give real work to agents | [Assign work to an agent](how-to/assign-work-to-an-agent.md) |
| Check an agent's pull request before merging | [Review an agent pull request](how-to/review-an-agent-pr.md) |
| Let agents work in a repository | [Prepare a repository](how-to/prepare-a-repository.md) |
| Run Unfold and Ploeg on your own Kubernetes cluster, from an empty cluster to backups and upgrades | [Self-host the whole stack in the EU](how-to/self-host-the-whole-stack.md) |
| Run agent pods under Kata or gVisor, and pick between them and Firecracker | [Run agent code in a sandbox runtime](how-to/run-agent-code-in-a-sandbox-runtime.md) · [Sandbox runtimes](reference/sandbox-runtimes.md) |
| Encrypt node disks, traffic and volumes on a self-hosted cluster | [Protect data at rest and in transit](how-to/protect-data-at-rest-and-in-transit.md) |
| Try a Team on ten real Work Items, or compare prompts, models and harnesses | [Run a pilot batch](how-to/run-a-pilot-batch.md) |
| Ask an AI client what waits for you, why, and what to do | [Ask Unfold and Ploeg from an AI client](how-to/ask-from-an-ai-client.md) |
| Follow, ask about and steer Work Items from PhpStorm, Air, Zed or Neovim | [Use Unfold from PhpStorm and other ACP editors](how-to/use-unfold-from-an-acp-editor.md) |
| See your own Claude Code sessions on the Work Items they serve, with Agent Trace attribution and telemetry | [Link your Claude Code sessions](how-to/link-claude-code-sessions.md) |
| See your own OpenCode and Codex sessions on the Work Items they serve, with Agent Trace attribution | [Link your OpenCode and Codex sessions](how-to/link-opencode-and-codex-sessions.md) |
| Give Codex, Copilot, VS Code, Cursor or Kiro Unfold's skills and MCP tools, or publish them for your installation | [Install the Unfold plugin in Codex, Cursor, Copilot and VS Code](how-to/install-the-unfold-plugin.md) |
| Let people connect Claude Code, VS Code or Cursor to Unfold by URL, with a browser sign-in | [Serve Unfold's MCP tools over HTTPS](how-to/serve-unfold-mcp-over-https.md) |
| Operate Ploeg or the Unfold application | [Ploeg](../apps/ploeg/docs/index.md) · [Unfold application](../apps/unfold/docs/index.md) |
| Use the Unfold name, mark or colours | [Brand](brand/README.md) · [Trademark policy](brand/TRADEMARK.md) (proposed) |
| Check what the website claims about credentials and execution, and which settings each claim needs | [Capability matrix](reference/capability-matrix.md) |
| Look up a term or a decision | [Glossary](reference/glossary.md) · [Decisions](reference/decisions.md) |
| See what the screen calls a value Ploeg's API sends, and the reverse | [Ploeg words and screen words](reference/ploeg-words.md) |
| Change Unfold | [Repository instructions](../AGENTS.md) · [Documentation policy](documentation.md) · [CI and releases](operations/ci.md) |

**Out of scope:** Unfold does not merge or deploy the changes agents make. It does not host models; it reaches providers through your LiteLLM gateway.

Research, dated evidence and superseded explanations are kept as records. They are linked where they support a decision and are not current guidance. The [22 September inventory](research/2026-09-22-glide-inventory.md) explains the current structure.
