# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `add-acp-agent`

## Accepted Records Reviewed

- System ADR-0050 (in review as pull request #697, accepted by the owner on 2026-10-30) — ACP for editors, the phase 1 north-side agent, registries and open standards.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md` — every action names its person, channel and confirmation; the agent sends `X-Unfold-Client` and `X-Unfold-Confirmation` as `unfold-mcp` does.
- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — Unfold never executes; the agent only asks, steers through existing routes and drafts.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md` — the form of this change.
- `apps/unfold/docs/adrs/0007-thin-editor-client.md` — an editor client stays thin and holds no work state.
- `apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md` — the sign-in, the code to compare, the `vle_` credential; no new credential type.

## Records Created

- `apps/unfold/docs/adrs/0058-an-acp-editor-uses-unfold-as-the-agent-unfold-which-follows-one-work-item.md` — proposed; the owner ratifies it.

## Supersessions

- none

## Validation

```sh
$ mise run docs-check
```
