---
type: how-to
audience: [owner]
owner: unfold
last_verified: 2026-10-10
verified_by: "Read apps/unfold/src/mcp.ts, apps/unfold/scripts/mcp.ts, apps/unfold/src/auth.ts and apps/ploeg cmd/ploeg-mcp; ran apps/unfold/test/mcp.test.ts and go test ./cmd/ploeg-mcp. Not checked against the homelab."
---

# Ask Unfold and Ploeg from an AI client

Use this when you want Claude Code, Codex, Cursor or another MCP client to answer "what waits for me, why, and what do I do?". Result: your client can call two read-only MCP servers ([ADR-0032](../adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md)).

| Server | Answers | Signs in as |
| --- | --- | --- |
| `unfold` | What waits for you, with the reason and fix the Unfold page shows; one Work Item in depth; your sessions | You, with an editor credential |
| `ploeg` | Ploeg's counts, spend, Runs and audit events for every Team its consumer may read | A read-only Operator Consumer |

Start with `unfold`. Add `ploeg` when you want spend and Run history across Teams.

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
| `unfold_now` | Everything waiting for you, each with its reason, fix and Unfold link; running Runs; tracker tasks Ploeg refused to route; your Teams |
| `unfold_find_work` | One Team's Work Items, by state, paged |
| `unfold_get_work` | Why one Work Item waits, Ploeg's own words, the Run that explains it, budget and spend per Shift, its Runs |
| `unfold_sessions` | Your workbench sessions |

## Ploeg

Follow Ploeg's [Ask Ploeg from an AI client over MCP](../../apps/ploeg/docs/how-to/ask-ploeg-from-an-ai-client.md). It needs a read-only Operator Consumer in the Ploeg chart, and a route to ploegd, for now a port-forward.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Unfold refused UNFOLD_TOKEN" | The credential expired after 30 days or was revoked | Run `npm run mcp -- login` again |
| `login` says Unfold answered 404 | Single sign-on is not configured on this Unfold | Configure OIDC, or use the demo, which needs no token |
| "Not found, or outside the Teams…" | Your Unfold user is not mapped to that Work Item's Team | Ask an admin to add the Team to your user |
| The client lists no `unfold` tools | It only speaks the 2026-07-28 revision | Use a client that starts with `initialize` over stdio, such as Claude Code |
