# A north-side ACP agent called `unfold`

## Why

Unfold reaches an editor only through VS Code: the Agent Host Protocol host and
the extension ([Unfold ADR 0007](../../../apps/unfold/docs/adrs/0007-thin-editor-client.md)).
The agencies Unfold is for ([Who Unfold is for](../../../docs/concepts/who-unfold-is-for.md))
write PHP in PhpStorm. On 2026-10-30 the owner decided that phase 1 offers a
north-side agent over the Agent Client Protocol (ACP), so PhpStorm and any other
editor that speaks ACP can use Unfold as an agent
(system ADR-0050, "Editors", in review as
[pull request #697](https://forgejo.webgrip.dev/webgrip/unfold/pulls/697)).

Application: `apps/unfold`. Ticket: none yet; the source is the owner decision
recorded in system ADR-0050.

## What Changes

- A new package, `apps/unfold/extensions/acp-agent` (`@webgrip/unfold-acp-agent`,
  bin `unfold-acp-agent`), a dependency-free Node program that speaks ACP over
  stdio as the agent `unfold`.
- It signs in with Unfold's editor sign-in
  ([Unfold ADR 0037](../../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md))
  and holds the same `vle_` editor credential. The only server change is the
  approval page's name for it, `unfold-acp-agent on <host>`.
- An ACP session follows one Work Item, or one of the person's workbench
  sessions. A message asks about it (Unfold Ask) or steers its session; the
  session feed streams back; a tool permission the Run's harness asks for
  reaches the person as an ACP permission prompt; an action that spends or
  changes work asks first.
- A delegation from the editor is drafted, never admitted: Ploeg has no
  proposal admission yet, and a Run must never start from it.
- A how-to for PhpStorm, JetBrains Air, Zed and Neovim, and an ACP registry
  entry kept in the repository and submitted nowhere.

## Capabilities

### New Capabilities

- `acp-agent`: what an ACP editor can do with Unfold through the `unfold` agent.

### Modified Capabilities

- none

## Non-goals

- Creating a proposed Work Item. It needs a generic Ploeg admission that holds
  work as `proposed` for a person (described in design.md, D6); until Ploeg
  ships one, `/propose` only drafts.
- Answering a Work Item's question, restarting, approving or stopping it from
  ACP. Unfold and `unfold-mcp` keep those.
- Publishing the npm package or submitting the registry entry.
- `session/load`, `session/list` and resuming an ACP session after the editor
  restarts.
- Any change to `http.ts` or a new route.

## Impact

- `apps/unfold/extensions/acp-agent/` (new): `bin/`, `lib/`, `registry/unfold/`,
  `README.md`, `package.json`.
- `apps/unfold/src/auth.ts`: `editorLabel` names the `acp` client.
- `apps/unfold/test/acp-agent.test.ts` (new), `test/editor-sign-in.test.ts`.
- `docs/how-to/use-unfold-from-an-acp-editor.md` (new), `docs/index.md`.
- `apps/unfold/docs/adrs/0058-…` (proposed) and its ledger row.
