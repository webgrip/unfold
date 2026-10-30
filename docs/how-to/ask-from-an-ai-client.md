---
type: how-to
audience: [owner]
owner: unfold
last_verified: 2026-10-30
verified_by: "Read apps/unfold/src/mcp.ts, apps/unfold/scripts/mcp.ts and apps/unfold/src/auth.ts against the MCP 2026-07-28 versioning, stdio and MRTR pages; ran apps/unfold/test/mcp.test.ts and apps/unfold/test/mcp-actions.test.ts. The Ploeg section was read against apps/ploeg cmd/ploeg-mcp on 2026-10-17. The action tools were not checked against a real client or the homelab. The MCP Apps section was read against apps/unfold/src/mcp-apps.ts and the MCP Apps 2026-01-26 specification, the client table against each linked page on 2026-10-30, and the card was rendered in headless Chromium through a test host; no real client was tried. The hand-off task section was read against apps/unfold/src/mcp.ts and Claude Code's MCP tasks pages on 2026-10-30, and apps/unfold/test/mcp-tasks.test.ts passed; Claude Code itself was not tried."
---

# Ask Unfold and Ploeg from an AI client

Use this when you want Claude Code, Codex, Cursor or another MCP client to answer "what waits for me, why, and what do I do?". Result: your client can call two MCP servers that read first ([ADR-0032](../adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md)), and act on work through `unfold` after you confirm each action ([ADR-0037](../adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)).

| Server | Answers | Signs in as |
| --- | --- | --- |
| `unfold` | What waits for you, with the reason and fix the Unfold page shows; one Work Item in depth; your sessions | You, with an editor credential |
| `ploeg` | Ploeg's counts, spend, Runs and audit events for every Team its consumer may read | A read-only Operator Consumer |

Start with `unfold`. Add `ploeg` when you want spend and Run history across Teams.

