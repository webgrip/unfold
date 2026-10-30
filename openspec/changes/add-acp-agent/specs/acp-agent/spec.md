# ACP agent

## ADDED Requirements

### Requirement: The agent signs in with an editor credential

The `unfold` agent SHALL act only as the person whose editor credential
(Unfold ADR 0037) it holds, from `UNFOLD_TOKEN` or the file `login` wrote. It
MUST NOT introduce a credential type. `initialize` MUST list one
authentication method of type `terminal` that runs the agent with `login`.
Without a credential that Unfold accepts, `session/new` and `session/prompt`
MUST answer the ACP error `-32000` and change nothing. An Unfold that needs no
sign-in, such as the demo, MAY be used without one.

#### Scenario: No credential

- **WHEN** an editor calls `session/new` and Unfold answers 401
- **THEN** the agent answers `-32000` naming `unfold-acp-agent login`

#### Scenario: Signing in

- **WHEN** a person runs `unfold-acp-agent login`
- **THEN** the approval page names `unfold-acp-agent on <host>`, the terminal
  shows the code the page must show, and the credential is kept in a file only
  the user can read

### Requirement: An ACP session follows one Work Item

An ACP session SHALL follow at most one Work Item, or one of the person's
workbench sessions and the Work Item it runs. The person MUST be able to bind
it with `/work`, with the `work-item` configuration option, with
`_meta.unfold.workItem` at `session/new`, or with `UNFOLD_WORK_ITEM`. An
unbound session MUST answer a message with what waits for the person.

#### Scenario: A message before binding

- **WHEN** a person sends a message in a session that follows nothing
- **THEN** the agent lists the Work Items that wait for them and how to bind one

### Requirement: A message asks about the Work Item

In Ask mode, and with `/ask`, a message SHALL be an Unfold Ask about the bound
Work Item, answered first from the record, which spends nothing.

#### Scenario: A standing question

- **WHEN** a person asks why the bound Work Item stopped
- **THEN** the answer comes from the record and says it was free

### Requirement: A model Ask waits for the person's yes

When the record does not answer, the agent SHALL ask the person through
`session/request_permission`, naming the most the answer spends and what is
left of the Team's Ask Allowance, and MUST ask a model only when they choose
the allow option. A cancelled or refused prompt MUST spend nothing. The model
Ask MUST carry `X-Unfold-Confirmation` for the text the person agreed to.

#### Scenario: The person declines the spend

- **WHEN** the record does not answer and the person picks the deny option
- **THEN** no model is asked and the agent says nothing was spent

#### Scenario: The demo

- **WHEN** the agent talks to the demo
- **THEN** it says it is the demo, and every answer says no model was called
  and nothing was spent

### Requirement: A steer waits for the person and never starts a Run by itself

In Steer mode, and with `/steer`, a message SHALL go to the bound Work Item's
workbench session the person owns, after they allow it, or, when no such
session runs and the Work Item is queued or running, become a note for its next
Run after they allow it. Any other state MUST change nothing and say where to
act. Only the session's owner MAY steer it. `session/cancel` MUST end the
prompt turn only: it MUST NOT pause, cancel or retry the session or its Runs.

#### Scenario: Cancel while watching

- **WHEN** the editor cancels a prompt that streams the session feed
- **THEN** the prompt answers `cancelled` and the session keeps its state

### Requirement: The session feed streams back

While a prompt watches the bound workbench session, the agent SHALL translate
its feed into ACP updates: the agent's messages as `agent_message_chunk`, its
tool calls as `tool_call` then `tool_call_update`, and the start and end of each
Run and of the session as text. It MUST stop when the session finishes, pauses
or is interrupted.

#### Scenario: A demo session

- **WHEN** a person watches a demo workbench session
- **THEN** its messages and checks arrive as messages and tool calls, and the
  prompt ends when the session's agents are done

### Requirement: A harness permission reaches the owner as allow or deny

When the watched session waits on a tool permission from its Run's harness, the
agent SHALL relay it once to the session's owner through
`session/request_permission` with exactly two options, `allow_once` and
`reject_once`, saying that the agent wrote the request. It MUST answer Unfold
`once` or `reject`, never `always`.

#### Scenario: The owner allows a command

- **WHEN** the Run's harness asks to run `composer test` and the owner picks
  allow
- **THEN** Unfold receives `decision: once` with a confirmation

### Requirement: An unanswered permission keeps waiting

A permission prompt that is cancelled or left unanswered SHALL leave the
request waiting in Unfold. A person who does not own the session MUST NOT be
asked, and a question, rather than a permission, MUST be answered in Unfold.

#### Scenario: The person closes the dialog

- **WHEN** the editor answers the permission prompt with `cancelled`
- **THEN** Unfold receives no decision and the agent says the request still waits

### Requirement: A delegation from the editor never starts a Run

`/propose` SHALL draft the work and MUST NOT admit, queue or run anything. Until
Ploeg offers an admission that holds a Work Item as `proposed` for a person, the
agent MUST say that the proposal was not recorded and where to hand work over
instead.

#### Scenario: Proposing from PhpStorm

- **WHEN** a person sends `/propose Add VAT per line`
- **THEN** no Work Item changes state and the agent says nothing was admitted
