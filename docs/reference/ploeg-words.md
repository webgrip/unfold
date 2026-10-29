---
type: reference
audience: [owner, operator, integrator, contributor, agent]
owner: unfold
generated_by: "mise run ploeg-words"
---

# Ploeg words and screen words

*Generated from [ploeg-words.json](../domain/ploeg-words.json) by `mise run ploeg-words`. Do not edit by hand; change the JSON and regenerate.*

Ploeg names a value in its API; Unfold shows a person a label for it. This page puts the two side by side, for every value set Unfold reads from Ploeg: what the API calls it, which Ploeg term it belongs to, what the screen calls it and what Unfold's MCP server returns. A label is today's wording, recorded as it is, not a proposal.

`apps/unfold/test/ploeg-contract.test.ts` keeps it true. For every value in Ploeg's published schemas it checks that this table lists it, that `apps/unfold/src/ploeg.ts` accepts it, and that the label here is the one Unfold renders; values Ploeg does not publish in a schema are checked against the Ploeg code or domain model that defines them. Its failure message names the value and the file to change. A Ploeg pin update re-runs it. [Who owns a term](../contributing/agent-instructions.md#who-owns-a-term) says which application decides each word.

A value marked "Unfold only" is one Unfold derives; Ploeg never sends it. A value "accepted ahead of Ploeg" is one the next Ploeg release sends and Unfold already accepts. In the MCP column, "same" means Unfold passes Ploeg's value through unchanged.

## Screen words for Ploeg terms

Docs, the API and the glossary use the Ploeg term. Screens may use a friendlier word, but only the one recorded here (system ADR-0036).

