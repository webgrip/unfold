# Board coordinates (Vikunja)

> Lookup data for the workflows that touch Ploeg's tracker — deliberately **not** in
> [AGENTS.md](../../AGENTS.md), which is paid for in tokens on every agent load
> including factory workers that never open the board. Migrated 2026-07-28 from
> assistant memory. Volatile by nature: verify before relying on an ID.

## Planning board

- Project **Ploeg = ID 10**, ticket prefix `VIK`, served over the MCP endpoint at
  `https://mcp-vikunja.webgrip.dev/mcp`.
- Label IDs: `do-next` = 1, `agent-ready` = 65, `needs-refinement` = 27, `ready` = 28.
- The Kanban view (ID 84) holds only empty default buckets — the board runs on priority
  plus lifecycle labels, so reading buckets tells you nothing.
- The instance page cap exceeds Vikunja's default 50 (a `tasks_list` limit of 200
  returned all 116 open tasks on 2026-07-27).

Gotchas worth knowing before you debug them again:

- `tasks_list_all` with `filter: 'labels in <name-or-id> && done = false'` returns
  400 "Invalid model provided" — label filtering through the filter param does not work
  on this MCP. Fetch candidates with `task_get` and read their `Labels:` line instead.
- `GET /tasks/{id}/assignees` 500s ("expected 26 destination arguments in Scan"), which
  breaks assignee *removal* through MCP; adding an assignee works.
- Creation is `PUT`, not `POST`, for assignees, labels, and comments.
- When MCP tools are not loaded in a session, the `vikunja-product-owner` plugin ships a
  fallback Python client (`scripts/mcp_client.py`: `init()` then
  `call('tasks_list', {'projectId': 10, 'limit': 200})`).

## Dispatch topology — the trap

The factory's webhook and the team-user project shares are wired on **Ploeg Test
(project 11)**, *not* on the planning board (project 10).

Assigning a team user on project 10 returns a Vikunja 403 (an assignee needs read
access to the project), and even a successful assignment there fires **no webhook**, so
nothing dispatches. To route work from the planning board, share the team users into it
and register the ploegd webhook on it.

The De Vloer console resolves users via `/projects/{id}/projectusers` and defaults to
project 11 for exactly this reason.

## Board state

Not recorded here. The board is the source of truth for what is open, and a snapshot in
git is stale the moment it is written — read the board, and reconcile against the code
before acting on any ticket that claims to be unimplemented.
