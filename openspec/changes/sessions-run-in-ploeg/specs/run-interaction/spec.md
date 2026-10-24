# Run interaction

## ADDED Requirements

### Requirement: Controls follow the Harness's interactive flag

For each Run, Unfold SHALL offer permission answers, question answers, pause
and resume only when Ploeg states the Run's Harness is interactive. Where it is
not, Unfold SHALL say so in plain words on the Run and in the Harness picker,
MUST NOT show those controls, and SHALL send a message as a next-Run note.

#### Scenario: Harness that is not interactive

- **WHEN** a session runs on a Harness Ploeg marks not interactive
- **THEN** the session shows "This harness runs without asking; messages reach
  the next Run", and shows no permission, pause or resume control

### Requirement: Permission requests and questions reach a person through Ploeg

When Ploeg reports that a Run waits on a permission request or a question,
Unfold SHALL show it on the session, in the Agents window and in the "needs
you" list, with the deadline Ploeg reports. An answer SHALL be sent to Ploeg
once with a persisted `commandId`. Unfold SHALL mark a request resolved only
when Ploeg reports it `answered`, `expired` or `withdrawn`.

#### Scenario: A person allows a tool call

- **WHEN** a Run asks to edit a file and a person picks one of the options the
  agent offered
- **THEN** Unfold sends the answer once, the Run continues, and the session
  history records who answered and when

#### Scenario: Nobody answers before the deadline

- **WHEN** the deadline Ploeg reported passes without an answer
- **THEN** Unfold shows the request `expired` with the outcome Ploeg reports
  (for a permission, the decision the Team's permission mode made, such as
  "allowed by the Team's mode"; for a question, refused), and a later answer is
  refused by Ploeg and shown as too late

#### Scenario: Two people answer

- **WHEN** two people answer the same request
- **THEN** Unfold shows the first answer Ploeg applied, and the second person
  sees Ploeg's conflict naming it

#### Scenario: Unfold restarts while a request waits

- **WHEN** the Unfold server restarts while a Run waits on a question
- **THEN** after restart the pending question is shown again from Ploeg's
  state, and an answer sent before the restart is not sent a second time

#### Scenario: The worker pod dies while a request waits

- **WHEN** Ploeg reports the request `expired` because the Run's Lease expired
- **THEN** Unfold shows it expired with the Run's recovery as Ploeg reports it,
  and offers no answer

### Requirement: "Approve tool use automatically" is sent as autoApprove

The New-session dialog SHALL keep the "Approve tool use automatically"
checkbox for a Harness Ploeg marks interactive. Unfold SHALL send its value as
`autoApprove` on `POST /api/v1/operator/work-items` and store it in the
submission fingerprint.

#### Scenario: Restart before Ploeg answered

- **WHEN** Unfold restarts after it persisted a submission with `autoApprove`
  checked and before Ploeg answered
- **THEN** recovery replays the same `requestId` with `autoApprove` checked

### Requirement: With autoApprove checked, only permissions skip the person

When `autoApprove` is checked, Unfold SHALL show no permission request for the
session's Runs, because Ploeg decides each one at once by the Team's
permission mode, and SHALL still show questions and offer messages and pause.

#### Scenario: Checked

- **WHEN** a person starts a session with the checkbox checked and the Run asks
  to edit a file, then asks a question
- **THEN** no permission request appears, the edit is decided by the Team's
  permission mode, the question appears for the person, and pause and
  messages stay available

### Requirement: With autoApprove unchecked, every permission request is shown

When `autoApprove` is unchecked, Unfold SHALL show every permission request
Ploeg relays, and when one expires SHALL show the decision the Team's
permission mode made for it.

#### Scenario: Unchecked and unanswered

- **WHEN** a person starts a session with the checkbox unchecked, a permission
  request appears and its deadline passes without an answer
- **THEN** Unfold shows the request expired and the decision the Team's
  permission mode made for it

### Requirement: Automatic tool approval never widens Ploeg's policy

Whether `autoApprove` is set or not, Ploeg's Team permission mode and a
read-only Role's restrictions SHALL always apply, and Unfold MUST NOT present
the checkbox as able to widen them. For a Harness that is not interactive,
Unfold SHALL name the Team's permission mode instead of offering the checkbox.

#### Scenario: Read-only Role

- **WHEN** a session reaches a reviewing Role
- **THEN** the Role still cannot edit files or run shell commands, and Unfold
  shows the Role's mode as read-only

#### Scenario: Harness that is not interactive

- **WHEN** a person picks a Harness Ploeg marks not interactive
- **THEN** the dialog shows the Team's permission mode in place of the
  checkbox and sends no `autoApprove`

### Requirement: Mid-Run messages say where they landed

A message a person sends to a running session SHALL be sent to Ploeg once.
Unfold SHALL show, from Ploeg's answer or event, whether it was `delivered` to
the running Run or `carried_over` to the next Run as a note. A message to a
Harness that is not interactive SHALL be labelled as a next-Run note before it
is sent.

#### Scenario: Message delivered at a turn boundary

- **WHEN** a person messages a Run on an interactive Harness
- **THEN** Unfold shows "delivered to the running Run" after Ploeg reports
  delivery, or "kept for the next Run" if Ploeg reports it carried over

### Requirement: Pause and resume are explicit and never become a retry

Pause and resume SHALL be Ploeg commands. Unfold SHALL show a session as
paused only after Ploeg confirms the pause, and resumed only after Ploeg
reports it resumed. A pause SHALL survive restarts of Unfold and ploegd. A
pause MUST NOT be turned into a retry or a new Run by Unfold. When Ploeg ends a
paused Run `stuck` with `paused_too_long`, or `needs_human` with
`paused_run_lost`, Unfold SHALL show the reason and offer Try again, and MUST
NOT requeue on its own.

#### Scenario: Pause during a Run

- **WHEN** a person pauses a session whose Run is executing on an interactive
  Harness
- **THEN** Unfold sends one pause command, shows "pausing" until Ploeg confirms
  the agent stopped its turn, and then shows the pause bound Ploeg reports

#### Scenario: Unfold restarts while paused

- **WHEN** the Unfold server restarts while a session is paused
- **THEN** the session shows paused from Ploeg's state and Unfold sends no
  command

#### Scenario: Pod dies while paused

- **WHEN** Ploeg reports a paused Run ended with `paused_run_lost`
- **THEN** the session shows that the pause was lost and offers Try again, and
  no Run starts until a person chooses it

#### Scenario: Cancel while paused

- **WHEN** a person cancels a paused session
- **THEN** Unfold sends Ploeg's cancel, and the Work Item ends `withdrawn`
  without resuming first

### Requirement: Live activity is bounded and redacted at the source

Unfold SHALL show the Run activity Ploeg publishes (transcript entries,
interaction requests and resolutions, state changes) as Ploeg redacts and
bounds it, and MUST NOT request or store native Harness session state or
credentials.

#### Scenario: Activity with a secret pattern

- **WHEN** Ploeg publishes an activity line it has redacted
- **THEN** Unfold shows the redacted text and has no unredacted copy
