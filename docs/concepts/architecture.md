---
type: explanation
audience: [owner, contributor, operator, agent]
owner: unfold
last_verified: 2026-09-22
verified_by: "source read of apps/ploeg and apps/unfold at 69d1af2; ops/helm charts"
---

# Architecture

Unfold has two deployable applications:

* **Ploeg** runs agent work. It is a Go controller with PostgreSQL, plus short-lived worker pods.
* **Unfold** is the front end where a person follows and steers that work. It is a Node web server, with a VS Code extension.

Both run on your own Kubernetes cluster and use your own tracker, forge and model gateway. This page gives the goals, the two diagrams that matter and the main decisions. [How work flows](how-work-flows.md) follows one ticket through the system.

## Goals

The goal is one loop: create Work Items (units of work), assign them to agents, and let the agents do all of the code work until a pull request is ready for human review and merge. The loop is complete when the throughput limit is cluster size rather than your time, and a new model can be adopted by changing configuration. The [proposed KPIs](../reference/kpis.md) say how to tell.

Quality goals, in priority order:

1. **Bounded spend.** Every Run has a budget and a model key that stops working when the Run ends.
2. **A pull request is the only output.** Agents push to a leased branch. People merge.
3. **Recoverable.** A dead worker loses its Lease. The sweep recovers the Run, and a paid step never repeats silently.
4. **Replaceable parts.** The tracker, forge, harness and model sit behind adapters.

## Constraints

* Self-hosted: Kubernetes, PostgreSQL, a LiteLLM gateway, Forgejo (the leading forge) and Vikunja or ClickUp.
* One owner operates and maintains it. Simplicity outranks generality.
* Production desired state lives in the separate `homelab-cluster` repository. Unfold builds its application's images, chart and extension. Ploeg's come from [github.com/ploeg-hq/ploeg](https://github.com/ploeg-hq/ploeg), which Unfold pins as a submodule at `apps/ploeg` ([ADR-0019](../adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-vloer.md)).

## Context

```mermaid
flowchart LR
    you["You<br/>owner and reviewer"]
    tracker["Tracker<br/>Vikunja or ClickUp"]
    forge["Forge<br/>Forgejo (GitLab adapter exists)"]
    unfold["Unfold<br/>application + Ploeg"]
    llm["LiteLLM gateway<br/>model providers behind it"]
    k8s["Kubernetes cluster<br/>KEDA, runs worker pods"]
    you -->|create and assign Work Items| tracker
    you -->|follow and steer work| unfold
    you -->|review and merge PRs| forge
    tracker -->|assignment webhooks| unfold
    unfold -->|comments and status| tracker
    unfold -->|branches, PRs, review comments| forge
    unfold -->|mint, block and meter per-run keys| llm
    unfold -->|run workers| k8s
```

## Containers

```mermaid
flowchart TB
    subgraph ploeg["Ploeg"]
        ploegd["ploegd<br/>Go controller: webhooks, Shifts, claims,<br/>budgets, keys, sweep, API"]
        db[("PostgreSQL<br/>Work Items, Shifts, Runs,<br/>Leases, accounts, audit")]
        worker["ploeg-worker<br/>one pod per Run: clone,<br/>harness, push, outcome"]
    end
    subgraph unfold["Unfold"]
        server["Unfold server<br/>Node, SQLite: sessions,<br/>events, review"]
        ext["VS Code extension"]
        browser["Browser UI"]
    end
    keda["KEDA"]
    lite["LiteLLM"]
    ploegd --> db
    keda -->|count pending Runs| db
    keda -->|start pods| worker
    worker -->|claim, renew, key, outcome| ploegd
    worker -->|model calls with the Run's key| lite
    ploegd -->|master key: mint, block, spend| lite
    server -->|operator API| ploegd
    browser --> server
    ext --> server
```

| Container | Source | Responsibility |
| --- | --- | --- |
| `ploegd` | [`apps/ploeg/cmd/ploegd`](../../apps/ploeg/cmd/ploegd/main.go) | The only holder of the LiteLLM master key, forge admin token and database. Turns webhooks into Shifts, admits and leases Runs, mints keys, and advances or closes Shifts. |
| `ploeg-worker` | [`apps/ploeg/cmd/ploeg-worker`](../../apps/ploeg/cmd/ploeg-worker/main.go) | Runs one Run and exits. Refuses to start if it can see controller secrets. |
| Unfold server | [`apps/unfold/src`](../../apps/unfold/src/main.ts) | Front end: sessions, live events, human review. It still contains an execution engine, which [ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) retires. |
| VS Code extension | [`apps/unfold/extensions/vscode`](../../apps/unfold/extensions/vscode/) | Follows Unfold sessions from the editor. |

## Solution strategy

| Choice | Decision |
| --- | --- |
| A dedicated dispatch service instead of an off-the-shelf agent platform | [Ploeg ADR-0005](../../apps/ploeg/docs/adrs/0005-build-a-dedicated-dispatch-plane.md) |
| LiteLLM as the credential and metering seam | [Ploeg ADR-0008](../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md) |
| The Shift owns the Work Item; the Lease owns the branch | [Ploeg ADR-0010](../../apps/ploeg/docs/adrs/0010-shift-owns-the-item-lease-owns-the-branch.md) |
| The pull request is where agents and people exchange results | [Ploeg ADR-0011](../../apps/ploeg/docs/adrs/0011-the-pull-request-is-the-blackboard.md) |
| Budgets are authorized before a Run and settled after it | [Ploeg ADR-0012](../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md) |
| Push rights are minted per Run | [Ploeg ADR-0013](../../apps/ploeg/docs/adrs/0013-push-rights-are-minted-per-run.md) |
| Ploeg is the only engine; Unfold is the front end | [system ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) |

Every decision across the three ledgers is listed in the [decision register](../reference/decisions.md).

## Risks and known gaps

| Risk | State |
| --- | --- |
| Two execution engines until Unfold delegates to `ploeg-worker` | Accepted in ADR-0002; migration not started |
| Candidate delivery stores approvals, but nothing publishes | Delivery ends at the pull request |
| Failed checks and requested changes act only for Teams that set `forgeFollowUps` | Off by default; other forge events are recorded only |
| Releases have not moved to Unfold yet | See [first cutover](../operations/first-cutover.md) |
| Agent quality is unmeasured beyond single fixtures | A comparison on real Work Items is an open option. [Proposed KPIs](../reference/kpis.md) define what to measure |

Related: [Ploeg architecture](../../apps/ploeg/docs/architecture.md), [Unfold architecture](../../apps/unfold/docs/architecture.md), [historical C4 views](../landscape/c4.md).
