---
type: how-to
audience: [owner]
owner: unfold
last_verified: 2026-10-17
verified_by: "Read apps/unfold/src/mcp.ts, apps/unfold/scripts/mcp.ts, apps/unfold/src/auth.ts and apps/ploeg cmd/ploeg-mcp; ran apps/unfold/test/mcp.test.ts, apps/unfold/test/mcp-actions.test.ts and go test ./cmd/ploeg-mcp. The action tools were not checked against a real client or the homelab."
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

`unfold` also changes work, as you, through the same Unfold API routes the browser uses, so your role and Teams decide what you may do. Each action tool first asks you to confirm in your client: the message names the Work Item, task or session with its id and title, says exactly what will happen, and says what it may spend. Only **accept** with the box ticked acts. Declining, closing the question or not answering changes nothing. A client that cannot ask you (no form elicitation) is refused with a link to the Unfold page where you can do it yourself. A viewer is refused before anything is asked.

| Tool | Does | Unfold route |
| --- | --- | --- |
| `unfold_hand_off` | Hands an open tracker task to a Team: assigns the Team's tracker user and comments on the task. Takes `source`, `task` and `team` as the Tasks page names them | `POST /api/task-sources/:source/tasks/:id/handoff` |
| `unfold_approve_work` | Approves a proposed Work Item, so Ploeg queues it | `POST /api/ploeg/work-items/:id/approve` |
| `unfold_reject_work` | Rejects a proposed Work Item with your `reason` | `POST /api/ploeg/work-items/:id/reject` |
| `unfold_stop_work` | Stops a Work Item: Ploeg withdraws it, stops its Runs and blocks their keys | `POST /api/ploeg/work-items/:id/cancel` |
| `unfold_retry_work` | Restarts a Work Item that needs you or went stale from Round 1, with an optional `note` | `POST /api/ploeg/work-items/:id/requeue` |
| `unfold_add_note` | Leaves a note for a queued or running Work Item's next Run | `POST /api/ploeg/work-items/:id/notes` |
| `unfold_steer_session` | Sends a `message` to one of your sessions, or pauses, resumes or cancels it | `POST /api/sessions/:id/messages`, `/pause`, `/resume`, `/cancel` |
| `unfold_message_session` | Sends a message to one of your linked sessions, such as Claude Code on your machine; the Unfold plugin hands it to the session | `POST /api/linked-sessions/:id/messages` |
| `unfold_answer_permission` | Allows or denies one tool prompt waiting in your own Claude Code session that turned on [remote approval](link-claude-code-sessions.md#approve-a-tool-from-unfold). The question names the tool and the summary the agent wrote. `unfold_permission_requests` lists the waiting prompts. Called by another agent, this is an agent approving a tool for an agent, so read the question before you accept | `POST /api/linked-sessions/:id/permissions/:requestId/answer` |

Every action leaves an Action Record with you, the channel (your credential's name and the client, such as `unfold-mcp on ryan-pc-mint (Claude Code 2.1.296)`, or `mcp:<client>` over HTTPS) and the confirmation: an id and the SHA-256 of the exact text you agreed to. Ploeg receives the same channel and confirmation. You find them under **Who did what** on the Work Item and on your Activity page. In the demo, the confirmation and the result both say it is the demo, and nothing real changes.

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
| The client lists no `unfold` tools | It speaks a revision `unfold-mcp` does not list | `unfold-mcp` answers `initialize` for 2025-11-25, 2025-06-18 and 2025-03-26, and per-request `_meta` for 2026-07-28; update the client |
