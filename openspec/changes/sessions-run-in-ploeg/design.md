## Context

Today a session runs in Unfold. `Engine.execute`
([engine.ts:1049](../../../apps/unfold/src/engine.ts#L1049)) verifies the
Operator Execution and takes its key from Ploeg
([:1062-1063](../../../apps/unfold/src/engine.ts#L1062-L1063)), or mints one
through Unfold's own LiteLLM broker for a standalone session, then calls
`runtime.prepare` and drives each Role through OpenCode's HTTP server
([runtime/opencode.ts](../../../apps/unfold/src/runtime/opencode.ts)) in a
Docker container or a pod ([runtime/kubernetes.ts](../../../apps/unfold/src/runtime/kubernetes.ts))
built from `unfold-agent` ([ops/agent/Dockerfile](../../../apps/unfold/ops/agent/Dockerfile),
OpenCode 1.18.35). That driver is what gives Unfold its interaction today:
`permission.asked` and `question.asked` events become session requests
([opencode.ts:222-230](../../../apps/unfold/src/runtime/opencode.ts#L222-L230)),
`respond` answers them ([engine.ts:773](../../../apps/unfold/src/engine.ts#L773)),
`setApproval` switches the permission rules
([engine.ts:158](../../../apps/unfold/src/engine.ts#L158),
[opencode.ts:178-181](../../../apps/unfold/src/runtime/opencode.ts#L178-L181)),
and `pause`, `resume` and `setSupervision` act on the local process
([engine.ts:283](../../../apps/unfold/src/engine.ts#L283),
[:321](../../../apps/unfold/src/engine.ts#L321),
[:578](../../../apps/unfold/src/engine.ts#L578)). Ploeg only admits and budgets
([ploeg-execution.md, Ownership](../../../apps/unfold/docs/contracts/ploeg-execution.md#ownership)).

Ploeg's worker runs four adapters: `openhands` (default), `acp` with the
profiles `opencode`, `qwen-code`, `goose` and `openhands`, `claude-code`, and
`exec` ([inside-a-run.md:123-132](../../../docs/concepts/inside-a-run.md#harness-adapters)).
The ACP adapter answers every permission request at once from the Team's mode
(`allow_always`, `allow_read_only` or `deny_all`). The pinned Ploeg
(0.2.0-rc.19, `345fc80`) already records `harness` and `harnessProfile` per Run
(Ploeg ADR-0091) and offers cancel, next-Run notes (Ploeg ADR-0068) and requeue
(Ploeg ADR-0044) on `/api/v1/operator/work-items/{id}/…`, but no submission
route, no pause, no Harness choice per Run and no interaction channel.

System ADR-0002 and application ADR-0023 (both accepted, not implemented) put
execution in Ploeg. The owner's decisions of 2026-10-13 keep that direction and
change three of ADR-0023's limits; ADR-0044 records them. Three further owner
decisions of the same day settle the per-session model, the "Approve tool use
automatically" checkbox and one workload per Harness (Resolved Decisions R1 to
R3).

The Ploeg side is planned in four ploeg-hq changes on the branch
`feat/per-run-harness-and-interaction`, all proposed and none released:

| Ploeg change | What Unfold uses from it | Ploeg records |
| --- | --- | --- |
| `record-harness-per-run` | `harnessVersion` and `harnessAgent` on `run` and `runListItem`; per Role on `GET /api/v1/operator/teams`: `harness` (`{name, profile}`), `model` and `observedHarness` (`{name, profile, version, agent, recordedAt}`) | ADR-0097 |
| `submit-work-items` | `POST /api/v1/operator/work-items` (ADR-0023 increment 1): idempotent by `requestId`, fingerprinted, opens the Shift with the Team plan | ADR-0102 (supersedes Ploeg ADR-0024) |
| `select-harness-per-run` | an optional Harness on that admission, refused outside the Team's allowlist or when unqualified; the resolved Harness per Role in the response; allowlist, default, qualification and the observed version per allowlisted Harness per Role on the Teams read; one workload per allowed Harness; per R1, the models each Role's policy lists and an optional model on the admission, refused when the Role's policy does not list it | ADR-0098, ADR-0099, and Ploeg ADR-0103, which narrows Ploeg ADR-0039 |
| `interactive-runs` | an `attended` flag on the admission; per R2, a per-Run `autoApprove` flag; per-Run interaction reads and `answer`, `message`, `pause`, `resume` commands; request and resolution events on `/operator/events`; `interactive` per Harness on the Teams read | ADR-0100, ADR-0101, ADR-0104 (narrows Ploeg ADR-0068 for attended Runs) |

## Goals / Non-Goals

**Goals:**

- Every non-demo session is a Ploeg Work Item executed by `ploeg-worker`.
- A person picks the Harness per session from the Team's allowlist in Ploeg,
  and the model from the models the Team's Role policy lists (R1).
- Permission answers, questions, mid-Run messages, pause and resume work for
  every Harness Ploeg marks interactive.
- Each Run shows the Harness, profile, version and agent Ploeg recorded.
- Unfold's local runtimes, Workspace code, broker, execution authority and the
  `unfold-agent` image are deleted, in increments that each ship and revert.

**Non-Goals:**

- Any change inside `apps/ploeg` in this change (root ADR-0019).
- Production desired state in `webgrip/homelab-cluster`.
- Live attach to the worker (option S3 in the
  [front-end proposal](../../../apps/unfold/docs/ploeg-front-end.md#options)),
  per-session budgets above the Team pool, moving the demo onto a Ploeg fixture.

## Decisions

### D1. Build on ADR-0023's submission path, not on Operator Executions

Sessions use ADR-0023's ordinary Work Item submission, built in ploeg-hq
`submit-work-items`, not a worker-executed Operator Execution. Alternative:
keep Operator Executions and let `ploeg-worker` claim them. Rejected for the
reasons in ADR-0023: placeholder rows and ten scheduler exclusions stay. Ploeg's
`select-harness-per-run` (its Open Question 1) puts the Harness only on this
route, because an Operator Execution is executed by the consumer.

### D2. Unfold reads the Harness offer; it never owns one

The picker is filled from `GET /api/v1/operator/teams` as extended by
`record-harness-per-run`, `select-harness-per-run` and `interactive-runs`.
`/api/bootstrap` replaces `runtimes` and `placements` with each Team's offer,
read on the server and cached for a short time; `models` gives way to the
models each Role's policy lists, with the Role's model as the default (R1). The version shown before a session starts is Ploeg's
`observedHarness`, the last version a Run of that Role recorded, and is labelled
as observed. Alternative: an Unfold-side list of Harnesses. Rejected: it would
drift from what workers can run, and Ploeg must enforce the choice anyway.

### D3. The Harness resolves per Role, and Try again keeps it

Ploeg stores the resolved Harness on each pending Run: the requested one where
the Run's Role allows it, otherwise the Role's default (Ploeg ADR-0098). A
reviewer can therefore run a different Harness than the one a person picked.
Unfold shows the resolved Harness per Role from the admission response before
the first Run starts. Retries and later Rounds resolve the same way, so Try
again (requeue) reuses the stored choice; a different Harness needs a new
session. Ploeg's Open Question 2 in `select-harness-per-run` decides whether
the choice applies to every Role or to writing Roles only; Unfold renders
whichever the response states. The chosen model (R1) is stored and reused the same
way, and Unfold shows the model Ploeg resolved per Role from the same response;
how a choice applies to a Role whose policy does not list it is Ploeg's rule in
`select-harness-per-run`, not Unfold's.

### D4. Interaction is pulled by the worker and relayed by Unfold's server

The worker pod reaches only the gateway, the forge and ploegd, so every channel
into a running Run is pulled by the worker (ADR-0023 drivers). Ploeg's
`interactive-runs` proposes the relay: an admission marks the work attended;
the worker posts permission requests and questions to ploegd and long-polls the
Run's inbox for answers, messages, pause, resume and cancellation; the ACP
adapter uses an `ask` mode that waits off the read loop. Unfold submits every
session as attended, with `autoApprove` from the dialog's checkbox (R2), reads a Run's interactions and the request and resolution
events through the operator API, and sends `answer`, `message`, `pause` and
`resume` per Run with persisted command identities. Alternative: Unfold talks to
the worker directly. Rejected: it breaks the worker's network boundary.
Alternative: keep OpenCode in Unfold for interactive sessions only. Rejected by
the owner (decision 1).

### D5. Live view: server-side polling first

As ADR-0023 decided, Unfold's server polls `GET /api/v1/operator/events` per
watched Work Item and feeds its SSE stream. Interaction raises the latency
requirement (a waiting permission request has a deadline, 10 minutes by
default). If polling every two seconds is too slow or too heavy, a Ploeg SSE
endpoint (front-end increment 13) becomes a prerequisite; `interactive-runs`
leaves push delivery out, so that would be a fifth Ploeg change. The cursor
contract is the same, so the switch needs no migration.

### D6. Controls follow Ploeg's `interactive` flag

The Teams read states per Harness whether it is interactive; in
`interactive-runs` only `acp` is. Unfold renders controls from that flag. A
session on another Harness shows "runs without asking; messages reach the next
Run", and Unfold does not offer answer, pause or resume, which Ploeg would
refuse with `not_interactive`; a message is accepted by Ploeg as a Work Item
note. This keeps one UI and avoids promising controls a Harness cannot honour.

### D7. Supervision folds into the deadline

`setSupervision` (human or background) has no worker equivalent. A Run waiting
on a person keeps waiting until Ploeg's deadline, then Ploeg's fallback applies:
a permission resolves by the Team's permission mode, a question is refused.
"Approve tool use automatically" is the per-Run `autoApprove` flag set at
submission (R2); Unfold offers switching it on a running Run only if Ploeg
exposes a command for it, which `interactive-runs` does not propose.

### D8. Candidates retire with the engine

Following ADR-0023, Unfold candidates, the delivery verifier (ADR-0019) and the
trusted publisher (ADR-0040) lose their input once the engine path is deleted;
the result is Ploeg's pull request. Whether to stop work on the publisher is
Open Question 6.

### D9. Delete in increments, behind the switch

1. Read and show Harness, version and agent per Run (needs
   `record-harness-per-run`).
2. Submission behind `ploeg.submit` (needs `submit-work-items`).
3. Harness and model picker (needs `select-harness-per-run` with R1's model
   list).
4. Interaction relay, controls and `autoApprove` (needs `interactive-runs`).
5. Switch the default; old configuration is rejected; Operator Executions drain.
6. Delete runtimes, Workspace code, broker, execution authority, the image and
   its Renovate rules, after the drain check passes.

## Risks / Trade-offs

- [Ploeg's four changes slip or change shape] → each Unfold increment names
  the Ploeg release it needs; nothing switches before its pin moves.
- [A Run waiting on a person holds a Lease, a pod and a Hold] → Ploeg's answer
  deadline and pause bound; the harness timeout and Job deadline keep counting
  (Ploeg ADR-0101).
- [ACP messages land at a turn boundary, not mid-turn] → the UI says where a
  message landed; Ploeg's interrupting message cancels the turn first.
- [A model is removed from the Role's policy between dialog and submit] →
  Ploeg refuses the admission; Unfold shows the refusal with the current list
  and never substitutes another model.
- [Non-ACP Harnesses get no interaction] → stated per Harness in the picker, so
  the choice is informed.
- [Polling latency for permission prompts] → D5's SSE fallback.
- [A paused Run whose pod dies cannot resume] → Ploeg ends it `needs_human`
  with `paused_run_lost`; Unfold offers Try again, never an automatic retry.
- [Local workstation use needs a running Ploeg and worker] → accepted by
  ADR-0002; Open Question 4.
- [Losing Unfold's pre-flight brief check and per-Step events] → Ploeg's Run
  activity and transcript replace per-Step events; the brief check moves to
  Ploeg or is dropped (Open Question 7).
- [Unfold's Crews and their per-Role instructions disappear] → Open Question 3.

## Migration Plan

1. Ploeg: land and release, in order, `record-harness-per-run`,
   `submit-work-items`, `select-harness-per-run` and `interactive-runs` in
   ploeg-hq. `select-harness-per-run` carries R1's per-Role model list and
   the model on the admission, with Ploeg ADR-0103, which narrows Ploeg ADR-0039;
   `interactive-runs` carries R2's `autoApprove`. `interactive-runs`' pause inside a Run (Ploeg ADR-0101) replaces
   front-end increment 5's pause at the Run boundary.
2. Unfold: after each Ploeg release, a `ploeg`-scoped commit moves the pin, then
   the matching Unfold increment from D9 lands.
3. Switch release: new sessions submit to Ploeg; managed sessions admitted
   earlier finish under the Operator Execution contract; local sessions become
   read-only history.
4. Drain: operators finish, cancel or close every open Operator Execution; the
   health route counts them.
5. Delete release: refuses to start while any remain; removes code, image,
   chart values and Renovate rules.
6. Homelab follow-ups (in `webgrip/homelab-cluster`, not here): remove
   Unfold's workspace namespace, RBAC, Kata warm pool and `workspace*` values
   and the `unfold-agent` image pin; add or adjust Ploeg Team plans with
   Harness allowlists, defaults, interaction timeouts and the worker images
   (OpenCode included); give the Unfold consumer `execute` on the Teams it
   submits to; drop the Unfold LiteLLM master key ExternalSecret once the
   broker is gone.

Rollback: before step 5, turn `ploeg.submit` off and the previous runtime path
serves new sessions. After step 5, roll back to the switch release.

## Resolved Decisions

The owner answered these on 2026-10-13; they were Open Questions 8 and 10.

- **R1. Per-session model: yes, from the Team's list (2026-10-13).** The
  New-session dialog offers only the models the chosen Team's Role policy lists,
  as Ploeg's Teams read gives them, and preselects the Role's model. Unfold
  sends the chosen model on `POST /api/v1/operator/work-items` and in the
  submission fingerprint; Ploeg refuses a model the Role's policy does not list,
  and Unfold shows the refusal without substituting another. A Run still calls
  exactly one model, fixed at submission. On the Ploeg side this lands in
  `select-harness-per-run` (which resolves its Open Question 6 the same way),
  with Ploeg ADR-0103, which narrows Ploeg ADR-0039. Rejected: no model choice (the
  dialog loses a field people use today, and changing models means editing the
  Team plan). Trade-off: cost per Role is no longer comparable across sessions;
  the Role's budget cap still bounds each Run.
- **R2. "Approve tool use automatically" stays and maps to Ploeg's per-Run
  `autoApprove` flag (2026-10-13).** `interactive-runs` adds the flag to the
  admission and stores it on each Run. Checked: every permission request is
  decided at once by the Team's permission mode, while questions, mid-Run
  messages and pause still reach the person. Unchecked: every permission
  request is shown to the person; if nobody answers before its deadline, the
  Team's permission mode decides, and Unfold shows that outcome on the request.
  The Team's permission mode and a read-only Role stay the ceiling either way.
  Rejected: submitting the session unattended (loses messages and pause) and
  dropping the checkbox (loses today's behaviour). This also answers Ploeg's
  `interactive-runs` Open Question 4 for Unfold: an expired permission follows
  the Team's mode.
- **R3. One workload per Harness (2026-10-13).** Ploeg renders a workload per
  allowed (Team, Role, Harness) and the claim selects on the stored Harness
  (`select-harness-per-run` decision 3, Ploeg ADR-0099). Unfold relies on it
  only through Ploeg's guarantee that an admitted Harness always has a
  workload, and keeps no copy of the rule.

## Open Questions

1. **Budget while a Run waits on a person.** Ploeg proposes (ADR-0100,
   ADR-0101) that the Run keeps its Lease, pod and Hold while it waits, that an
   unanswered request expires after the Team's answer timeout (default 10
   minutes, at most 30), and that the harness timeout and Job deadline keep
   counting. Recommendation: accept Ploeg's proposal and show the deadline and
   the held budget on the session. Trade-off: bounded and simple, but a pod
   sits idle while a person decides.
2. **Pause semantics.** Ploeg proposes (ADR-0101) that pause cancels the ACP
   turn and keeps the session; resume is accepted only after the stop is
   confirmed; a pause past the Team's bound (default 30 minutes) ends the Run
   `stuck` with `paused_too_long`; a paused Run whose pod dies ends with
   `paused_run_lost` and its Work Item goes to `needs_human`; neither is
   retried automatically; non-interactive Harnesses refuse pause. Recommendation:
   accept it; Unfold shows each ending in plain words and offers Try again.
   Trade-off: a long pause loses the agent's context, unlike a local pause
   today that could last indefinitely.
3. **Crews versus Ploeg Roles.** Recommendation: retire Unfold's Crews and show
   Ploeg Team plans; per-Role instructions move into Ploeg Team plans in the
   homelab repository. Trade-off: no per-session crew editing in Unfold.
4. **Local Docker and workstation sessions.** Recommendation: drop Unfold's
   placements; a workstation runs `mise run demo-unified` with a local ploegd
   and worker. Trade-off: laptop use needs Postgres and a worker image, as
   ADR-0002 already accepted.
5. **Take-control.** Recommendation: keep ADR-0023's branch hand-over as a later
   increment, not in this change. Trade-off: no in-agent takeover until then.
6. **ADR-0040's publisher.** Recommendation: stop work on it; Ploeg's
   publication path serves every Work Item. Trade-off: no Unfold-signed
   candidates.
7. **Pre-flight brief check.** Today it calls the gateway from Unfold
   ([engine.ts:875](../../../apps/unfold/src/engine.ts#L875)).
   Recommendation: move it to Ploeg's admission as an optional cheap check;
   until then, drop it. Trade-off: a vague brief can spend a Run's budget.
8. **Ticket.** No VIK ticket exists; one must be created before implementation.
9. **Ploeg questions Unfold depends on.** `interactive-runs` Open Question 3
   (whether an attended Run lingers after its turn for a follow-up message)
   decides whether a session can feel like a chat; `select-harness-per-run`
   Open Question 5 keeps `claude-environment` out of the picker.
   `interactive-runs` Open Question 4 (what an expired permission does) is
   answered for Unfold by R2, and `select-harness-per-run` Open Question 6 (a
   model per session) by R1. The earlier gap, an observed version without its
   Harness name, is closed on the Ploeg side: `observedHarness` names its
   Harness and `select-harness-per-run` gives one observed version per
   allowlisted Harness. Recommendation: answer the two remaining ones in
   ploeg-hq before Unfold's increments 3 and 4; Unfold renders whatever Ploeg
   returns and keeps no copy of the rule.
