# RFC-0010: Agents on your own machine, started from Unfold

> Status: **Proposed** 2026-10-24, design only; nothing in this RFC is built; owner decisions recorded 2026-10-24 · Owner request (2026-10-24): "take on the actual agents on your laptop whenever you want, maybe to give it more rights" · Builds on: [Unfold ADR 0047](../../apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md) (Linked Sessions), [Unfold ADR 0037](../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md) (editor sign-in and its credential), [system ADR-0037](../adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md) (Action Records), [Ploeg ADR-0112](../../apps/ploeg/docs/adrs/0112-a-claude-environment-run-uses-the-claude-login-of-the-person-it-acts-for.md) (client-carried Runs), and the Ploeg proposal for personal cells, [Ploeg ADR-0143](https://github.com/ploeg-hq/ploeg/pull/239) (proposed, not in the pinned contract bundle yet)
>
> **TL;DR.** A small daemon on your machine, `unfold-daemon`, takes commands from Unfold, so that tapping **Start on my laptop** on Work Item 184 from your phone makes a git worktree for it, starts `claude` there with the Unfold plugin and `UNFOLD_WORK_ITEM=184`, and the session shows up on the Work Item page within seconds. It runs several sessions per Work Item, each in its own worktree. It lists, stops and cleans them up, and never deletes work you have not pushed without asking. It signs in like the VS Code extension does (a code you approve in the browser) and gets its own credential, which you can revoke in Settings. It only ever dials out. Permission prompts and messages reach those sessions through what already exists: the permission answers of slice H1 and the inbox of [#534](https://forgejo.webgrip.dev/webgrip/unfold/pulls/534). Later, the same daemon becomes the client for Ploeg's **personal cell**: Ploeg Runs that need what only your machine has (a VPN, Docker, a local secret, your MCP servers) run there, and asking for one more right ("egress to host X", "secret Y") becomes a prompt on your phone that you approve once, for that Run.

## The journey, from the phone

Ryan is on the train. Work Item 184 is a small fix, and the Run that Ploeg did for it stopped at Needs you: it needs the staging VPN to reproduce the bug.

| Step | Today | With this RFC |
| --- | --- | --- |
| 1. Decide to do it himself | **Continue in my Claude Code** shows a command to paste into a terminal. On a phone there is no terminal. | **Start on my laptop** lists his machines with their state (online 2 min ago, 1 session running). He picks "werkplek", **Continue Ploeg's branch**, and adds one line: "reproduce with the staging VPN first". |
| 2. The machine starts | Nothing happens until he is at his desk. | The daemon has the command within a few seconds. It makes the worktree `.claude/worktrees/unfold-184-a` on Ploeg's branch and starts `claude` there in a terminal multiplexer, with the plugin, `UNFOLD_WORK_ITEM=184` and the brief as its first prompt. |
| 3. Follow it | Not possible. | The session links itself (it already does, through `UNFOLD_WORK_ITEM`) and shows live on the Work Item page and in Now. |
| 4. It asks permission | The prompt waits on a screen nobody looks at. | The prompt shows on the session's page; he answers **Allow once** (slice H1). |
| 5. Steer it | Possible since #534: **Send to this session** queues a message the next hook delivers. | The same. |
| 6. Done | He cleans up worktrees by hand, some weeks later. | The session pushed and ended. The daemon reports the worktree as clean and pushed and removes it after a day. A worktree with unpushed work stays and shows as such until he decides. |

Steps 1, 2 and 6 are what is missing. Everything else exists.

## What exists and is not rebuilt

* **The plugin** (Claude Code plugin 0.9.0, [ADR 0047](../../apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md)) reports a session, links it to `UNFOLD_WORK_ITEM` or the branch, writes Agent Trace records, and delivers inbox messages at prompt, after shell commands and at stop. Its channel pushes messages into an idle session when Claude Code runs with the development channel flag. The daemon starts sessions with this plugin and adds no second reporter.
* **The editor credential** ([ADR 0037](../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)): `vle_` bearer token, 30 days, revocable in **Settings › Signed-in editors**, minted only after the person approves a code in the browser.
* **Hand-offs** ([#537](https://forgejo.webgrip.dev/webgrip/unfold/pulls/537), `src/linked-handoff.ts`): **Continue in my Claude Code** builds the command that fetches Ploeg's branch and starts `claude` with `UNFOLD_WORK_ITEM` and a brief; `/unfold:start` claims a client-carried Run through Unfold and dispatches it to the Team's Claude environment with the person's own login. The daemon runs the same commands, so their logic moves into a shared module both call.
* **Collisions** ([#533](https://forgejo.webgrip.dev/webgrip/unfold/pulls/533)): Now already flags two sessions working the same Work Item. Several daemon sessions on one Work Item are expected, so they show as siblings, not as a collision.
* **Permission answers** (slice H1, being built on branch `feat/linked-session-permission-answers`): a linked session's permission prompt is shown in Unfold and answered there. The daemon depends on it and adds nothing to it.

## The daemon

### What it is

`unfold-daemon` is a Node program shipped next to the plugin (`apps/unfold/extensions/daemon/`, the way `unfold-acp` ships in `extensions/acp-proxy/`), started at login by the operating system's user service manager (a systemd user unit, a launchd agent). It has no listening port. It holds one Unfold credential, a list of repository roots it may work in, and its own state file.

```text
phone or browser ──► Unfold ◄──── long poll (outbound) ──── unfold-daemon ──► git worktree add
                       ▲                                          │            tmux new-session … claude
                       └──── plugin hooks: session events ────────┘ (from each session)
```

### Commands

Unfold queues commands for one machine; the daemon collects them with a long poll (`GET /api/machines/<id>/commands?wait=25`) and answers each with a result. A command carries ids and options, never repository URLs from outside the person's own registered repositories.

| Command | What the daemon does |
| --- | --- |
| `start` `{workItem, repository, from: fresh \| ploeg-branch \| branch:<name>, brief?, firstPrompt?, remoteControl?}` | Finds a local clone of the repository under its roots (or clones it into its own root when the person allowed that), creates a worktree, starts `claude` in it, and answers the session's id once the plugin has reported it. |
| `list` | Every worktree it made, with its Work Item, its session, its state (running, idle, ended) and whether it is clean, pushed, merged or holding unpushed work. It also reports this every minute without being asked, so the page is current. |
| `stop` `{session, how: interrupt \| end}` | `interrupt` sends Escape to the session; `end` ends it as `/exit` would. The worktree stays. |
| `cleanup` `{worktree?, discard?}` | Removes worktrees that are clean and whose branch is pushed or merged. A worktree with uncommitted or unpushed work is removed only with `discard: true`, which the page asks for with the count of files and commits that would go. |
| `resume` `{session}` | Starts `claude --resume <id>` in the session's worktree, which brings back a session the machine lost when it rebooted. |
| `dispatch` `{workItem}` | Runs the `/unfold:start` flow of #537 for a client-carried Run (phase 3). |

Every command is an Action Record with the person, the channel (`browser` or `mcp:<client>`) and the confirmation, like any other action. The daemon keeps its own append-only log of what it ran.

### Worktrees

* **Where.** `.claude/worktrees/unfold-<workItem>-<letter>` inside the clone, the location Claude Code's own `--worktree` uses, so Claude Code's isolation checks apply and the person finds them where they expect. The daemon makes them with `git worktree add` itself, because `--worktree` cannot start from an existing branch such as Ploeg's.
* **Branches.** `from: fresh` branches `unfold/<workItem>-<letter>` from the default branch. `from: ploeg-branch` checks out the Work Item's Ploeg branch, fetched first, exactly as **Continue in my Claude Code** does today; only one worktree can hold a branch, so a second session on it gets a new branch from that branch's tip, which the page says.
* **Several sessions per Work Item.** Each gets the next letter, its own worktree and its own branch. The Work Item page lists them side by side. This is for trying two approaches or splitting work; Now shows them as siblings.
* **Cleanup.** Claude Code's periodic sweep leaves worktrees made with `git worktree add` alone, so cleanup is the daemon's. It removes a worktree a day after its session ended when the worktree is clean and its branch is pushed or merged (`cleanup.after`, default 24 hours), and never otherwise without `discard`. It never passes `--force` on its own, and it unlocks only locks it set.
* **Setup.** A fresh worktree has no `node_modules` or `.env`. Claude Code's `.worktreeinclude` copies the person's ignored files, and the first prompt tells the session to run the repository's setup. The daemon does not run setup itself: that is code from the repository, and the session runs it under the person's own permission rules.

### How `claude` runs

Each session runs interactively in its own `tmux` session named after the worktree (on macOS too; Windows through WSL). That is the only way to keep everything the plugin relies on: the hooks, the channel for idle sessions, `claude --resume`, and the person sitting down later and attaching with `tmux attach -t unfold-184-a` to take over at the keyboard. The daemon starts it as:

```sh
tmux new-session -d -s unfold-184-a -c <worktree> \
  env UNFOLD_WORK_ITEM=184 UNFOLD_URL=… UNFOLD_TOKEN=<the daemon's session token> \
  claude [--remote-control] -n "WI 184 · a" "<brief and first prompt>"
```

`--remote-control` is the person's choice per start, so they can also steer from the Claude app; it needs a claude.ai login and is off on Team and Enterprise until an Owner enables it. The daemon never passes `--dangerously-skip-permissions` or a `bypassPermissions` mode, whatever a command asks, and never edits the person's Claude Code settings.

The daemon never reads, copies or sends the person's Claude login or configuration directory. `claude` uses its own credential store, exactly as when the person starts it by hand.

### Authentication

* **Sign-in.** `unfold-daemon login <url>` runs the ADR 0037 flow: it prints the code, opens or links the approval page, and waits for the person to approve it in their browser. The approval page says "A session daemon on <hostname> is asking to start agent sessions as you" and what that allows.
* **Its own credential scope, `daemon`.** Stored hashed like an editor credential, listed in **Settings › Machines** (renamed from Signed-in editors, with machines and editors in two lists), 30 days absolute, revocable at once. It can: collect its own machine's commands and answer them; report its worktrees; and mint one short-lived session token per session it starts (scope `editor`, bound to that session id, ending when the session ends or after 24 hours), so the plugin in each session reports with its own token and a leaked session token does not reach the daemon's commands. It cannot issue commands, approve sign-ins, list or revoke credentials, or act on Work Items.
* **Who may command a machine.** Only its owner, from a browser session or an MCP client with confirmation. An administrator cannot start anything on someone else's machine; they can revoke the machine. An editor credential and a daemon credential cannot issue commands: a stolen VS Code token must not be able to run agents on another of the person's machines.
* **Freshness.** `start`, `dispatch` and `cleanup` with `discard` need a browser session signed in within the last 12 hours (`auth.recentHours`); otherwise the page asks the person to sign in again first.

### Permission answers and the inbox

The daemon adds no channel of its own. A session it started is an ordinary linked session, so:

* its permission prompts reach the page through slice H1, and the answer goes back the way H1 sends it;
* messages and notices reach it through the inbox of #534: at the next prompt, after a shell command, or, with the channel flag, while idle. The daemon starts sessions with `UNFOLD_CHANNEL=1 … --dangerously-load-development-channels plugin:unfold@unfold` when the person turned that on, because a session started from a phone is idle most of the time;
* the first prompt is typed by the person on the phone and travels Unfold → machine, which the privacy rule of ADR 0047 allows: nothing leaves the machine that did not before.

Two rules are proposed on top of H1 for sessions started remotely:

1. From a phone, a permission prompt can be answered **Allow once** or **Allow for this session**, never "always". In a worktree, Claude Code saves "Yes, and don't ask again" into the main checkout's `.claude/settings.local.json`, so it would widen every later session of that repository.
2. A session started remotely starts in the person's default permission mode, never a more permissive one, and the start screen says which mode that is.

### What leaves the machine

The daemon adds to the [list in the how-to](../how-to/link-claude-code-sessions.md#what-leaves-your-machine): the machine's label and operating system, its daemon version, the repository roots by remote address (never local paths), and for each worktree it made: its name, branch, Work Item, session id, and counts of changed files and unpushed commits. Never file names, diffs, prompts or output.

## How it fits the laptop executor

Ploeg's proposal [ADR-0143](https://github.com/ploeg-hq/ploeg/pull/239) lets a person register their machine as a **personal cell**: a place where their own Team's Runs execute, next to the cluster, when a Run needs what only that machine has or the person asks. The Run is a Ploeg Run with a budget, the branch fence and the leak watch; `ploeg-worker` runs it on the machine with its harness in a rootless container. A Run that hits a wall asks for one named capability (`egress:<host>`, `secret:<name>`, `docker`, `mcp:<server>`…), the person approves it once for that Run, and a fixed list (a Claude login, Ploeg's own credentials, the host's Docker socket, `~/.ssh`, wildcards and more) can never be granted.

The two are different kinds of work on the same machine:

| | Daemon session (this RFC) | Personal-cell Run (Ploeg) |
| --- | --- | --- |
| What it is | The person's own Claude Code session, linked to a Work Item | A Ploeg Run, one Role of a Shift |
| Who starts it | The person, from Unfold | Ploeg, when a Run is placed on the machine |
| Rights | Whatever the person's own Claude Code may do, prompt by prompt | Only the Team's policy plus capabilities granted for that Run |
| Who pays | The person's own seat | The Team's budget, or the person's seat for Runs they started |
| Where it shows | Your Claude Code, Linked Sessions | The Work Item's Runs |

The daemon is the natural client for the cell, for three reasons: it is already running, signed in and trusted on the machine; it already knows the person's repository roots; and it already has a channel back to the person's phone. So, in phase 4, the daemon supervises `ploeg-worker cell` as a child process:

* **Enrolment.** `unfold-daemon cell enable` runs `ploeg-worker cell enrol`; Unfold shows Ploeg's enrolment code on the approval page next to its own, and approves it as the person through the operator API (Ploeg's enrolment approval is an operator action). One approval, two credentials: Unfold's `daemon` credential and Ploeg's cell key. They stay separate: Unfold never holds the cell key, the daemon never holds Unfold's Ploeg consumer token, and the cell talks to ploegd directly.
* **Capability requests.** A Run's request arrives through Ploeg's interaction relay. Unfold shows it on the Work Item page and in Needs you as one card ("Run 412 asks for `secret:STAGING_DB_URL`: to run the migration test"), with **Grant for this Run** and **Refuse**. The grant is an operator action through `src/ploeg.ts`, with the person's confirmation.
* **One status.** **Settings › Machines** shows the machine once: online or not, daemon sessions, cell Runs, and what the machine offers to Ploeg.

## Anthropic's terms

[Ploeg ADR-0143, section 7](https://github.com/ploeg-hq/ploeg/pull/239) sets out the terms in full. For the daemon:

* **Allowed.** The person's own unmodified `claude` binary, signed in with their own subscription, on their own machine, started for their own work: Anthropic's legal page does not prevent "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription". Starting it from a phone is the same act as Anthropic's own Remote Control. The daemon never touches the login.
* **Not allowed.** Starting sessions on one person's seat for someone else's work, or the daemon, Unfold or Ploeg holding or relaying a Claude login or session token.
* **Not settled.** A daemon that starts sessions on a timer with nobody asking, such as draining every Work Item assigned to the person overnight. Pro and Max limits "assume ordinary, individual usage", and the Consumer Terms allow automated access only with an API key or where Anthropic permits it. This is the batch question put to Anthropic on 2026-10-18 under ADR-0112. Until it is answered, every daemon session starts from one tap by its person, and the daemon has no queue.
* **Needs an API key.** Anything unattended, and every Ploeg Run on the machine that its person did not start; those are personal-cell Runs on the Team's gateway key.

## States the page must handle

| State | Work Item page | Settings › Machines |
| --- | --- | --- |
| No machine | **Start on my laptop** explains the one-time setup, with the install command | Empty, with the same |
| Machine offline (no poll for 2 minutes) | The machine is listed as offline with when it was last seen; **Start** queues the command, which expires after 10 minutes | Offline, last seen |
| Command waiting | "Waiting for werkplek…" with a cancel | The waiting command |
| Command failed | The daemon's reason in plain words ("no clone of webgrip/unfold under ~/projects; allow cloning or add a root") | The same |
| Session running, idle, waiting for permission, ended | As any linked session, plus its worktree letter | Each session and worktree |
| Worktree holding unpushed work after its session ended | "a: 3 unpushed commits, 2 changed files" with **Resume** and **Discard…** | The same |
| Credential expires within 3 days | A warning with **Renew** | The same |

## Options considered

| Option | For | Against |
| --- | --- | --- |
| **A daemon that polls Unfold and runs `claude` in tmux worktrees** (recommended) | Uses the plugin, the inbox and H1 as they are; no port; works with any Claude plan and with API keys; becomes the cell's client | New software on the person's machine, on three operating systems |
| Claude Code's Remote Control server mode, `claude remote-control --spawn worktree` | Anthropic's own; the Claude app already starts sessions in worktrees from a phone | Unfold cannot start a session in it or pass a Work Item or brief; claude.ai logins only, no API keys; off by default on Team and Enterprise; Work Item linking still needs the plugin. Kept as the optional `--remote-control` flag |
| The VS Code extension starts sessions | Already signed in with an editor credential | Only while VS Code is open, and only for the workspace it has open |
| A web terminal on the machine, served through a tunnel | The phone gets a full terminal | An inbound path into the person's machine; a shell from a phone is the wrong surface for steering an agent |
| The Agent SDK in the daemon instead of the `claude` binary | Full control of the loop | Anthropic asks developers building on the Agent SDK to use API keys, so the person's own subscription could not pay for it; loses the plugin and the channel |
| Only the Ploeg personal cell, no daemon sessions | One mechanism | Every session would be a budgeted Ploeg Run with Team policy, not the person's own Claude Code; it does not answer "start my own session from my phone" |

## Plan

Each phase is one pull request in Unfold unless it says otherwise, and each says what it needs from Ploeg.

| Phase | What | Needs from Ploeg |
| --- | --- | --- |
| 0 | This RFC and Ploeg's ADR-0143, both proposed; owner decisions below | The ADR's review |
| 1 | `unfold-daemon` with `login`, the `daemon` scope, **Settings › Machines**, the command queue, `start` (fresh and Ploeg branch), `list`, `stop`, `cleanup`; the hand-off logic of #537 moved into a module both call; tests with a fake `claude` and a real git repository | Nothing; Ploeg's branch is already on the Work Item |
| 2 | **Start on my laptop** on the Work Item page and from Now, the states table, siblings in Now, the two remote permission rules on top of H1, `resume`, the channel flag per start | Nothing |
| 3 | `dispatch`: a client-carried Run started from the phone through the daemon, the `/unfold:start` flow | Nothing new: ADR-0112's claim route exists. Batch claims stay off until Anthropic answers |
| 4 | The daemon supervises `ploeg-worker cell`; joint enrolment; capability requests and grants on the Work Item page and in Needs you; the machine's cell Runs in Settings | ADR-0143 phases 1 to 4 released, in the contract bundle, and pinned by Unfold |
| 5 | Personal-cell Runs on the person's own seat, for Runs they started | ADR-0143 phase 5, and Anthropic's answer reviewed |

## Owner decisions

The owner answered all of these on 2026-10-24, each as recommended, on the [decision page](https://claude.ai/artifact/BEgZNwzptbYdxc6Q1qH7j1):

1. **Packaging.** A Node program next to the plugin, run with `npx`, for phases 1 to 3; phase 4 starts `ploeg-worker` as a child.
2. **How `claude` runs.** In tmux, interactive, with Remote Control as a per-start option.
3. **Starting from a phone.** The first start in each repository also needs one click on the machine; later starts there need only the phone.
4. **Cloning.** The daemon may clone a repository Ploeg has registered into its own root when the person allows it in the command. Off by default.
5. **Remote permission answers.** Once, or for this session only. Never "always".
6. **Cleanup.** Clean, pushed worktrees are removed after 24 hours.
7. **Where Settings lists machines.** One **Machines** page with editors and daemons.
8. **The Ploeg decisions in ADR-0143.** Public TLS cell routes; a container by default with native as an opt-in; per-Run grants with a rest-of-Shift option; seat mode only for Runs the owner started; cluster fallback by default; a 15-minute lease grace; Linux and macOS first ([ploeg-hq #252](https://github.com/ploeg-hq/ploeg/pull/252)).

## Risks

* **Remote code execution by design.** A daemon that starts agents on command is exactly what an attacker who takes over the person's Unfold session wants. Mitigations: only the owner's recent browser session or confirmed MCP client can command; editor and daemon credentials cannot; the daemon refuses permissive modes and repositories outside its roots; decision 3; every command is an Action Record and in the local log; revoking the machine in Settings stops it at the next poll.
* **Lost work.** Cleanup that removes a worktree with unpushed commits destroys work. The daemon never removes one without `discard`, and the page states what would go.
* **Sessions nobody watches.** A session started from a phone can sit at a permission prompt for hours. H1 shows it in Needs you; the daemon reports a session waiting more than 30 minutes so Now can say so.
* **Terms.** Covered above. The risk is a future reading that counts a phone-started session as automated use. Anthropic's own Remote Control does the same, which makes that reading unlikely, but the batch question stays open.
* **Three operating systems.** systemd, launchd and WSL differ in service management, sleep and key storage. Phase 1 supports Linux and macOS only.
* **Two credentials on one machine in phase 4.** The daemon's Unfold credential and the cell's Ploeg key. They are kept apart on purpose; the risk is a person revoking one and assuming both are gone. Settings revokes both with one action.
* **Drift from Claude Code.** Worktree locations, the channel flag and Remote Control are moving features (the channel is a research preview). The daemon pins the Claude Code versions it is tested with and says so when it sees another.
