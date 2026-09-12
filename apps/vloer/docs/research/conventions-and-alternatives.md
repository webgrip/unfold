# Repository conventions and neighboring workbenches

Inspected 2026-09-09. This is design evidence, not an installation recommendation or a compatibility certification. Ploeg was read from the supplied Forgejo repository; surrounding repositories were inspected through their accessible GitHub mirrors. Mirrors can lag. Product claims below describe the inspected documentation, not independently tested deployments.

## What the existing repositories contribute

| Source | Observation | Application here |
| --- | --- | --- |
| [Ploeg](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/AGENTS.md) | Explicit domain authority, Go/Helm operations, ADRs, source over stale design claims | Preserve tracker/Ploeg boundaries; verify claims against executable code |
| [Ploeg onboarding study](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/research/2026-08-28-onboarding-friction.md) | Manual wiring spans several systems; readiness and actionable blockers matter | One visible operator session with a clear next decision; a short demonstrable onboarding path |
| [ai-skills](https://github.com/webgrip/ai-skills/blob/main/AGENTS.md) | Flat `skills/<name>/SKILL.md` tree, focused descriptions and evaluation cases | Portable operator procedure with three concrete scenarios |
| [Skill contracts](https://github.com/webgrip/ai-skills/blob/main/docs/contract-pattern.md) | Reusable behavior and repository facts are separate; secret values belong elsewhere | `.agents/contracts/` references commands and documents; credentials stay external |
| [Application template](https://github.com/webgrip/application-template/blob/main/README.md) | `src`, `ops`, documentation and opt-in template synchronization | Familiar paths; no claim that this repo participates in automatic template sync |
| [Workflow standardization](https://github.com/webgrip/workflows/blob/main/docs/adrs/0001-standardized-language-workflows.md) | Native language tools within a consistent CI shape | Built-in Node test runner and explicit source/config gate |
| [Forgejo parity](https://github.com/webgrip/workflows/blob/main/docs/adrs/0002-forgejo-actions-parity.md) | Forge-specific workflow behavior must be accounted for | Separate GitHub and Forgejo entrypoints, no untested reusable-workflow abstraction |
| [Hard gates](https://github.com/webgrip/workflows/blob/main/docs/adrs/0003-hard-gate-quality-workflows.md) | Quality jobs must fail instead of silently advising | Test, source/config and Helm failures stop CI |
| [Backstage application](https://github.com/webgrip/backstage-application), [Ledgerflow](https://github.com/webgrip/ledgerflow) | Different application stacks coexist | Native browser modules are a scoped project decision, not an inferred organization mandate |

Some template instructions still referenced another application's name. Those stale particulars were not copied. The workflow GitHub mirror exposed earlier ADRs than those referenced by current Ploeg; this limits conclusions about today's centrally hosted workflow API.

## Alternatives worth comparing against a real workflow

| Project | Relevant evidence | Boundary for this proof of concept |
| --- | --- | --- |
| [Kandev](https://github.com/kdlbs/kandev) | Self-hostable multi-agent workbench, worktrees, integrated review and multiple execution environments, including a documented [Kubernetes executor](https://kandev.ai/docs/k8s) | A Kubernetes operator roadmap entry does not mean Kubernetes execution is absent. Team/auth and Office capabilities require checking their current feature status. Evaluate before extending De Vloer; concepts cited, code not copied |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | Agent task orchestration, worktree and review flow | [Official site](https://www.vibekanban.com/) announces sunsetting with community maintenance; [remote access](https://www.vibekanban.com/blog/remote-access) targets a powerful execution host |
| [OpenCode](https://opencode.ai/docs/server/) | Server sessions, events and human-response endpoints provide a usable harness seam | Its native session state and permissions require an adapter; a server endpoint alone is not workspace isolation |
| [OpenHands](https://github.com/OpenHands/OpenHands) | Reconfirmed 2026-09-10: Agent Canvas, Agent Server and Automation Server are separate components; ACP harnesses are supported | Strong workbench/control-plane reference; community Helm isolation and actual OpenCode compatibility need qualification. See the [unified baseline research](2026-09-10-unified-workbench-baseline.md) |
| Ploeg + De Vloer unification, 2026-09-10 | [Source and ecosystem review](2026-09-10-unified-workbench-baseline.md): two execution owners currently share a queue-depth read; proposed WorkOrders and fenced attempts already name the intended authority | Adopt one Ploeg execution authority incrementally; qualify start, detach, intervention and recovery before fleet expansion. Trial Kandev/Paperclip as alternatives and use the [adoption triggers](../operations/backlog.md#unification-baseline-and-adoption-triggers) before introducing another control plane |

Ploeg's July [Paperclip fit study](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/development/docs/research/2026-07-28-paperclip-fit.md) is especially relevant: inspect designs for actionable blockers, liveness and recovery, without introducing a second hidden priority queue. Its rejection is a local integration decision at that date, not a general claim about Paperclip's present capabilities.

The [2026-09-10 unification review](2026-09-10-unified-workbench-baseline.md) reaffirms that integration boundary and reopens Paperclip as a deliberate replacement candidate for the owner's broader research/plan/execute/measure ambition. This does not change the tracker or authorize adoption.

The expanded [market landscape](market-landscape.md) and its dated primary-source ledger supersede this short comparison for current product-positioning decisions. In particular, remote agents and Kubernetes execution are existing competitive capabilities, not unique claims for Ploeg/Vloer.

## What success should measure

The proposed bottleneck shift is from per-developer process setup and babysitting to shared, inspectable decisions. Measure these on a first real repository: time from registration to a reviewed result; time a session waits for human input; human effort to understand a returned change; recovery after a lost browser connection or server restart; proportion of sessions with attributable spend and reproducible checks. These are proposed evaluation metrics. No improvement numbers have been measured by this proof of concept.
