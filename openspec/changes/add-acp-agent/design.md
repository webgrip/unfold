## Context

Unfold already speaks to editors in three ways: the VS Code extension and the
Agent Host Protocol host (`apps/unfold/src/ahp/`), `unfold-mcp` (`src/mcp.ts`),
whose tools read and act after an elicitation confirms, and `unfold-acp`
(`extensions/acp-proxy`), which sits between an ACP editor and another agent and
only reports. None of them lets an ACP editor talk to Unfold itself. ACP
(protocol version 1, [agentclientprotocol.com](https://agentclientprotocol.com))
has an editor start an agent as a subprocess and talk JSON-RPC over stdio:
`initialize`, `authenticate`, `session/new`, `session/prompt` with streamed
`session/update` notifications, `session/cancel`, and the agent's
`session/request_permission` back to the editor.

## Goals / Non-Goals

**Goals:**

- PhpStorm (AI Assistant and Air), Zed, Neovim or any ACP client starts
  `unfold-acp-agent` as an agent and follows, asks about and steers a Work Item.
- Every rule `unfold-mcp` keeps holds here too: the person confirms each spend
  and change, a demo says it is one, permissions are allow or deny only.
- Existing routes only.

**Non-Goals:** as in the proposal.

## Decisions

**D1 Its own package, no dependencies.** `extensions/acp-agent` imports nothing
outside itself, unlike `acp-proxy`, so `npx @webgrip/unfold-acp-agent` works
once it is published. It does not reuse `src/mcp.ts`: that is TypeScript inside
the server package, and its confirmations are MCP elicitations. The agent calls
the same routes the MCP tools call, with the same `X-Unfold-Client` and
`X-Unfold-Confirmation` headers, so the action record reads the same.

**D2 Sign-in.** `unfold-acp-agent login` runs the editor sign-in with
`client: "acp"`; `editorLabel` names it `unfold-acp-agent on <host>`, so the
approval page says which program asks. The credential goes to
`$XDG_CONFIG_HOME/unfold/acp-agent.json` (0600), keyed by the Unfold URL.
`UNFOLD_TOKEN` overrides it. ACP's terminal authentication method runs the same
`login`, which is what the ACP registry requires of a listed agent; an
editor-driven browser flow (ACP "agent" auth) would show the person no code to
compare, which Unfold ADR 0037 requires.

**D3 What a session follows.** An ACP session has no Work Item until the person
picks one: `/work <id|session id|link>`, the `work-item` select in
`configOptions` (filled from Now), `_meta.unfold.workItem` at `session/new`, or
`UNFOLD_WORK_ITEM`. A bound Work Item's workbench session is the person's own
running session whose `execution.workItemId` matches, else anyone's, which they
may read but not steer.

**D4 Two modes.** ACP session modes `ask` (default) and `steer` decide what a
plain message does, as `/ask` and `/steer` do in the Agents window
(`src/ahp/asks.ts`). Ask is free from the record; a model Ask asks first, as
`unfold_ask` does. Steer messages the person's own workbench session, or leaves
a note for the next Run when Ploeg runs the Work Item without a workbench
session. Both ask first.

**D5 Feed and permissions by polling.** A watching prompt polls
`GET /api/sessions/{id}/history?after=` and `GET /api/sessions/{id}` every
second rather than holding the SSE stream, so a cancel, a lost connection and a
restart of either side need no reconnect logic. When the session waits, it
reads `GET /api/sessions/{id}/permissions` and relays each open permission once.
A prompt the person dismisses leaves the request waiting in Unfold; only an
explicit deny answers `reject`.

**D6 Proposals need Ploeg.** Ploeg's only consumer admission,
`POST /api/v1/operator/work-items` (Ploeg ADR-0102), queues the Work Item for its
Team, and a Run can start from it. A delegation from an editor must wait for a
person. The generic contract, in Ploeg's words, for ploeg-hq: *an admission
request may set `hold: "proposed"`; Ploeg then stores the Work Item in state
`proposed`, opens no Shift and spends nothing until a person approves it through
the existing approve and reject routes (ADR-0031), and a replay answers the
same Work Item.* Until a release has it, `/propose` drafts and says so.

**D7 What leaves the machine.** Prompts go to Unfold only as Ask questions,
steer messages and notes the person confirmed. The agent reads no files in
`cwd` and ignores the editor's `mcpServers`.

## Risks / Trade-offs

- Polling costs up to two requests a second per watching editor. A watch stops
  when the session stops, and an idle ACP session polls nothing.
- Editors differ in what they render: `configOptions` and `session_info_update`
  are newer than modes and may be ignored; `/work` always works.
- Not verified in a real PhpStorm, Air, Zed or Neovim: the tests drive the
  agent with a fake ACP client.

## Open Questions

- The Ploeg proposal admission (D6), and whether the owner wants it filed now.
- Publishing `@webgrip/unfold-acp-agent` to npm and submitting the registry
  entry, both owner decisions.
