# Ploeg session execution

## ADDED Requirements

### Requirement: A non-demo session executes only in ploeg-worker

In `live` mode, starting a session SHALL submit it to Ploeg as a Work Item for
the session's Team and Work Target, marked attended and carrying the
session's `autoApprove` choice (design R2), and Ploeg's worker SHALL
execute every Run of it. Unfold MUST NOT prepare a Workspace, start a Harness,
mint or receive a model key, or call the model gateway for a non-demo session.
The only runtime Unfold registers SHALL be the demo runtime, and only in `demo`
mode.

#### Scenario: Starting a live session

- **WHEN** a person with execute permission for the Team starts a live session
- **THEN** Unfold submits one attended Work Item to Ploeg, records the returned
  Work Item and Shift on the session, and launches no local process, container
  or pod

#### Scenario: No local runtime is reachable

- **WHEN** the application starts in `live` mode
- **THEN** no module imports a non-demo runtime, and `/api/bootstrap` lists no
  runtime other than the Team Harness offers

### Requirement: Submission is idempotent and never repeats paid work

Unfold SHALL persist a `requestId` and the submission payload's fingerprint on
the session before it calls Ploeg, and SHALL replay the same `requestId` after
any lost response or restart. Unfold MUST NOT create a second submission for
the same session start. A replay that Ploeg answers with a conflict SHALL leave
the session blocked with the conflict shown, and MUST NOT be retried with a
new `requestId` automatically.

#### Scenario: Response lost before a restart

- **WHEN** Unfold sends a submission, the response is lost and the server
  restarts
- **THEN** on recovery Unfold replays the stored `requestId`, receives the same
  Work Item, and Ploeg holds exactly one Shift for it

#### Scenario: Ploeg unreachable at start

- **WHEN** Ploeg cannot be reached while a session starts
- **THEN** the session stays `queued` with a blocker naming Ploeg, no spend is
  recorded, and the next attempt reuses the stored `requestId`

### Requirement: Commands go to Ploeg and are idempotent

Cancel, try again, message, pause, resume and answers to permission requests
and questions SHALL be sent to Ploeg with a `commandId` that Unfold persists
before sending, and with the Shift the person saw as `expectedShiftId` where
Ploeg's contract accepts it. A replayed `commandId` MUST NOT cause a second
effect. Unfold SHALL reflect a command's effect only from Ploeg's answer or
event, never optimistically.

#### Scenario: Cancel a running session

- **WHEN** a person cancels a session whose Run is executing
- **THEN** Unfold sends Ploeg's cancel with a stored `commandId`, the session
  shows `cancelled` only after Ploeg reports the Work Item `withdrawn`, and no
  Run of it starts again without a new, explicit person action

#### Scenario: Stale view

- **WHEN** a person sends a command against a Shift that Ploeg has since closed
- **THEN** Ploeg answers `shift_changed`, Unfold shows that the work moved on,
  and nothing is retried automatically

### Requirement: Restart, retry and cancel keep paid work explicit

An Unfold restart SHALL NOT pause, cancel, resume or resubmit Ploeg work; it
SHALL resume reading Ploeg's events from the stored cursor. Try again SHALL be
Ploeg's requeue, offered only for a Work Item state Ploeg's requeue accepts,
and SHALL require a person's action. A cancel or pause MUST NOT become an
automatic retry, and Unfold MUST NOT add budget on its own.

#### Scenario: Unfold restarts while a Run executes

- **WHEN** the Unfold server restarts while Ploeg's worker executes a Run
- **THEN** the Run keeps executing in Ploeg, Unfold resumes the live view from
  its stored cursor without duplicate events, and no command is sent

#### Scenario: Work needs a person

- **WHEN** Ploeg reports the Work Item `needs_human` or `stale`
- **THEN** Unfold shows the reason and offers Try again; nothing is requeued
  until a person chooses it

### Requirement: Live view comes from Ploeg's events

Unfold SHALL build a session's live view from Ploeg's operator events, Run
records and Run transcript, read on the server with the operator credential
and streamed to the browser over Unfold's own SSE stream. The browser and the
editor MUST NOT talk to Ploeg directly. Event order and resumption SHALL follow
Ploeg's cursor.

#### Scenario: Browser reconnects

- **WHEN** a browser's SSE connection drops and reconnects
- **THEN** it receives the events after its last one, in order, without
  duplicates

### Requirement: The demo stays deterministic and labelled

In `demo` mode Unfold SHALL keep its demo runtime, MUST say on every session
that it is a demo, and MUST NOT invent model calls, Harness versions or spend.

#### Scenario: Demo session

- **WHEN** a person starts a session in `demo` mode
- **THEN** it completes from the fixture with zero model calls and zero spend,
  and its Harness is shown as `demo` with no version
