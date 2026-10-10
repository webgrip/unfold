# RFC-0005: Complete Agents-window support

> Status: **Partly implemented** 2026-10-10, in `unfold-v0.4.0-rc.58` · Date: 2026-10-10 · Owner decision: "I want complete support." · Research: [VS Code 1.141 fit](../../apps/unfold/docs/research/2026-10-08-vscode-1-141-fit.md), [AHP sign-in spike](../../apps/unfold/docs/research/2026-10-10-ahp-sign-in-spike.md) · Decision record: [Unfold ADR 0012](../../apps/unfold/docs/adrs/0012-agent-host-protocol-host.md)
>
> **TL;DR.** A person can follow, steer, recover and review every Unfold session from VS Code's Agents window without the Unfold extension and without the browser. Phase 0 shipped with this RFC: a message no crew reads becomes a choice, a running session acknowledges every message, and a stopped session ends with its next steps. Twelve parallel sessions built most of Phases 1 to 3 on the same day; each item below says what landed, with its commit. The owner decided declining, terminals and automations. Agent Merge and the "Run again with this message" semantics are still open.

Each item opens with its **State**; what follows the state is the proposal as it was written, kept for its bundle evidence. Where the build differs from the proposal, the state says so. After the parallel work, one reconciliation pass checked the overlapping pieces against the bundle and left one rule each ([ADR 0012](../../apps/unfold/docs/adrs/0012-agent-host-protocol-host.md)). Wire shapes marked **(bundle)** were read in the VS Code 1.141.0 stable bundle (`/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/sessions/sessions.desktop.main.js`) on 2026-10-10, with the byte offset of the code. No desktop VS Code has rendered any of it yet; that is [VIK-1922](https://vikunja.webgrip.dev/tasks/1922).

## Goal

"Complete support" means four things, each checked in a desktop Agents window against production:

1. **Follow.** Every Role, tool call, file edit and verdict is visible as it happens, in VS Code's own parts.
2. **Steer.** Every message lands somewhere, says where, and says when a Role read it. Nothing typed is ever silently dropped or rejected into an empty turn.
3. **Recover.** Every stopped, failed or finished session offers its real next steps in the chat, and nothing runs until the person picks one.
4. **Review.** The candidate can be accepted, rejected or sent back with comments from VS Code's changes view, and that feeds Ploeg's review round.

The rules stay: managed execution never falls back to standalone, nothing auto-retries, deliveries go through Ploeg, and the host adds no runtime dependency ([ADR 0036](../../apps/unfold/docs/adrs/0036-the-agent-host-speaks-websocket-through-ws.md)).

## Current state

| Area | State on `development` | Evidence |
| --- | --- | --- |
| Protocol | AHP 1.0.0 and 0.9.0, the highest both share per client; VS Code main gets 1.0.0, 1.141 keeps 0.9.0 | [`c93e41b4`](https://forgejo.webgrip.dev/webgrip/unfold/commit/c93e41b426c02750a93d1a05cbf4311a5fff8b00), [`versions.ts`](../../apps/unfold/src/ahp/versions.ts) |
| Sessions, chats, URIs, read and archive marks | Built; both URI spellings accepted | 1.141 dossier, follow-up table |
| Turns and parts | `markdown`, `systemNotification`, tool calls with input, output and exit code, input requests, `chat/usage` with tokens only | `host.ts` `reduce`, [`f4d21869`](https://forgejo.webgrip.dev/webgrip/unfold/commit/f4d218695923f8bcad2c19bc665cfc9e023c1b46) |
| Messages into a running session | Instruction for the next Run; "Queued for the <Role>'s next step", then "Picked up by <Role> at HH:MM UTC" | Phase 0, [`cab2b260`](https://forgejo.webgrip.dev/webgrip/unfold/commit/cab2b260651ca6069f864f2ce9c4dea35e250b1a) |
| Messages no crew reads | A choice: run again, deliver approved work first, or cancel; a failed session included | Phase 0, [`cab2b260`](https://forgejo.webgrip.dev/webgrip/unfold/commit/cab2b260651ca6069f864f2ce9c4dea35e250b1a) |
| Stopped or failed sessions | A failed session the Run-again path accepts ends with a resumable error and **Try Again**; an interrupted session, or a failed one without Try Again, ends with a "What next?" choice | [`cab2b260`](https://forgejo.webgrip.dev/webgrip/unfold/commit/cab2b260651ca6069f864f2ce9c4dea35e250b1a), [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9) |
| Candidate | A `session` changeset; **Accept**, **Request changes…** and **Reject…** as operations; per-file comments as annotations | [`b3d6c196`](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3d6c196f15ceab1c1f99f1159ed726b411fca0d), [`review.ts`](../../apps/unfold/src/ahp/review.ts) |
| `serverSeq` | Reserved in blocks in the store, kept with remembered and active clients across a restart; an ended session's projection is evicted after ten idle minutes | [`51a55029`](https://forgejo.webgrip.dev/webgrip/unfold/commit/51a5502970fcd03965ec828b3439171b4bab6d85), [`continuity.ts`](../../apps/unfold/src/ahp/continuity.ts) ([VIK-1646](https://vikunja.webgrip.dev/tasks/1646)) |
| Automations | A read-only catalogue of Ploeg's tracker routes; create, schedules, runs and cancellation refused | [`cd32a431`](https://forgejo.webgrip.dev/webgrip/unfold/commit/cd32a431f46c4dc1a7c6dfae77d29e23d13e4ada), [`automations.ts`](../../apps/unfold/src/ahp/automations.ts), ADR 0012 |
| Needs-you notifications | The extension notifies the owner per state change, inside the VS Code window only; a crew question sets the needs-input status bits, an open host choice does not | [`4cdd2686`](https://forgejo.webgrip.dev/webgrip/unfold/commit/4cdd268647c7c08f8ad08fe6b93417b8b6f03925) |
| Questions | Text, single- and multi-select; yes/no as a Yes/No single-select; a decline is a recorded answer the crew receives | [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9), [`questions.ts`](../../apps/unfold/src/ahp/questions.ts) |
| Roles | Each Run is a subagent tool call with a read-only chat of its own | [`f4d21869`](https://forgejo.webgrip.dev/webgrip/unfold/commit/f4d218695923f8bcad2c19bc665cfc9e023c1b46), [`runs.ts`](../../apps/unfold/src/ahp/runs.ts) |
| Terminals | Each crew command is a read-only terminal; every input is refused | [`1cf1d92d`](https://forgejo.webgrip.dev/webgrip/unfold/commit/1cf1d92da5b4a7340b4c39c7b88519b6ea475c00), [`terminals.ts`](../../apps/unfold/src/ahp/terminals.ts) |
| Session config | Crew, budget, placement and approvals in VS Code's own pickers; the model reads `Ploeg crew · <team>` | [`49f59ebe`](https://forgejo.webgrip.dev/webgrip/unfold/commit/49f59ebe2f17b98e49adccd2341fc93cd2620802), [`5542eff8`](https://forgejo.webgrip.dev/webgrip/unfold/commit/5542eff8d240ae4a89cf02f28a720a97cf7ce47a), [`session-config.ts`](../../apps/unfold/src/ahp/session-config.ts) |
| MCP and plugins | The repository's gateway MCP server is listed read-only; client plugins are refused | [`c3c6c07e`](https://forgejo.webgrip.dev/webgrip/unfold/commit/c3c6c07ea79c5387eaaea8d0a3b0858a32739703), [`customizations.ts`](../../apps/unfold/src/ahp/customizations.ts) |
| Sign-in | A pasted token | sign-in spike |

### The incident that started this

On production rc.54, typing "Test" into the stopped Ploeg session `059675b9` (Work Item 184) gave an empty turn. The host refused the message with `rejectionReason` (409 `session_stranded`), and VS Code 1.141 renders a rejected turn as an empty one. rc.55 added a reply and a composer block through `_meta["vscode.chatInputState"]`, which still left the person nowhere to go. The fixture [`session-059675b9.json`](../../apps/unfold/test/fixtures/session-059675b9.json) reproduces it.

## Phase 0: every message lands (shipped with this RFC)

| Item | What it does | How VS Code shows it | Acceptance (met) |
| --- | --- | --- | --- |
| 0.1 A message no crew reads becomes a choice | The turn is accepted with the client's turn id and origin. A Markdown part says why no crew reads it. An input request asks one single-select question: **Run again and start**, **Run again with this message**, **Deliver the approved work first** (only when the recovery answer lists delivery) and **Cancel**. Answers call `run-again`, `start` and `deliver` under the same owner checks; nothing starts without the pick. The message becomes the new session's first instruction, which keeps the brief and passes the 20-character brief rule. The new session is announced with `root/sessionAdded` | `chat/turnStarted` echo, `chat/responsePart` (`markdown`), `chat/inputRequested` (`questions[0].kind: 'single-select'`, `allowFreeformInput: false`), rendered as a question carousel **(bundle 10539425)**; the answer arrives as `chat/inputCompleted` with `answers['0'].value = {kind: 'selected', value: <option id>}` | `test/ahp-progress.test.ts`, `test/execution.test.ts` |
| 0.2 Running sessions acknowledge every message | "Queued for the <Role>'s next step", then "Picked up by <Role> at HH:MM UTC" when that Run starts | `chat/responsePart` (`systemNotification`) in the message's own turn | `test/ahp-progress.test.ts`, `test/ahp-actions.test.ts` |
| 0.3 A stopped session ends with its next steps | An interrupted or failed session gets one host turn, "What next?", with the recovery answer's available steps and links to the pull request and the session page. Offered once per stop | A `systemNotification`-origin turn, then the same carousel | `test/ahp-progress.test.ts`, `test/execution.test.ts` |

The choices are durable session events (`choice.offered`, `choice.answered`, `choice.reported`), survive a restart, and cannot be answered twice. The composer block is gone, and only a completed chat is `read-only`. Option descriptions are written into the question's message, because 1.141 maps options to `{id, label, value}` and drops `description` **(bundle 10539425)**.

Since Try Again landed (1.3), a failed session that offers it gets no "What next?" turn; 0.3 applies to an interrupted session and to a failed one without Try Again. An interrupted session's outcome then says only why it stopped, so its next steps are listed once, in the choice.

Known limits of Phase 0: an open choice does not set the session's needs-input status bits, so it raises no OS notification (item 3.3). A completed session still ends with links rather than a choice (item 2.4).

## Phase 1: protocol foundations

### 1.1 Negotiate AHP 1.x ([VIK-1925](https://vikunja.webgrip.dev/tasks/1925)) · M

**State: built** in [`c93e41b4`](https://forgejo.webgrip.dev/webgrip/unfold/commit/c93e41b426c02750a93d1a05cbf4311a5fff8b00). The 22 upstream vectors pass and 1.141 keeps 0.9.0. The SDK end-to-end run ([VIK-1926](https://vikunja.webgrip.dev/tasks/1926)) has not been done.

Accept `>=1.0.0 <2.0.0` beside `>=0.9.0 <0.10.0` and return the exact offered string, per the [versioning rule](https://microsoft.github.io/agent-host-protocol/specification/versioning). 1.x obliges the host to publish `SessionSummary.chats`, `defaultChat`, the chat status bits and `SessionChatSummary.interactivity`. All except the last are partly there already.

Acceptance:

- the 22 upstream negotiation vectors pass;
- Microsoft's `@microsoft/agent-host-protocol` multi-host layer, which offers only `1.0.0`, connects and passes the SDK end-to-end run ([VIK-1926](https://vikunja.webgrip.dev/tasks/1926));
- 1.141 still negotiates 0.9.0.

### 1.2 Persist `serverSeq` and evict projections ([VIK-1646](https://vikunja.webgrip.dev/tasks/1646)) · done

Landed on 2026-10-10 in `51a55029`, alongside this RFC: the sequence is reserved in blocks and never moves backwards, remembered and active clients survive a restart, and ended sessions' projections are evicted and rebuilt from events. Phase 0's choices are session events, so an evicted projection rebuilds them. Remaining acceptance: the desktop pass (4.1) reconnects after a production restart.

### 1.3 Errors map to Run again ("Try Again") ([VIK-1665](https://vikunja.webgrip.dev/tasks/1665) remainder) · S

**State: built differently** in [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9). Only a failed session the Run-again path accepts (not one imported from a tracker) gets `resumable: true`, and Try Again creates the new queued session directly, without a choice; nothing starts until the person starts it. An interrupted or stranded session has no Try Again and gets the "What next?" choice instead. Reconciled on 2026-10-10: a failed session with Try Again gets no "What next?" turn, so the button stays the last thing in the chat, and a message typed into it becomes the message choice.

**(bundle 20904414)** VS Code shows **Try Again**, or **Keep Going** for `errorType: 'executionInterrupted'`, only when the last error part has `resumable: true`. Clicking it dispatches `chat/turnResume` with the same `turnId`; a refusal shows "This failed request could not be resumed".

The host marks a failed or interrupted turn resumable only when the recovery answer lists `resume` or `run_again` as available. It answers `chat/turnResume` by offering the Phase 0 choice in that turn. It never resumes directly, because a click on Try Again is not a choice between a new Ploeg authorization and the old one.

Acceptance:

- a stranded session's error part carries `resumable: true`, and `chat/turnResume` yields the choice, not a run;
- a session without a recovery path has no button.

### 1.4 Yes/no questions and spend · S

**State: built** in [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9), then corrected. That commit sent yes/no as the `boolean` kind, which 1.141 shows as **True** and **False** (the bundle's `chat.inputRequest.boolean.true` and `.false` messages). The reconciliation sends a Yes/No single-select as proposed below, and the crew still receives its own label. Spend is a `systemNotification` at each threshold of 50, 80 and 100 % and at a Run's end; a Run's line is left out when it repeats the figure the chat last gave, so a demo says it once.

- **Yes/no.** **(bundle 10539427)** A `boolean` question renders as **True** and **False**, not Yes and No. A crew's yes/no question is therefore sent as a single-select question with options `Yes` and `No`, and the answer is mapped back to a boolean.
- **Spend.** **(bundle 10547340)** The usage footer reads `inputTokens`, `outputTokens` and `_meta.cost`, and labels it "{model} • N credits" or "{model} · {pricing}". Credits are a Copilot unit, so Unfold's spend goes into a `systemNotification` at each Run's end, "Reviewer · US$ 0,03 observed · of US$ 0,25", and `_meta.cost` stays unset.

Acceptance:

- a yes/no question from the demo crew round-trips;
- every finished Run's turn carries one spend line in the shared money format.

### 1.5 Declining questions ([VIK-1921](https://vikunja.webgrip.dev/tasks/1921)) · S · **Decided**

**State: decided and built** in [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9). A decline continues the crew with the decline recorded (option A): every question is answered with "Declined by <name>: no answer will be given…", and `question.declined` is a session event.

VS Code lets a person skip a question (`allowSkip` is always true; skipping sends `response: 'cancel'`), and the host refuses it today.

**Option A (recommended).** Skipping answers the question with "The person declined to answer". The crew continues and the decline is recorded as evidence.

- Trade-off: a crew may guess where a person meant "stop".

**Option B.** Skipping pauses the session.

- Trade-off: a stray click stops paid work, and resuming needs another decision.

Acceptance: the engine and API take a decline; the host maps `cancel` to it; the decline is in the transcript.

## Phase 2: the crew, natively

### 2.1 Roles as AHP subagents · L

**State: built** in [`f4d21869`](https://forgejo.webgrip.dev/webgrip/unfold/commit/f4d218695923f8bcad2c19bc665cfc9e023c1b46). Each Run is an `unfold_run` tool call with `_meta.toolKind: 'subagent'` and a read-only chat `ahp-chat://subagent/…` in the session's catalogue. The Run's text also stays in the session's chat, because 1.141 shows a subagent's tool calls but not its text, and the session's chat ends each Run with one "**Role** finished" summary. A live `progressMessage` is not sent.

**(bundle 10546282, 20952300)** A tool call is a subagent when `_meta.toolKind` is `subagent` or its name is `task`. It renders with `_meta.subagentDescription`, `_meta.subagentAgentName` and a live `_meta.progressMessage`. Its nested transcript is a chat in the session's `chats[]` with `origin: {kind: 'tool', chat: <parent chat>, toolCallId}`, whose status bits decide whether it shows as live.

No provider gate was found. `chat/backgroundWorkSet` stores `subagent` entries, but 1.141 renders only `shell` entries **(bundle 12378114)**, so background work is not the vehicle.

Each Run becomes a `subagent` tool call in the turn and a child chat holding that Role's parts. The person's chat keeps instructions, choices and outcomes. A child chat is `read-only`, so a message never goes to a Role directly; Ploeg steers between Runs ([ADR 0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)). This needs `multipleChats` advertised again, which `78d4d6fd` stopped doing.

Acceptance:

- the 059675b9 fixture renders Implementer and Reviewer as two nested subagents, the Reviewer marked cut off;
- a live demo shows the working Role's progress line update;
- the session list counts one session, not three.

### 2.2 Tool calls with file edits and diffs · M

**State: partly built** in [`f4d21869`](https://forgejo.webgrip.dev/webgrip/unfold/commit/f4d218695923f8bcad2c19bc665cfc9e023c1b46). Tool calls carry their input, output and exit code; a write Run's recorded native file diff and the captured candidate become `fileEdit` content, without a Ploeg harness change. Per-edit references while a Run works, edit approvals and `_meta.toolKind` for reads and searches are not built.

**(bundle 10533678, 10551741)** Tool content `{type: 'fileEdit', before?: {uri, content: {uri}}, after?: {uri, content: {uri}}, diff?: {added, removed}}` becomes an inline edit part, and the tool call itself is hidden. Only `after` means create, only `before` means delete, different URIs mean rename. A `pending-confirmation` call with `edits.items` asks for approval with the modified files.

The host already serves file contents through `unfold-candidate:` and `unfold-diff:`. Runtime events need a per-edit before/after reference, which is Ploeg harness work (`apps/ploeg/pkg/harness`), landed in `ploeg-hq/ploeg` first ([ADR-0019](../adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)). Tool names stay Unfold's own; `_meta.toolKind` (`read`, `search`, `terminal`) replaces VS Code's name-based guess.

Acceptance:

- the demo's writer edits show as edit parts with `+n −m`, and opening one shows the diff;
- a crew's file read shows as a read, not as Copilot's `view`.

### 2.3 A read-only live terminal stream · L · **Decided**

**State: decided and built** in [`1cf1d92d`](https://forgejo.webgrip.dev/webgrip/unfold/commit/1cf1d92da5b4a7340b4c39c7b88519b6ea475c00). The owner chose read-only. Each crew command is an `ahp-terminal:` channel projected from the durable tool events with the store's redaction; input, resize, clear, rename, create and dispose are refused. ADR 0012 records it.

ADR 0012 declined terminals because the protocol lets a host claim a terminal and receive input. **(bundle 15516537, 15520994)** VS Code claims a terminal it creates and sends typing as `terminal/input`. No client-side read-only gate was found, so read-only can only be enforced by the host.

The proposal: a terminal tool call (`_meta.toolKind: 'terminal'`, content `{type: 'terminal', resource}`) per sandbox command. The host streams `terminal/data` from the Run's command events, refuses every `terminal/input`, `resized` and `claimed` action, and never sets `terminalCommandPrefix`. The bytes are the sandbox's recorded output, after the same redaction as the transcript.

The owner decides: **read-only only** (recommended), or keep declining. An interactive terminal is out of scope, because the candidate contract forbids editing the sandbox from outside.

Acceptance:

- a demo command streams live;
- every input action is refused and nothing reaches the sandbox;
- ADR 0012 records the amended decision.

### 2.4 Closing choices for finished sessions · S

**State: not built as a choice.** [`b3d6c196`](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3d6c196f15ceab1c1f99f1159ed726b411fca0d) puts **Request changes…** and **Reject…** beside **Accept** as changeset operations instead, each asking for its message in the chat. A completed session still ends with its outcome and links.

A completed session gets a "What next?" choice too:

- **Accept**: the existing review route;
- **Request changes**: item 3.1;
- **Open pull request**: a reply with the link, because a carousel option carries only an id and a label and cannot open a URL;
- **Leave it**.

A choice holds an active turn, so this is offered only while review is open, never after a decision.

Acceptance: the choice disappears once the review is decided anywhere.

## Phase 3: review, configuration and reach

### 3.1 Reject and request changes, with per-file comments · L

**State: built in Unfold** in [`b3d6c196`](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3d6c196f15ceab1c1f99f1159ed726b411fca0d). Reject records the rejection with its note; Request changes records it and creates the next session, unstarted, with the message and the candidate's comments as its instruction. It does not yet feed a Ploeg review round, which waits on Ploeg's review-round contract. Not yet exercised in a desktop VS Code.

**(bundle 18293740, 18296630, 18295200)**

- Declaring `capabilities.review` turns on per-file "reviewed" marks (`changeset/filesReviewChanged`).
- Operations take `confirmation` and `scopes` `changeset | resource | range`.
- Reject and request-changes have to be host-defined operations; VS Code has none of its own.
- Per-file comments live in an annotations channel `<session uri>/annotations` with `annotations/set` and `annotations/removed` **(bundle 17911755, 18403892)**. They are offered for providers named `local-agent-host` or `agenthost-*`, which includes remote hosts by inference.

Add **Reject** and **Request changes** operations. Request changes collects the session's annotations into a review note and records `changes_requested` through the review route, which Ploeg turns into a review round. That leans on Ploeg's review-round contract, which lands in `ploeg-hq/ploeg` first.

Acceptance:

- comments on two files and **Request changes** produce one Ploeg review round whose brief quotes both comments with file and line;
- **Reject** records the rejection with its note.

### 3.2 Candidate accept as Agent Merge · M · **Decision, open**

**State: built against the recommendation** in [`b3d6c196`](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3d6c196f15ceab1c1f99f1159ed726b411fca0d). Enabling Agent Merge accepts the candidate through the review path; merging itself stays on the forge. That is closer to option (b) than to the recommended (a). The owner still decides; until then the built behaviour stands.

**(bundle 21267149, 18392306)**

- `sessions.agentHost.agentMerge.enable` needs `chat.agentMerge.enabled` and an open pull request, and sends `session/configChanged` with `config.agentMerge`.
- `sessions.agentHost.showBranchChanges` appears only in a `branch` config picker, on the current branch.
- An `agent-merge` changeset kind is rendered **(bundle 12345848)**.

Mapping Accept to Agent Merge lets VS Code's own merge button merge the pull request through Ploeg. ADR-0010 keeps merging a person's act. Agent Merge in VS Code means "the agent merges", so the owner decides:

- **(a) recommended:** expose only `showBranchChanges` through a read-only `branch` property, so VS Code shows the branch diff, and keep Accept as the operation;
- **(b)** honour `agentMerge` as "merge through Ploeg when checks pass".

Acceptance for (a): the branch picker shows the session branch and **Show Changes** opens its diff.

### 3.3 Crew, budget and placement in the new-session picker; the model label; OS notifications · M

**State: picker and model label built** in [`49f59ebe`](https://forgejo.webgrip.dev/webgrip/unfold/commit/49f59ebe2f17b98e49adccd2341fc93cd2620802) and [`5542eff8`](https://forgejo.webgrip.dev/webgrip/unfold/commit/5542eff8d240ae4a89cf02f28a720a97cf7ce47a). Notifications: a crew question sets the needs-input bits; an open host choice does not, and the extension's notifications ([`4cdd2686`](https://forgejo.webgrip.dev/webgrip/unfold/commit/4cdd268647c7c08f8ad08fe6b93417b8b6f03925)) show inside the window only. `usage.model` is not sent.

The picker and the model label were built on 2026-10-10 and recorded in ADR 0012: crew, budget and placement carry `enumLabels`, approvals use `approvalMode`, a draft accepts `session/configChanged`, the composer's model is the crew, and user turns carry no `message.model`. `usage.model` and the notification bits remain.

**Picker.** **(bundle 9818265, 9835439)** The generic picker shows a property when it is `boolean`, or a `string` with `enum` or `enumDynamic`, and the session is new or the property is `sessionMutable`. Labels come from `enumLabels`; Unfold sends only `enumDescriptions`, so the picker shows raw ids. `budgetUsd` is a number and never shows.

- Send `enumLabels`.
- Make the budget a string enum of the configured steps (`1`, `2`, `5`, … up to `maxBudgetUsd`), labelled in the shared money format.

**Model label.** **(bundle 20974200)** The label under a response resolves `turn.usage.model` first and then the user turn's `message.model.id`, printing "{name} ({rawId})". The host stamps every user turn with `config.models[0]`, whatever the Role used. Stop sending `message.model`. Send `usage.model` only when the gateway reported which model answered, and use an id from `agents[].models`.

**OS notifications.** **(bundle 18859900, 18284529)** VS Code's Agents window notifies on a status change to needs-input (bits 8|16), error (2), or complete (after 1.5 s), unless the window has focus or the chat is open. The extension's own notifications (`4cdd2686`) show inside the window only and need the extension. Set bits 8|16 while a crew question or a Phase 0 choice is open, so "Needs you" reaches the desktop without it. The server-side notifications of [RFC-0004](rfc-0004-unfold-on-phones-and-desktops.md) are the path when VS Code is closed.

Acceptance:

- the picker shows Crew, Budget and Placement with labels;
- a turn's label names the model the gateway reported, or nothing;
- an unfocused window raises one notification per open choice.

### 3.4 Automations · decided and done

The owner asked for automations; built read-only on 2026-10-10 in [`cd32a431`](https://forgejo.webgrip.dev/webgrip/unfold/commit/cd32a431f46c4dc1a7c6dfae77d29e23d13e4ada), recorded in ADR 0012. **(bundle 18605803)** VS Code enables automations only with `initializeResult.automations` and `_meta["vscode.autonomousAutomations"] === true`. The host advertises the baseline catalogue without `create`, schedules or run cancellation, and lists one read-only entry per tracker route Ploeg runs; every change and manual run is refused, because a scheduled run would be budgeted work Ploeg never authorized. Nothing remains here but the desktop check in 4.1.

### 3.5 MCP and plugins for sessions · M

**State: built, stricter than proposed** in [`c3c6c07e`](https://forgejo.webgrip.dev/webgrip/unfold/commit/c3c6c07ea79c5387eaaea8d0a3b0858a32739703). A session lists its repository's gateway MCP server read-only. A `root/configChanged` that lists plugins is refused rather than accepted and echoed, and plugins a client publishes are listed with a load error.

**(bundle 21005299, 7675956)**

- `remoteAgentHost.addPlugin` writes `root/configChanged` with `config.customizations: [{uri, displayName}]` and reads them back from `rootState.config.values.customizations`.
- A client also sends its customizations in `session/activeClientSet`.

Unfold's crews run in Ploeg's sandboxes, not on the person's machine, so a client plugin cannot run there. The host accepts and echoes the root config, so VS Code does not error, but lists no customizations as applied.

[ADR-0011](../adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)'s `ploeg-mcp` is the supported way to bring MCP: a crew's repository declares its servers, Ploeg runs them. The credential caveat of the 1.141 dossier, recommendation 6, applies.

Acceptance: **Add Plugin** against Unfold shows "not applied to Unfold crews" and changes nothing.

### 3.6 Proper sign-in · S now, M later

**(bundle 7705350, 7710535)** For an agent's `protectedResources`, VS Code resolves only an authentication provider already registered for that authorization server. Its interactive fallback is GitHub Copilot setup. Dynamic client registration exists only for MCP servers. This confirms the [sign-in spike](../../apps/unfold/docs/research/2026-10-10-ahp-sign-in-spike.md).

- **Now:** draft the upstream issue for `microsoft/vscode`, "Remote agent host protectedResources: discover and register a non-GitHub authorization server as MCP does", with the code paths above. Ryan files it.
- **Later:** when VS Code ships it, declare Authentik as the protected resource's authorization server and retire pasted tokens.

Acceptance: the issue draft sits in `apps/unfold/docs/research/`; a re-evaluation trigger is on the dossier.

## Phase 4: acceptance

### 4.1 The desktop acceptance pass ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)) · M

Run against production in VS Code 1.141 and the then-current Stable, with screenshots:

- attach;
- create a session;
- send a message while it runs and see the acknowledgement and the pickup;
- answer a crew question;
- stop it;
- type into the stopped session and pick each option;
- accept a candidate;
- reconnect after a server restart.

It is the gate for calling an item done; every **(bundle)** claim above is unverified until then. Repeat it for each phase.

## Sizes and order

| # | Item | Size | State |
| --- | --- | --- | --- |
| 0.1–0.3 | Every message lands | done | [`cab2b260`](https://forgejo.webgrip.dev/webgrip/unfold/commit/cab2b260651ca6069f864f2ce9c4dea35e250b1a) |
| 1.1 | AHP 1.x | M | built, [`c93e41b4`](https://forgejo.webgrip.dev/webgrip/unfold/commit/c93e41b426c02750a93d1a05cbf4311a5fff8b00); SDK run open |
| 1.2 | `serverSeq` and eviction | done | [`51a55029`](https://forgejo.webgrip.dev/webgrip/unfold/commit/51a5502970fcd03965ec828b3439171b4bab6d85) |
| 1.3 | Try Again | S | built differently, [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9) |
| 1.4 | Yes/no and spend | S | built, [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9), yes/no corrected |
| 1.5 | Declining | S | decided and built, [`7612b486`](https://forgejo.webgrip.dev/webgrip/unfold/commit/7612b486ed2c159afa993f89c495d937b7731eb9) |
| 2.1 | Roles as subagents | L | built, [`f4d21869`](https://forgejo.webgrip.dev/webgrip/unfold/commit/f4d218695923f8bcad2c19bc665cfc9e023c1b46) |
| 2.2 | Edits and diffs | M | partly built, [`f4d21869`](https://forgejo.webgrip.dev/webgrip/unfold/commit/f4d218695923f8bcad2c19bc665cfc9e023c1b46) |
| 2.3 | Read-only terminal | L | decided and built, [`1cf1d92d`](https://forgejo.webgrip.dev/webgrip/unfold/commit/1cf1d92da5b4a7340b4c39c7b88519b6ea475c00) |
| 2.4 | Closing choice for review | S | replaced by review operations, [`b3d6c196`](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3d6c196f15ceab1c1f99f1159ed726b411fca0d) |
| 3.1 | Reject, request changes, comments | L | built in Unfold, [`b3d6c196`](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3d6c196f15ceab1c1f99f1159ed726b411fca0d); Ploeg review round open |
| 3.2 | Agent Merge | M | **Decision** open; built as accept, [`b3d6c196`](https://forgejo.webgrip.dev/webgrip/unfold/commit/b3d6c196f15ceab1c1f99f1159ed726b411fca0d) |
| 3.3 | Picker, model label, notifications | M | picker and label built, [`49f59ebe`](https://forgejo.webgrip.dev/webgrip/unfold/commit/49f59ebe2f17b98e49adccd2341fc93cd2620802), [`5542eff8`](https://forgejo.webgrip.dev/webgrip/unfold/commit/5542eff8d240ae4a89cf02f28a720a97cf7ce47a); choice bits open |
| 3.4 | Automations | done | [`cd32a431`](https://forgejo.webgrip.dev/webgrip/unfold/commit/cd32a431f46c4dc1a7c6dfae77d29e23d13e4ada) |
| 3.5 | Plugins | M | built, [`c3c6c07e`](https://forgejo.webgrip.dev/webgrip/unfold/commit/c3c6c07ea79c5387eaaea8d0a3b0858a32739703) |
| 3.6 | Sign-in | S, then M | open; upstream VS Code |
| 4.1 | Desktop pass | M | open ([VIK-1922](https://vikunja.webgrip.dev/tasks/1922)) |

S is up to a day, M up to three days, L about a week, each including tests, docs and one desktop check.

## Decisions for the owner

Taken on 2026-10-10:

1. **Declining a question (1.5).** A decline continues the crew with the decline recorded. Built.
2. **Terminals (2.3).** Read-only, never interactive. Built.
3. **Automations (3.4).** Yes; built as a read-only catalogue, because a scheduled run would be work Ploeg never authorized.

Still open:

1. **Agent Merge (3.2).** Today enabling Agent Merge accepts the candidate through the review path. This RFC recommended showing branch changes only and keeping merging a person's act. Keep what was built, or narrow it to branch changes.
2. **"Run again with this message" (Phase 0).** It keeps the original brief and gives the message to the new crew as its first instruction, rather than making the message the brief. A brief under 20 characters or 4 words is refused by the engine, and "Test" or "Make it funnier" alone would lose the original brief. Confirm, or make the message the brief when it passes the brief rule.
