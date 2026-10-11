# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-11
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `scoped-agent-knowledge`

## In-Force ADR Context Reviewed

- `adr-0003-the-unit-of-work-is-the-work-item.md` — work creates work; notes are shared under the root.
- `adr-0009-one-tenant-per-agency.md` and `adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md` — Tenant and Client boundaries, Ploeg checks again, absent looks like forbidden.
- `adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md` — write tools need confirmation; Runs get no MCP server.
- `adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md` — unfold-mcp is where session tools go; `untrusted` wrapping.
- `adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md` — this change's form.

Proposed records this change builds on: ADR-0021 (knowledge base as OKF).

## Repository-Level ADRs Created

- `docs/adr/adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md`
- `docs/adr/adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp.md`

Ploeg's records: ADR-0085 to ADR-0087 in ploeg-hq pull request #107.

## Supersessions

- none recorded yet. ADR-0034 replaces ADR-0021 once the owner accepts it; both are proposed, so ADR-0021 keeps its status until then.

## Validation

```sh
$ mise run docs-check
```

## Notes

Both records stay `proposed`; the owner accepts or rejects them (VIK-2004).