The steps below run `unfold` over stdio from a checkout. When your Unfold serves it over HTTPS, connect by URL and sign in in the browser instead: [Serve Unfold's MCP tools over HTTPS](serve-unfold-mcp-over-https.md#3-connect-a-client).

## Unfold

1. From a checkout of this repository, sign in once. Your Unfold must have single sign-on configured.

   ```sh
   cd apps/unfold
   UNFOLD_URL=https://unfold.example.org mise exec -- npm run -s mcp -- login
   ```

   Open the link it prints, check the code, and approve. It prints a `vle_…` credential that lasts 30 days. Revoke it from Unfold in your browser when you stop using it.

2. Register the server. Claude Code:

   ```sh
   claude mcp add unfold --env UNFOLD_URL=https://unfold.example.org --env UNFOLD_TOKEN=vle_… -- node /path/to/apps/unfold/scripts/mcp.ts
   ```

3. Ask "what waits for me in Unfold?". The client calls `unfold_now`, then `unfold_get_work` for one item. Give it an id or an Unfold link such as `…/#work/184`.

| Tool | Answers |
| --- | --- |
| `unfold_now` | Everything waiting for you, each with its reason, fix and Unfold link; running Runs; tracker tasks Ploeg refused to route; your own agent sessions that wait for you; your Teams |
| `unfold_find_work` | One Team's Work Items, by state, paged |
| `unfold_get_work` | Why one Work Item waits, Ploeg's own words, the Run that explains it, budget and spend per Shift, its Runs |
| `unfold_sessions` | Your workbench sessions |
| `unfold_linked_sessions` | Agent sessions people run outside Unfold that report to it, for one Work Item or your own: state, owner, Work Items, commits with AI-written lines, and the command that resumes them ([Link your Claude Code sessions](link-claude-code-sessions.md)) |
| `unfold_link_session` | Links your own agent session to a Work Item, or unlinks it with `unlink: true`. Changes nothing in Ploeg and spends nothing |
| `unfold_spend` | Spend settled and held per Team for 24h, 7d or 30d, and the finished Runs whose budget hold Ploeg has not released, each with its Work Item |
| `unfold_digest` | What changed since your previous digest (or since a time or span such as `8h`): what started needing you with the reason and fix, pull requests ready for review, proposals, finished Runs with outcome and cost, changed sessions, refused tasks, spend and stuck holds. It remembers when you last asked in `~/.local/state/unfold-mcp/digest.json`; pass `remember: false` to peek without moving that mark. A separate `ownSessions` section counts your own agent sessions over the last 7 or 30 days: sessions, Work Items, commits, AI-written lines and Claude Code's API-price estimate |
| `unfold_ask` | One question about a Work Item. A standing question ("why did it stop?", "what did it cost so far?") is answered from the record, free. Any other question needs `use_model: true`; your client then asks you to confirm, and one model call spends up to the per-Ask Budget from the Team's Ask Allowance. A client that cannot ask you is refused and gets a link to the Work Item instead. An Ask without an answer returns `failureCode` (such as `allowance_used_up`, `timeout` or `cut_off`) and `retryable`, which says whether asking again may help |

## Act on work

`unfold` also changes work, as you, through the same Unfold API routes the browser uses, so your role and Teams decide what you may do. Each action tool first asks you to confirm in your client: the message names the Work Item, task or session with its id and title, says exactly what will happen, and says what it may spend. Only **accept** with the box ticked acts. Declining, closing the question or not answering changes nothing; when the question was closed without an answer, the result also gives the link to the Unfold page, in case your client never showed it to you. A client that cannot ask you (no form elicitation) is refused with that link. A viewer is refused before anything is asked.

How your client asks depends on the MCP revision it speaks; `unfold-mcp` serves every client on one stdio process:

* **2026-07-28.** No `initialize`; each request names its revision and capabilities in `_meta`. The first call returns `input_required` with the question, and your client calls the tool again with your answer and the `requestState` it received. That state works once, for you, for that exact action, for 10 minutes. A retry without an answer is asked again.
* **2025-11-25, 2025-06-18 and 2025-03-26.** After `initialize`, `unfold-mcp` sends your client an `elicitation/create` request on stdio and waits up to five minutes for the answer.

| Tool | Does | Unfold route |
| --- | --- | --- |
| `unfold_hand_off` | Hands an open tracker task to a Team: assigns the Team's tracker user and comments on the task. Takes `source`, `task` and `team` as the Tasks page names them. The confirmation names the Team's spend cap and what is left of it when Ploeg reports one, and otherwise says the limit is not known until Ploeg picks the task up ([what it says](../../apps/unfold/docs/contracts/api.md#what-a-hand-off-confirmation-says-it-spends)) | `POST /api/task-sources/:source/tasks/:id/handoff` |
| `unfold_approve_work` | Approves a proposed Work Item, so Ploeg queues it | `POST /api/ploeg/work-items/:id/approve` |
| `unfold_reject_work` | Rejects a proposed Work Item with your `reason` | `POST /api/ploeg/work-items/:id/reject` |
| `unfold_stop_work` | Stops a Work Item: Ploeg withdraws it, stops its Runs and blocks their keys | `POST /api/ploeg/work-items/:id/cancel` |
| `unfold_retry_work` | Restarts a Work Item that needs you or went stale from Round 1, with an optional `note` | `POST /api/ploeg/work-items/:id/requeue` |
| `unfold_add_note` | Leaves a note for a queued or running Work Item's next Run | `POST /api/ploeg/work-items/:id/notes` |
| `unfold_take_over` | Takes control of a running Work Item: Ploeg asks its Run to stop at the next safe point, pushes what the agent left to the Work Item's branch and parks it for you. Only Runs of an ACP harness can stop between steps; see [take a Run over](link-claude-code-sessions.md#take-a-run-over-and-hand-it-back) | `POST /api/ploeg/work-items/:id/take-over` |
| `unfold_hand_back` | Hands a Work Item you took over back to Ploeg with an optional `note`: it resumes the Round on the same branch from its head on the forge | `POST /api/ploeg/work-items/:id/hand-back` |
| `unfold_steer_session` | Sends a `message` to one of your sessions, or pauses, resumes or cancels it | `POST /api/sessions/:id/messages`, `/pause`, `/resume`, `/cancel` |
| `unfold_message_session` | Sends a message to one of your linked sessions, such as Claude Code on your machine; the Unfold plugin hands it to the session | `POST /api/linked-sessions/:id/messages` |
| `unfold_answer_permission` | Allows or denies one tool prompt waiting in your own Claude Code session that turned on [remote approval](link-claude-code-sessions.md#approve-a-tool-from-unfold). The question names the tool and the summary the agent wrote. `unfold_permission_requests` lists the waiting prompts. Called by another agent, this is an agent approving a tool for an agent, so read the question before you accept | `POST /api/linked-sessions/:id/permissions/:requestId/answer` |

### Follow a hand-off as a task

When you hand a task off from Claude Code (terminal sessions, version 2.1.304 or later) connected to Unfold over HTTPS, and the `mcp.tasks` flag is on for you, the hand-off becomes an MCP task. The footer shows `1 MCP task`, and `/tasks` follows it:

* Until Ploeg picks the task up, it says so. Then it shows why the Work Item waits and the fix, as `unfold_now` does, with the Unfold link.
* When an agent asks you a question, Claude Code opens a form with the question, quoted as the agent's text, and what answering does and may spend. Submitting answers it as `unfold_answer_question` would. Declining or pressing `Esc` leaves the question open in Unfold; answer it there or with `unfold_answer_question`. Close `/tasks` to see the form.
* Once a pull request waits for review, or the Work Item ends, Claude gets the result: the pull request, what was spent and the link. A withdrawn or stale Work Item is reported as a failure.
* Stopping the task in `/tasks` only stops following it. The Work Item keeps running; stop it with `unfold_stop_work`.

The VS Code extension, the desktop app, subagents and a one-shot `claude -p` get the hand-off's summary as before. How the server side works is in [Serve Unfold's MCP tools over HTTPS](serve-unfold-mcp-over-https.md#follow-a-hand-off-as-a-task). This has been run against a test client only, not Claude Code itself.

Every action leaves an Action Record with you, the channel (your credential's name and the client, such as `unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)`, or `mcp:<client>` over HTTPS) and the confirmation: an id and the SHA-256 of the exact text you agreed to. Ploeg receives the same channel and confirmation. You find them under **Who did what** on the Work Item and on your Activity page. In the demo, the confirmation and the result both say it is the demo, and nothing real changes.

## See a Work Item as a card

Some AI clients can draw interactive panels inside the chat. The open standard for this is [MCP Apps](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx), stable since 26 January 2026. When your client supports it, `unfold_get_work` shows a card instead of only text. The card holds:

- the state and why the Work Item waits, with the fix;
- the question the agent asked;
- links to the pull request and to Unfold;
- the last five Runs;
- spend against the latest Shift's budget, in `US$ 1.234,50` form.

`unfold_now` shows the list of what waits for you, and clicking an item opens its card. Clients without MCP Apps get the same text and structured answers as before.

From the card you can:

- **Ask** a question. It is answered free from the record when the record answers it. Otherwise the card offers **Ask a model…**.
- **Answer** the question the Work Item waits on.
- **Leave a note** for the next Run.
- **Approve** a proposal.

These buttons call the same tools the model calls, and each tool asks you to confirm in your client as described in [Act on work](#act-on-work). The card never confirms for you. If your client runs the card's call without showing you the question, the card says nothing changed and gives the Unfold link. The card loads nothing from the network: its HTML, styles and script are all inline, and its Content Security Policy blocks every connection ([contract](../../apps/unfold/docs/contracts/api.md#mcp-apps)).

Which clients render it, as of 30 October 2026. "Verified" means the client's own documentation says it supports MCP Apps. No client has been tried against a real Unfold yet. The card itself was only rendered in a test host in headless Chromium.

| Client | Renders MCP Apps | Reaches `unfold-mcp` | Source |
| --- | --- | --- | --- |
| Claude (claude.ai, Desktop, iOS, Android) | Yes, verified | Over HTTPS as a connector. claude.ai cannot reach `localhost`. Whether Claude Desktop renders apps from a local stdio server is not confirmed | [Claude blog, 26 January 2026](https://claude.com/blog/interactive-tools-in-claude), [Help Center](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude) |
| ChatGPT | Yes, verified: it implements MCP Apps and also reads `openai/outputTemplate` | Over HTTPS, or through its Secure MCP Tunnel | [MCP Apps in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt), [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) |
| VS Code (GitHub Copilot Chat) | Yes, verified, since 1.109 | Over HTTPS. Over stdio is not confirmed | [VS Code blog, 26 January 2026](https://code.visualstudio.com/blogs/2026/01/26/mcp-apps-support), [1.109 release notes](https://code.visualstudio.com/updates/v1_109) |
| Claude Code | No, per the MCP client matrix | Text answers as before | [MCP client matrix](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx) |
| Goose, Cursor, Microsoft 365 Copilot, Postman, MCPJam | Listed in the MCP client matrix; not confirmed in each client's own documentation | Not confirmed | [MCP client matrix](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx) |

Over HTTPS, a client that speaks a 2025 revision gets the card only when it declared MCP Apps in `initialize` within the last 24 hours. The same Unfold process must also have seen that `initialize`. Reconnecting the client brings the card back after a restart.

## Ploeg

Follow Ploeg's [Ask Ploeg from an AI client over MCP](../../apps/ploeg/docs/how-to/ask-ploeg-from-an-ai-client.md). It needs a read-only Operator Consumer in the Ploeg chart, and a route to ploegd, for now a port-forward.

Where Ploeg serves `ploeg-mcp` over HTTPS ([Serve Ploeg's MCP tools over HTTPS](../../apps/ploeg/docs/how-to/serve-ploeg-mcp-over-https.md)), connect to its URL and sign in through the browser instead; no token sits on your machine. In VS Code, the Unfold extension provides that server once the Unfold you sign in to names it ([extension README](../../apps/unfold/extensions/vscode/README.md#use-ploegs-tools-in-vs-code-chat)).

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Unfold refused UNFOLD_TOKEN" | The credential expired after 30 days or was revoked | Run `npm run mcp -- login` again |
| `login` says Unfold answered 404 | Single sign-on is not configured on this Unfold | Configure OIDC, or use the demo, which needs no token |
| "Not found, or outside the Teams…" | Your Unfold user is not mapped to that Work Item's Team | Ask an admin to add the Team to your user |
| An action tool says the client cannot confirm | Your client declares no form elicitation, or speaks 2025 over HTTPS | Use the link it gives and act in Unfold, or use a client that supports elicitation |
| An action says "the confirmation was closed without an answer", and you never saw a question | Your client declares elicitation but cancels it unseen. Claude Code's VS Code extension runs in print mode and cancels within about 50 ms | Open the link it gives and act in Unfold, or use the terminal `claude` |
| The client lists no `unfold` tools | It speaks a revision `unfold-mcp` does not list | `unfold-mcp` answers `initialize` for 2025-11-25, 2025-06-18 and 2025-03-26, and per-request `_meta` for 2026-07-28, where `server/discover` lists them; update the client |
