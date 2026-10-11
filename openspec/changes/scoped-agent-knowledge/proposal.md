# Scoped agent knowledge

## Why

The owner asked on 2026-10-11: "I want my agents to write per ticket / client /
project / org to Omnigraph." ADR-0021 (proposed) gives each Tenant one graph
and holds every learning back for review; nothing models Client, repository or
Work Item scope, agents cannot write anything a later Run reads without a
person in between, and interactive sessions have no path to the knowledge at
all.

Application: the system docs (decisions and design across Ploeg and Unfold),
with the Unfold application's part in `apps/unfold` (unfold-mcp tools and the
review surface). Ticket: VIK-2004, epic VIK-1858.

## What Changes

- **System ADR-0034 (proposed)**: knowledge has four scopes (Tenant, Client,
  repository, Work Item) in two Omnigraph graphs per Tenant. Work Item Notes
  are written without review and read under the same root; a wider scope is a
  Promotion a Tenant admin accepts. Replaces ADR-0021 once accepted.
- **System ADR-0035 (proposed)**: interactive sessions reach Tenant knowledge
  only through unfold-mcp, which asks Ploeg for the signed-in person.
- **Ploeg's part** is ploeg-hq's change `scoped-knowledge-and-work-item-notes`
  (Ploeg ADR-0087 to ADR-0089, pull request #107). It lands there first; Unfold
  only moves the pin.
- **Unfold application, later**: knowledge tools in unfold-mcp (VIK-2007), and
  the Work Item page and review queue for notes and Promotions (VIK-1868).
- The knowledge RFC records the owner's decisions of 2026-10-11.

## Capabilities

### New Capabilities

- `agent-knowledge-scopes`: which knowledge each agent and person reads and
  writes, and what enforces it.
- `session-knowledge`: knowledge tools for interactive sessions in
  unfold-mcp.

### Modified Capabilities

None.

## Non-Goals

- Production desired state: graphs, actors, policies, stored queries and
  External Secrets are filed on the Homelab Roadmap (VIK-1872) and change only
  in that repository.
- Tenant and Client in Ploeg and Unfold (ADR-0017: VIK-1876, VIK-1877). Until
  they land, everything is the default Tenant without Clients.
- Selection quality and the measurement spike (VIK-1859, VIK-1860).
- Pull requests to a repository's `knowledge/` directory from a Promotion; the
  2026-10-04 answer keeps them optional.

## Impact

- Docs: `docs/adr/` (two records, index, ADR-0021 history line),
  `docs/research/2026-10-04-rfc-agent-knowledge.md`.
- Later code: `apps/unfold/src/mcp.ts` and the Ploeg client for the new
  operator routes; the Ploeg pin once ploeg-hq releases them.
