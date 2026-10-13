---
status: proposed
date: 2026-10-13
decision-makers: Ryan Grippeling
review-by: 2027-01-13
---

# Sessions run in Ploeg, with a Harness chosen per session and interaction kept

## Context and Problem Statement

A managed session still runs in Unfold: the engine takes a key from Ploeg and drives OpenCode in a Workspace Unfold builds from the `unfold-agent` image, and Ploeg only admits and budgets it ([execution contract](../contracts/ploeg-execution.md)). The New-session dialog offers one Runtime, "OpenCode", because Unfold registers one runtime from `config.runtime.kind`. [System ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md) puts all execution in Ploeg, and [ADR 0023](0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) plans the path: ordinary Work Items, no pause in v1, steering only into the next Round, no interactive permission answers, and Ploeg's ACP adapter as the only OpenCode driver.

On 2026-10-13 the owner decided where sessions run, who picks the Harness, and that interaction must survive the move. Two of those choices contradict ADR 0023. Where do sessions execute, how is the Harness chosen, and how do people keep steering a Run that runs in `ploeg-worker`? The [OpenSpec change](../../../../openspec/changes/sessions-run-in-ploeg/design.md) holds the design and increments.

## Decision Drivers

* One engine, one budget path (system ADR-0002).
* People keep answering permission requests and questions, messaging a running Run, and pausing and resuming it (owner, 2026-10-13).
* The person who starts the work picks the Harness, within what the Team allows.
* The worker pod reaches only the gateway, the forge and ploegd, so every channel into a Run is pulled by the worker.
* An intentional pause or cancel never becomes an automatic retry, and a restart never silently repeats paid work.

## Considered Options

* Sessions execute in `ploeg-worker`; the Harness is chosen per session from the Team's offer in Ploeg; interaction goes through a Ploeg interaction channel the worker pulls
* ADR 0023 as accepted: execution in Ploeg, the Team plan picks the Harness, steering into the next Run only, no pause
* Keep interactive sessions on Unfold's own OpenCode runtime, and send only unattended work to Ploeg

## Decision Outcome

Chosen option: "Sessions execute in `ploeg-worker`, the Harness is chosen per session from the Team's offer, interaction goes through a Ploeg interaction channel", because it keeps one engine and still gives people the control they use today.

The owner decided on 2026-10-13:

1. **Sessions execute in `ploeg-worker`.** Unfold's `OpenCodeRuntime`, `CommandRuntime`, its Workspace code and the `unfold-agent` image are removed. The deterministic demo stays and says it is a demo.
2. **The Harness is chosen freely per session**, in the New-session dialog, from what Ploeg offers for the chosen Team: the allowed Harnesses with their profile, qualification and default per Role, shown with the last observed version. The person also chooses the model, only from the models the chosen Team's Role policy lists, with the Role's model as the default. Unfold sends both on admission; Ploeg accepts the choice and enforces it, refusing a Harness or model the Team does not allow. Unfold keeps no Harness or model list of its own. A Run still calls exactly one model, fixed at submission; on the Ploeg side this narrows Ploeg ADR-0039.
3. **Interaction is kept.** Unfold submits sessions as attended Runs. Permission requests, questions, mid-Run messages, pause and resume travel through a new Ploeg relay that the worker pulls, and live events through Ploeg's operator events. Unfold offers these controls only where Ploeg states a Run's Harness is interactive. "Approve tool use automatically" stays and is sent as Ploeg's per-Run `autoApprove` flag: checked, the Team's permission mode decides every permission request at once while questions, messages and pause still reach the person; unchecked, every permission request is shown to the person, and one left unanswered past its deadline is decided by the Team's permission mode, which Unfold shows.
4. **Each Run shows its Harness and version**, as Ploeg records them.

This supersedes these parts of ADR 0023:

* "There is no pause in v1" (Commands): pause and resume are Ploeg commands.
* "Steering reaches the next Round, not the running Run" (Steering): a message reaches the running Run where its Harness supports it, and the next Run otherwise.
* "Ploeg's ACP adapter is the only OpenCode driver" (Harness), as far as it fixes one Harness per Team plan: the Harness is chosen per session. The ACP adapter stays Ploeg's OpenCode driver.
* The consequence "interactive permission answers go away": they stay.

ADR 0023's submission route, live view by polling, cancel as withdraw, try again as requeue, the Agents window as projection and the deletion list stay in force.

