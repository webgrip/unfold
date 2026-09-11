# Understand Ploeg, Vloer, and the systems around them

This is a working explanation for colleagues, leadership, and technical reviewers. It describes the current implementation separately from the intended product. Definitions and unresolved choices belong in the [domain model](../domain/model.yaml); this guide supplies the architecture and evidence around them.

## The reason to do this

We want a supported way to work with AI for both developers and agents. People should be able to see the work, its progress, its cost, its decisions, and its results. Execution should be able to use shared infrastructure rather than depend on one person's computer or one AI vendor.

The business hypothesis is that adding execution capacity lets us complete more useful work. The limiting factors can then become writing good tickets, proving that results are correct, and safely releasing them. Running 1,000 agents is a capacity ambition, not evidence of 1,000 useful outcomes or a measured capability of this deployment.

## The pitch

**Vloer is where developers work with AI, follow agent activity, and review results. Ploeg manages the AI work behind it, whether a person is steering it live or agents are working independently. Together they provide a supported way of working with AI, with shared execution capacity and records of activity, cost, decisions, and results.**

This is the direction agreed in the discussion. Vloer can start an open conversation without a ticket; tickets remain external. Today, Vloer also manages agent workspaces and runs the steps of its agent team. Ploeg authorizes and tracks that work. The intended boundary puts responsibility for all AI execution with Ploeg; the exact worker arrangement is still a design choice. The diagrams do not pretend this separation has already happened.

## Choose a starting point

- **Leadership:** read this page and [what changes the bottleneck](bottlenecks.md). The decision is whether the expected improvement justifies operating and maintaining the system.
- **Developers:** read [what each component means](components.md), the [shared vocabulary](../domain/glossary.md), and the ticket sequence in the [C4 views](c4.md).
- **CTO and platform engineers:** read the current container, component, and deployment views in the [C4 views](c4.md), then the [implementation evidence](../research/2026-09-11-ecosystem-implementation.md).
- **Build versus adopt:** read the [alternatives and their evidence](../research/2026-09-11-ecosystem-alternatives.md). A product mentioned in a survey has not necessarily been tested.
- **Decisions we still need to make together:** read the [open questions](questions.md). Their answers should change this explanation before they cause more implementation.

## How to read the evidence

**Intended** means an owner-stated direction. **Implemented** means there is source code for it. **Observed** means a named test exercised it. **Proposed** means a recommendation that still needs a decision. These are different claims.

The inspected baseline is De Vloer `0.3.0-rc.14` and Ploeg `0.3.0-rc.6` on the homelab cluster. Both are prereleases. A completed coding fixture produced one changed file, passed all three unchanged tests in an independent checkout, and recorded $0.017142048 of observed model cost. This demonstrates a small working path. It does not establish general agent quality, settled provider billing, production delivery, or high concurrency.

A separate ticket import reached agent execution but failed on an OpenCode permission-list response. The failure stopped the execution and blocked its model key. The compatibility fix was not shipped: implementation was paused to focus on shared understanding. The [implementation evidence](../research/2026-09-11-ecosystem-implementation.md) records the defect and other current limits.

## What we should be able to explain without a diagram

1. Work can begin as a conversation in Vloer or a request from an external ticket system.
2. Ploeg manages that AI workload; a person can steer it live or let agents proceed.
3. A ticket, when present, says what outcome we want and how we will judge it.
4. A harness runs the agent's model-and-tools loop in a workspace.
5. LiteLLM gives that loop a controlled route to a model provider.
6. Kubernetes supplies places to run the software; KEDA can start unattended workers when work is waiting.
7. Software changes go through checks and agent review. CI failures get repair subtickets. A person initially accepts the prepared result.

Publication, deployment, and measuring the business outcome still need explicit responsibilities. Producing a plausible patch is not the same event as approving a result, closing a ticket, or improving a product in production.

## Open or update the guide

The [interactive edition](explorer.html) contains these pages, fourteen selectable C4 views, and an illustrative capacity exercise. It is a single HTML file with diagrams included, so it can be shared and opened without a running service or network connection. The print button prints the selected page or diagram.

Edit the Markdown sources and [domain model](../domain/model.yaml), then regenerate the domain pages with the Webgrip domain-language skill. Rebuild the interactive edition with:

```sh
mise exec -- node scripts/build-landscape.mjs
```

The [builder](../../scripts/build-landscape.mjs) uses the repository's existing Playwright dependency and downloads versioned Mermaid and Marked modules while building. The resulting HTML has no runtime dependency on those services. An existing conversation canvas can be refreshed by passing `--canvas` and its absolute file path. Do not hand-edit the generated HTML or generated domain pages. This guide is a discussion draft; it does not change runtime configuration or release either application.