| Ploeg term | Screen word | Note |
|---|---|---|
| [Shift](glossary.md#shift) | attempt | Docs, API and glossary say Shift; screens say "attempt" ("2 agent runs in 1 attempt"). A view never uses both words for the same thing. |
| [Tracker Item](glossary.md#tracker-item) | task | Docs and API say Tracker Item; screens say "task" (the Tasks page). "Ticket" is only the billing unit of system ADR-0006. |

## Work Item state

Ploeg term: [Work Item](glossary.md#work-item). Ploeg publishes it in `operator-api.v1.schema.json` `/$defs/item/properties/state`, `operator-api.v1.schema.json` `/$defs/factsWorkItem/properties/state`, `taskspec.v1.schema.json` `/$defs/workItem/properties/state`, `tracker-execution.v1.schema.json` `/$defs/item/properties/state`.

Unfold accepts: apps/unfold/src/ploeg.ts `ploegAccepted.workItemStates`. Screen words: apps/unfold/public/core/states.js `workItemStates`; the stage strip from apps/unfold/public/core/stages.js `workStages`, without a Run card.

MCP: passes Unfold's state through as `state` in unfold_now, unfold_find_work and unfold_get_work; unfold_find_work's `state` filter accepts both `active` and `leased`.

| Value | Screen label | Stage | MCP | Note |
|---|---|---|---|---|
| `ingested` | Received | Define | same |  |
| `proposed` | Proposed | Define | same |  |
| `queued` | Queued | Execute | same |  |
| `leased` | Running | Execute | same | Deprecated: Ploeg renames it `active` (system ADR-0036). Until every Ploeg Unfold talks to sends `active`, Unfold accepts both and keeps `leased` as its own name. |
| `active` | Running | Execute | leased | Accepted ahead of Ploeg: The pinned Ploeg does not send it yet; its next release (ploeg-hq/ploeg#131) sends it in place of `leased`. Unfold accepts it now and reads it as `leased` (apps/unfold/src/ploeg.ts `ploegState`). |
| `needs_human` | Needs you | Execute (stopped) | same |  |
| `awaiting_review` | Ready for review (heading: Ready for your review) | Review | same |  |
| `stale` | Stopped retrying | Execute (stopped) | same |  |
| `done` | Done | none: finished | same |  |
| `withdrawn` | Withdrawn | Execute (stopped) | same |  |
| `rejected` | Rejected | none: finished | done | Unfold only: Unfold derives it for a Done proposal a person rejected; Ploeg keeps the state `done`. |

## Run state

Ploeg term: [Run](glossary.md#run). Ploeg publishes it in `operator-api.v1.schema.json` `/$defs/run/properties/state`, `operator-api.v1.schema.json` `/$defs/runListItem/properties/state`.

Unfold accepts: apps/unfold/src/ploeg.ts `ploegAccepted.runStates`. Screen words: apps/unfold/public/core/states.js `runStates`.

MCP: passes the Ploeg value through as `state` in unfold_now and unfold_get_work.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `pending` | Pending | same |  |
| `running` | Running | same |  |
| `finished` | Finished | same |  |
| `stopped` | Stopped | running | Unfold only: Unfold shows a Run Ploeg still lists as running as Stopped when its Work Item or session has stopped. |

## Run outcome

Ploeg term: [Outcome](glossary.md#outcome). Ploeg publishes it in `operator-api.v1.schema.json` `/$defs/run/properties/outcome`, `outcomereport.v1.schema.json` `/properties/outcome`.

Unfold accepts: any string: apps/unfold/src/ploeg.ts keeps the outcome as text. Screen words: apps/unfold/public/core/states.js `runOutcomes`.

MCP: passes the Ploeg value through as `outcome` in unfold_get_work.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `pr_opened` | Opened a pull request (short: PR opened) | same |  |
| `pr_updated` | Updated the pull request (short: PR updated) | same |  |
| `issue_updated` | Updated the tracker item (short: Tracker updated) | same |  |
| `follow_up_created` | Created follow-up work (short: Follow-up created) | same |  |
| `stuck` | Stuck | same |  |
| `yielded` | Stopped for a person (short: Taken over) | same |  |
| `failed` | Failed | same |  |
| `no_change_needed` | No change needed (short: No change) | same |  |

## Verdict

Ploeg term: [Verdict](glossary.md#verdict). Ploeg publishes it in `operator-api.v1.schema.json` `/$defs/run/properties/verdict`, `operator-api.v1.schema.json` `/$defs/runListItem/properties/verdict`.

Unfold accepts: any string: apps/unfold/src/ploeg.ts keeps the verdict as text. Screen words: apps/unfold/public/core/states.js `verdicts`.

MCP: passes the Ploeg value through as `verdict` in unfold_get_work, `""` for none.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `` (empty) | No agent verdict (short: No verdict) | same |  |
| `approve` | Agent review: approve (short: Agent approved) | same |  |
| `request_changes` | Agent review: changes requested (short: Agent asked for changes) | same |  |
| `inconclusive` | Agent review: inconclusive (short: Inconclusive) | not exposed | Unfold only: Unfold's own session reviewers can report it; Ploeg's schema has no such verdict. |

## Run failure reason

Ploeg term: [Outcome Report](glossary.md#outcome-report). Ploeg publishes it in `outcomereport.v1.schema.json` `/properties/failureReason`. The operator API types a Run's `failureReason` as free text; the outcome report schema names the values.

Unfold accepts: any string: apps/unfold/src/ploeg.ts keeps the failure reason as text. Screen words: apps/unfold/public/core/states.js `failureReasons`.

MCP: passes the Ploeg value through as `failureReason` in unfold_get_work, `""` for none.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `infra_node` | The machine running the Run failed | same |  |
| `infra_llm` | The model gateway failed | same |  |
| `agent_error` | The agent exited with an error | same |  |
| `budget` | The agent reached its token ceiling | same |  |
| `lease_lost` | The worker stopped responding | same |  |
| `timeout` | The Run timed out | same |  |
| `idle` | The agent went silent | same |  |
| `credential_leak` | The Run leaked a credential | same |  |
| `shared_budget_spent` | A shared model budget is spent | same |  |

## Shift close reason

Ploeg term: [Shift](glossary.md#shift). Not in a published schema: the operator API types `closeReason` as free text. The test checks each code against the Go constant that writes it. The refusal codes in pkg/httpapi, such as `person_token_required` (ADR-0171), answer an HTTP request and never close a Shift, so the test does not read that package.

Unfold accepts: any string: apps/unfold/src/ploeg.ts keeps the close reason as text. Screen words: apps/unfold/public/core/states.js `closeReasonLabel` (Shift rows, audit lines) and apps/unfold/public/core/reasons.js `listReason` (the Needs-you chip).

MCP: unfold_get_work passes `closeReason` through on each Shift; unfold_now and unfold_get_work add `reason.code` and `reason.chip` from reasons.js.

| Value | Screen label | Needs-you chip | MCP | Note |
|---|---|---|---|---|
| `review_approved` | An agent reviewer approved | Pull request closed | same |  |
| `plan_exhausted` | Every planned Round ran | Every Round ran, no result | same |  |
| `review_failed` | No agent reviewed it: the reviewer kept failing | Reviewer kept failing | same |  |
| `fix_round_cap_reached` | The fix Rounds ran out | Reviewer still wants changes | same |  |
| `budget_exhausted_before_fix_round` | The budget ran out before a fix Round | Budget ran out | same |  |
| `checks_not_passed` | The checks did not pass | Checks did not pass | same |  |
| `ci_not_finished` | CI was still running when Ploeg stopped waiting | CI did not finish | same |  |
| `ci_not_passed` | CI failed for a reason the writer cannot fix | CI did not pass | same |  |
| `writing_run_failed_repeatedly` | The writer kept failing | Writer kept failing | same |  |
| `writing_run_killed_repeatedly` | The cluster kept stopping the writer | Cluster kept stopping the writer | same |  |
| `withdrawn_unassigned` | The task was unassigned from the Team | — | same |  |
| `withdrawn_closed` | The task was closed before any Run started | — | same |  |
| `withdrawn_by_operator` | An operator cancelled it | — | same |  |
| `withdrawn_session_ended` | An operator closed it after its Unfold session ended | — | same |  |
| `operator_adopted` | An Unfold session took it over | — | same |  |
| `operator_admission_expired` | The Unfold session never started | — | same |  |
| `operator_completed` | The Unfold session completed it | — | same |  |
| `operator_cancelled` | The Unfold session was cancelled | — | same |  |
| `operator_failed` | The Unfold session failed | Session failed | same |  |
| `budget exhausted`… | The US$ 5,00 budget ran out | Budget ran out | budget exhausted: pool 5, spent 4, reserved 1 | Prefix; the label shown is for `budget exhausted: pool 5, spent 4, reserved 1`. |
| `budget held by unsettled runs`… | The US$ 5,00 budget is still held, not spent | Budget held, not spent | budget held by unsettled runs: pool 5, spent 1, held 4 | Prefix; the label shown is for `budget held by unsettled runs: pool 5, spent 1, held 4`. |
| `run stuck`… | The writer got stuck in Round 2 | Agent is stuck | run stuck: writer round 2 | Prefix; the label shown is for `run stuck: writer round 2`. |
| `plan removed from configuration`… | The Team plan was removed | Team plan removed | same | Prefix; the label shown is for `plan removed from configuration`. |
| `question_for_person` | An agent asked a person a question | Question for you | same | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#180, ADR-0121) writes it; the pinned Ploeg does not yet. Unfold already words it. |
| `taken_over` | A person took it over | Taken over by a person | same |  |

## Finding answer status

Ploeg term: [Outcome Report](glossary.md#outcome-report). Published as the enum of `findings[].answer.status` and `runFindingAnswer.status` in operator-api.v1.schema.json from ploeg-hq/ploeg#180 (ADR-0121). The pinned Ploeg does not publish it yet; once the pin moves, name the schema pointers here.

Unfold accepts: apps/unfold/src/ploeg.ts `findingAnswerStatuses`; any other status drops the answer. Screen words: apps/unfold/public/core/blackboard.js `findingAnswerKinds`.

MCP: unfold_get_work passes the status through as `findings[].answer.status`.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `fixed` | Fixed | same | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#180) sends it. |
| `disagree` | Disagrees | same | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#180) sends it. |
| `out_of_scope` | Out of scope | same | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#180) sends it. |
| `deferred` | Deferred | same | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#180) sends it. |

## Operator Execution needs_human reason

Ploeg term: [Operator Execution](glossary.md#operator-execution). The `reason` of a `work_item.needs_human` event when an Operator Execution hands its Work Item to a person: `operator_` plus the execution state, or `operator_expired`.

Unfold accepts: any string. Screen words: apps/unfold/public/core/reasons.js `listReason` (the Needs-you chip).

MCP: `reason.code` and `reason.chip` in unfold_now and unfold_get_work.

| Value | Needs-you chip | MCP | Note |
|---|---|---|---|
| `operator_paused` | Session paused | same |  |
| `operator_interrupted` | Session interrupted | same |  |
| `operator_waiting_input` | Session needs an answer | same |  |
| `operator_failed` | Session failed | same |  |
| `operator_expired` | Session lost contact | same |  |

## Operator Execution state

Ploeg term: [Operator Execution](glossary.md#operator-execution). Not in a published schema; the states are the Operator Execution lifecycle in Ploeg's domain model.

Unfold accepts: apps/unfold/src/execution-authority.ts `executionStates`. Screen words: apps/unfold/public/core/states.js `executionStateText` (the session feed's `execution.authority` line).

MCP: not exposed: unfold_sessions reports Unfold's own session status.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `admitted` | Ploeg admitted this execution | not exposed |  |
| `running` | Ploeg marked this execution running | not exposed |  |
| `waiting_input` | Ploeg is holding this execution for your answer | not exposed |  |
| `pause_requested` | Ploeg is pausing this execution | not exposed |  |
| `paused` | Ploeg paused this execution | not exposed |  |
| `cancel_requested` | Ploeg is cancelling this execution | not exposed |  |
| `cancelled` | Ploeg cancelled this execution | not exposed |  |
| `completed` | Ploeg recorded this execution as completed | not exposed |  |
| `failed` | Ploeg recorded this execution as failed | not exposed |  |
| `interrupted` | Ploeg recorded this execution as interrupted | not exposed |  |

## Run cost status

Ploeg term: [Inference Account](glossary.md#inference-account). Ploeg publishes it in `operator-api.v1.schema.json` `/$defs/run/properties/costStatus`. One cost status set for every money figure, owned by Ploeg (system ADR-0036): `observed`, `provisional`, `settled`, `unknown`. This field publishes the part of it shown here.

Unfold accepts: apps/unfold/src/ploeg.ts `ploegAccepted.runCostStatuses`. Screen words: apps/unfold/public/core/states.js `costStatuses`, the word shown next to the amount.

MCP: not exposed: unfold_get_work gives `costUsd`, null when Ploeg reported none.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `observed` | so far | costUsd |  |
| `provisional` | not final yet | costUsd | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#131) sends it; the pinned Ploeg does not yet. Unfold already accepts and words it. |
| `settled` | final | costUsd | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#131) sends it; the pinned Ploeg does not yet. Unfold already accepts and words it. |
| `unknown` | not known yet | costUsd: null |  |

## Ask cost status

Ploeg term: [Ask](glossary.md#ask). Ploeg publishes it in `operator-api.v1.schema.json` `/$defs/askSpend/properties/costStatus`, `operator-api.v1.schema.json` `/$defs/factsAsk/properties/costStatus`. One cost status set for every money figure, owned by Ploeg (system ADR-0036): `observed`, `provisional`, `settled`, `unknown`. This field publishes the part of it shown here.

Unfold accepts: apps/unfold/src/ploeg.ts `ploegAccepted.askCostStatuses`. Screen words: apps/unfold/public/core/states.js `costStatuses`, the word shown next to the amount.

MCP: `costStatus` in unfold_ask, Ploeg's value unchanged.

| Value | Screen label | MCP | Note |
|---|---|---|---|
| `observed` | so far | same | Accepted ahead of Ploeg: Ploeg's next release (ploeg-hq/ploeg#131) sends it; the pinned Ploeg does not yet. Unfold already accepts and words it. |
| `provisional` | not final yet | same | Retired Unfold word: Unfold called it `pending` before system ADR-0036. An Ask stored with `pending` reads as `provisional` (apps/unfold/src/store.ts). |
| `settled` | final | same |  |
| `unknown` | not known yet | same |  |

## Audit event

Ploeg term: [Work Item](glossary.md#work-item). Not in a published schema: the operator API types an event's `action` as free text. The test checks each action against the Go code that writes it. Ploeg also writes `forge.<kind>` for forge webhooks and `worker.request_rejected` without a Work Item; neither is listed.

Unfold accepts: any string. Screen words: apps/unfold/public/core/states.js `auditEvent` (Activity, the Work Item history).

MCP: not exposed; unfold_get_work quotes the reason of the latest `work_item.<state>` event as `ploegSaid`.

| Value | Ploeg term | Screen label | MCP | Note |
|---|---|---|---|---|
| `work_item.queued` | [Work Item](glossary.md#work-item) | Queued | not exposed |  |
| `work_item.refreshed` | [Work Item](glossary.md#work-item) | The tracker task changed | not exposed |  |
| `work_item.proposed` | [Work Item](glossary.md#work-item) | Proposed by an agent | not exposed |  |
| `work_item.approved` | [Work Item](glossary.md#work-item) | Approved | not exposed |  |
| `work_item.rejected` | [Work Item](glossary.md#work-item) | Rejected | not exposed |  |
| `work_item.withdrawn` | [Work Item](glossary.md#work-item) | Withdrawn | not exposed |  |
| `work_item.leased` | [Work Item](glossary.md#work-item) | Running | not exposed |  |
| `work_item.needs_human` | [Work Item](glossary.md#work-item) | Needs you | not exposed |  |
| `work_item.awaiting_review` | [Work Item](glossary.md#work-item) | Ready for your review | not exposed |  |
| `work_item.done` | [Work Item](glossary.md#work-item) | Done | not exposed |  |
| `work_item.stale` | [Work Item](glossary.md#work-item) | Stopped retrying | not exposed |  |
| `created_work_item.accepted` | [Work Item](glossary.md#work-item) | Created follow-up work | not exposed |  |
| `created_work_item.rejected` | [Work Item](glossary.md#work-item) | Proposed work was refused by policy | not exposed |  |
| `follow_up.created` | [Follow-Up](glossary.md#follow-up) | Follow-up created from the forge | not exposed |  |
| `follow_up.skipped` | [Follow-Up](glossary.md#follow-up) | Follow-up skipped | not exposed |  |
| `review.changes_requested` | [Verdict](glossary.md#verdict) | Changes requested on the pull request | not exposed |  |
| `review.rework_capped` | [Verdict](glossary.md#verdict) | Request for changes kept for later: this Work Item reached its rework cap | not exposed |  |
| `review.rework_refused` | [Verdict](glossary.md#verdict) | Request for changes ignored: the reviewer may not send work back | not exposed |  |
| `round.opened` | [Round](glossary.md#round) | Round started | not exposed |  |
| `round.reopened` | [Round](glossary.md#round) | Round retried after a failed writer | not exposed |  |
| `run.claimed` | [Run](glossary.md#run) | An agent started | not exposed |  |
| `run.expired` | [Run](glossary.md#run) | An agent stopped responding | not exposed |  |
| `shift.closed` | [Shift](glossary.md#shift) | Attempt closed | not exposed |  |
| `lease.acquired` | [Lease](glossary.md#lease) | A worker took the Work Item | not exposed |  |
| `lease.expired` | [Lease](glossary.md#lease) | Worker stopped responding · Ploeg retries | not exposed |  |
| `infra_cap` | [Lease](glossary.md#lease) | Infrastructure kept failing; Ploeg stopped | not exposed |  |
| `checkpoint.written` | [Checkpoint](glossary.md#checkpoint) | Wrote a checkpoint | not exposed |  |
| `operator.admitted` | [Operator Execution](glossary.md#operator-execution) | An Unfold session took over | not exposed |  |
| `operator.admission_expired` | [Operator Execution](glossary.md#operator-execution) | The Unfold session never started | not exposed |  |
| `operator.attribution_refused` | [Work Item](glossary.md#work-item) | Ploeg refused a change that did not prove who made it | not exposed |  |
| `delivery.candidate_admitted` | [Delivery Candidate](glossary.md#delivery-candidate) | Delivery candidate admitted | not exposed |  |
| `delivery.verification_recorded` | [Verification Receipt](glossary.md#verification-receipt) | Verification recorded | not exposed |  |
| `delivery.approved` | [Delivery Candidate](glossary.md#delivery-candidate) | Delivery approved | not exposed |  |
| `delivery.publication_published` | [Publication Operation](glossary.md#publication-operation) | Published to the forge | not exposed |  |
| `delivery.publication_unknown` | [Publication Operation](glossary.md#publication-operation) | Publication result unknown | not exposed |  |
| `delivery.publication_reserved` | [Publication Operation](glossary.md#publication-operation) | Publication reserved | not exposed |  |
| `llm.reserved` | [Inference Account](glossary.md#inference-account) | Budget held for a Run | not exposed |  |
| `llm.minting` | [Inference Account](glossary.md#inference-account) | Model key requested | not exposed |  |
| `llm.issued` | [Inference Account](glossary.md#inference-account) | Model key issued | not exposed |  |
| `llm.observed` | [Inference Account](glossary.md#inference-account) | Model spend observed | not exposed |  |
| `llm.unknown` | [Inference Account](glossary.md#inference-account) | Spend could not be settled | not exposed |  |
| `llm.reconciled` | [Inference Account](glossary.md#inference-account) | Spend settled | not exposed |  |
| `llm.blocked` | [Inference Account](glossary.md#inference-account) | Model key blocked | not exposed |  |
| `llm.unissued_blocked` | [Inference Account](glossary.md#inference-account) | Unused model key blocked | not exposed |  |
| `work_item.requeued` | [Work Item](glossary.md#work-item) | Queued for a new attempt | not exposed |  |
| `work_item.route_refused` | [Work Item](glossary.md#work-item) | The task could not be routed to a repository | not exposed |  |
| `work_item.epics_seen` | [Work Item](glossary.md#work-item) | The task’s epics changed | not exposed |  |
| `work_item.dependencies_seen` | [Work Item](glossary.md#work-item) | The task’s blockers changed | not exposed |  |
| `work_item.premise_checked` | [Work Item](glossary.md#work-item) | Checked the task before starting | not exposed |  |
| `pull_request.mergeable` | [Forge Event](glossary.md#forge-event) | The merge conflict is resolved | not exposed |  |
| `pull_request.conflicted` | [Forge Event](glossary.md#forge-event) | The pull request has a merge conflict | not exposed |  |
| `pull_request.reverted` | [Forge Event](glossary.md#forge-event) | The merged pull request was reverted | not exposed |  |
| `pull_request.closed_for_leak` | [Work Item](glossary.md#work-item) | The pull request was closed after a credential leak | not exposed |  |
| `pull_request.leak_close_failed` | [Work Item](glossary.md#work-item) | The pull request could not be closed after a credential leak | not exposed |  |
| `pull_request_comment.upserted` | [Forge Event](glossary.md#forge-event) | Comment posted on the pull request | not exposed |  |
| `pull_request_comment.deleted` | [Forge Event](glossary.md#forge-event) | Comment removed from the pull request | not exposed |  |
| `deploy.recorded` | [Forge Event](glossary.md#forge-event) | Deployed | not exposed |  |
| `ask.admitted` | [Ask](glossary.md#ask) | Asked a model about this work | not exposed |  |
| `ask.finished` | [Ask](glossary.md#ask) | Ask finished | not exposed |  |

## Known gaps

Values Ploeg sends that Unfold does not word yet. The test records them as they are; when one is fixed, remove its `gap` from the table.

