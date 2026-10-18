---
status: accepted
date: 2026-10-18
decision-makers: Ryan Grippeling (decided by the owner's delegation on 2026-10-18)
review-by: 2027-01-18
---

# People write on the blackboard, and Unfold shows the questions, disagreements and finding answers waiting for them

## Context and Problem Statement

On 2026-10-18 the owner asked how agents should communicate and delegated the design. The answer is a blackboard: agents never talk to each other, they read and write four owned sources behind Ploeg (the forge, Ploeg, Omnigraph and the tracker), and Ploeg is the only writer to Omnigraph. Ploeg ADRs 0120 to 0123 (proposed in ploeg-hq/ploeg) record the Ploeg side: findings with ids and the writer's answer to each, typed questions, reviewer and shadow-reviewer disagreement, note provenance and promotion.

People are writers on that blackboard too. A decision a person makes while reviewing or steering is knowledge the next Run needs, and today it often stays in a chat or a head. Unfold is where people follow and act on the work ([system ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)). What does a person write through Unfold, through which Ploeg contract, and what must Unfold show so a person sees what waits for them on the blackboard?

What Ploeg offers, in the pinned release and in stream A's ploeg-hq/ploeg#180 (ADR-0121, not released yet):

* `POST /api/v1/operator/work-items/{id}/notes` stores a Work Item Note, records `X-Ploeg-Acting-User` as its author and briefs the next Run with it (Ploeg ADR-0068, ADR-0089). It accepts only queued and running work.
* `POST /api/v1/operator/work-items/{id}/requeue` restarts stopped work and briefs its Runs with a `note` (Ploeg ADR-0044). With #180 it also takes `resume: true`, which reopens only the Round whose Run asked a person, on the same branch, keeping the Rounds before it.
* Every Run shape carries `shadow` (Ploeg ADR-0096). Unfold's client dropped it, so a shadow reviewer's verdict could read as the Work Item's verdict.
* With #180, Work Item detail carries `findings` (each with its `answer` and `unanswered`), `questions` (with `waitingForPerson`), `reviewDisagreements` and `resume` (the Round a resume reopens, `roundCapUsd`, `poolUsd`, `ready`, `waitingQuestionIds`). A Shift that waits on a person closes `question_for_person`. `POST /api/v1/operator/work-items/{id}/questions/{questionId}/answer` stores a person's answer and queues nothing.
* Before #180, a Run that needs a person reports `stuck`, and the Work Item parks with `run stuck: <role> round <n>`.

## Decision Drivers

* One owner per fact: Ploeg owns notes, questions, answers, findings and verdicts. Unfold keeps no copy and writes only through Ploeg's operator contract.
* Ploeg knows no consumer. What Unfold needs from Ploeg is a Ploeg contract, in Ploeg's words.
* Every write names its person and says what it costs, in Ploeg's own numbers, before it happens ([system ADR-0037](../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)).
* Render defensively: a field an older ploegd does not send shows nothing, never an error and never an invented value.
* No paid model spend to build or test it.

## Considered Options

* **Write through Ploeg's operator routes (answer, resume or requeue, notes); read stream A's detail lists defensively and fall back to the stuck reason on an older ploegd**
* Keep person decisions in Unfold's own store and show them beside Ploeg's
* Wait for Ploeg's release before building Unfold's side

## Decision Outcome

Chosen option: "**write through Ploeg's operator routes and read stream A's lists defensively**", because a person becomes a writer today, Ploeg stays the owner of every answer and note, and each #180 field lights up the moment the pin reaches a release that sends it.

What a person can do:

* **Answer the questions a Work Item waits on.** The decision box quotes the question, who asked and in which Round, and the other questions of that Round. **Answer** (or **Answer all**) opens one dialog with a field per question. Unfold stores each answer through the answer route (409 `already_answered` counts as answered), then:
  * when Ploeg's `resume` offer is there and these answers are all it waits for, **Answer and resume Round N** is the main action. Its cost line uses Ploeg's numbers: "This Round: up to US$ <roundCapUsd>, in total up to US$ <poolUsd>", in nl-NL money format. It calls requeue with `resume: true`;
  * **Answer and start over** stays as the secondary action, with its own cost line (up to the last attempt's budget). It calls requeue without `resume`;
  * without an offer (an older ploegd) the only action starts over, and the dialog does not promise a Round: Ploeg reports where it started, and the notice says so.
  * A question without an id (the stuck reason on an older ploegd, or a close message without a `questions` list) travels as one restart note that quotes the question.
* **Leave a note.** Queued or running work offers **Leave a note** through the notes route. The next Run reads it, the running one does not, and it costs nothing.
* **The same from an agent session or the Agents window chat.** `unfold_answer_question` answers one question (`questionId`, or the oldest). It resumes or starts over only once no question of that Round waits, after one confirmation that names the cost. `unfold_add_note` writes a note as the person, `unfold_get_work` lists the questions (text under `untrusted`) and the resume offer.

What a person sees:

* **Now.** A needs-you row shows its question in place of the fix line, with an **Answer** link; a `question_for_person` row reads "Question for you". Unfold reads the detail of the first ten needs-you rows for it. A "Reviewers disagree" chip comes from Ploeg's `reviewDisagreements` for those rows and from the Runs Now already lists for the rest, with no extra read for review rows.
* **The Work Item page.** A "Reviewers disagree" card shows each Round's acting and shadow verdicts side by side with their findings, from Ploeg's `reviewDisagreements` or, on an older ploegd, compared from the Runs as the review loop combines them. A "Reviewer findings" card lists every acting finding with its severity, place and the writer's answer. Unanswered findings come first, and shadow findings sit in a closed fold marked recorded, never briefed. A writer's Run lists the findings it answered.
* **A shadow never acts in Unfold either.** The review projection, last reader, findings link, Now's verdict badge and the reasons that look for a reviewer leave shadow Runs out.

The Ploeg words table gains `question_for_person` (close reason, chip "Question for you") and the `finding-answer-status` set (`fixed`, `disagree`, `out_of_scope`, `deferred`), both `acceptedAhead` until the pin moves; the contract test skips an `acceptedAhead` code Ploeg's source does not contain yet.

### Consequences

* Good, because a person's answer reaches the Runs through Ploeg's own question record, signed with their name, and a resume spends only the Round that asked.
* Good, because a shadow reviewer can no longer pass for the Work Item's verdict on any Unfold screen.
* Good, because every #180 field shows up as soon as a Ploeg release sends it, and an older ploegd shows what it showed before plus the stuck-reason stand-in.
* Bad, because on an older ploegd answering starts the Work Item over and spends again. Accepted: it is what that Ploeg can do.
* Bad, because Now reads one detail per needs-you row (up to ten per refresh, cached) to show the question.
* Bad, because two calls make one answer (answer, then requeue). If the requeue fails, the answer is stored and the dialog can be sent again: a stored answer reads as answered, so only the requeue repeats.

### Confirmation

* `node --test test/blackboard.test.mjs`: `question_for_person` and the waiting question, the close-message and stuck-reason stand-ins, defensive reading of every list, the restart note's length, Ploeg's `reviewDisagreements` against the Runs fallback, shadow Runs out of the review projection, the Findings card, the page and dialog markup, the resume dialog with several questions and Ploeg's numbers, Now's row, and the client keeping the lists while dropping malformed entries.
* `node --test test/mcp-actions.test.ts`: `unfold_answer_question` answers under the question id, then resumes with `resume: true`, after one confirmation.
* `node --test test/ploeg-contract.test.ts`: the new rows are worded as Unfold shows them.
* The demo's DEMO-9 carries illustrative findings, a shadow reviewer that disagrees and Ploeg's disagreement record; DEMO-11 shows what its builder needs.
* Gate: `mise run verify`, run in CI by `.forgejo/workflows/on_pull_request.yml`.

## More Information

The blackboard brief of 2026-10-18, Ploeg ADRs 0120 to 0123 and ploeg-hq/ploeg#180 are the other half of this decision. The browser modules are `public/core/blackboard.js` (readers) and `public/blackboard-view.js` (markup); the client's readers are `blackboardDetail` and `resumeOffer` in `src/ploeg.ts`.

### Choices to re-check

1. Resuming is the main action and starting over the secondary one. Should starting over be offered at all once Ploeg can resume?
2. The stuck reason stands in for a question on an older ploegd. Drop it once the pin reaches #180?
3. Only non-viewers can answer or leave notes, the same line as context files. Should a client user answer questions on their own Client's work?
4. Now reads up to ten needs-you details per refresh for the question text. Should Ploeg put the waiting question on the Work Item list instead?
5. The disagreement card shows the latest three Rounds; the Findings card all findings. Enough, or too much?
6. When the pin moves, name the schema pointers of `finding-answer-status` in `docs/domain/ploeg-words.json` and drop `acceptedAhead` from it and from `question_for_person`.
7. Decisions made inside Unfold workbench sessions do not become notes on their own yet.