The Ploeg side lands in ploeg-hq first as four changes, in order: `record-harness-per-run`, `submit-work-items` (ADR 0023's submission route), `select-harness-per-run` and `interactive-runs`. Unfold moves its pin after each release in a `ploeg`-scoped commit, per [root ADR-0019](../../../../docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md).

### Consequences

* Good, because one engine executes all work, and the Unfold runtimes, broker, execution authority and agent image can go.
* Good, because a person can pick OpenCode, Claude Code, OpenHands or another Harness, and a model, per session where the Team allows it.
* Bad, because cost per Role varies with the model a session picks; the Role's budget cap still bounds each Run.
* Good, because people keep answering, messaging and pausing, which ADR 0023 would have removed.
* Bad, because Ploeg must answer ACP permission requests asynchronously and hold a Run that waits on a person, which ADR 0023 avoided.
* Bad, because interaction depends on the Harness: spawn-and-wait Harnesses still run without asking.
* Bad, because a waiting Run holds a Lease, a pod and a Hold until its deadline.
* Neutral, because laptop use needs a running Ploeg and worker, as system ADR-0002 already accepted.

### Confirmation

Proposed, not implemented. It is implemented when:

* the `front-end` check in `mise run integration` passes with an in-process `ploeg-worker` on a deterministic ACP agent, covering submission, a permission request answered from Unfold, a mid-Run message, pause, resume across a ploegd restart, and cancel without requeue;
* `apps/unfold/src/runtime/` holds only `demo.ts`, and `apps/unfold/src/broker.ts` and `apps/unfold/src/execution-authority.ts` no longer exist;
* `npm test` in `apps/unfold` includes a dialog test showing the Harness picker and the model choice filled from a fake Ploeg Team offer, a dialog test showing a model off the Role's list refused, and a session test showing Harness and version per Run;
* `renovate.json` has no `opencode` group and no file builds `unfold-agent`.

Re-evaluate if waiting Runs measurably hold pods or Holds the Team cannot afford, or if a Harness offered per session cannot be qualified by Ploeg's live conformance suite (`pkg/harness/harnesstest`).

## Pros and Cons of the Options

### Sessions in `ploeg-worker`, Harness per session, interaction through Ploeg

* Good, because one engine and one budget path remain, and people keep the controls they use today.
* Bad, because it needs four Ploeg changes before Unfold can delete its engine.
* Bad, because a Run waiting on a person keeps a pod and a Hold until Ploeg's deadline or pause bound.

### ADR 0023 as accepted

* Good, because no worker change beyond submission and notes.
* Bad, because people lose permission answers, pause and mid-Run messages, which the owner rejected.
* Bad, because the Team plan, not the person, fixes the Harness.

### Interactive sessions on Unfold's own runtime

* Good, because today's interaction keeps working without Ploeg changes.
* Bad, because two engines, two key paths and two OpenCode drivers stay, against system ADR-0002.

## More Information

* Technical story: VIK ticket to be created; [OpenSpec change `sessions-run-in-ploeg`](../../../../openspec/changes/sessions-run-in-ploeg/proposal.md).
* 2026-10-13 — Proposed with the owner's four decisions above, for ratification.
* 2026-10-13 — The owner decided the per-session model: yes, from the models the Team's Role policy lists, the Role's model as default, sent on `POST /api/v1/operator/work-items` and refused by Ploeg when not listed (design R1). Ploeg's side lands in ploeg-hq `select-harness-per-run` with the record that narrows Ploeg ADR-0039.
* 2026-10-13 — The owner decided that "Approve tool use automatically" stays and maps to Ploeg's per-Run `autoApprove` flag from ploeg-hq `interactive-runs` (design R2); an unanswered permission request falls back to the Team's permission mode at its deadline, and Unfold shows that outcome.
* 2026-10-13 — The owner confirmed one workload per allowed Harness on the Ploeg side (Ploeg ADR-0099, design R3); Unfold relies only on Ploeg's guarantee that an admitted Harness has a workload.
* Supersedes, when accepted, the parts of [ADR 0023](0023-unfold-submits-work-to-ploeg-and-never-executes-it.md) listed above.
* Related: [ADR 0017](0017-delegate-interactive-execution-to-ploeg.md) (the Operator Execution path this retires), [ADR 0012](0012-agent-host-protocol-host.md) (the Agents window stays a projection), [ADR 0040](0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md) (loses its input with the engine), [Ploeg ADR-0068](../../../ploeg/docs/adrs/0068-context-added-while-a-shift-runs-reaches-the-next-run.md) (next-Run notes), [Ploeg ADR-0091](../../../ploeg/docs/adrs/0091-each-run-records-the-model-harness-plan-and-ploegd-version-it-was-configured-with.md) (Harness recorded per Run) and [Ploeg ADR-0039](../../../ploeg/docs/adrs/0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering.md) (a Run calls only its Role's model; narrowed by the per-session model decision above). The Ploeg records proposed with the four changes (0097 to 0101, and 0102 from `submit-work-items`) are not in the pinned Ploeg yet.
