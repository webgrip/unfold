---
status: proposed
date: 2026-10-11
decision-makers: Ryan Grippeling
---

# Interactive sessions reach Tenant knowledge only through unfold-mcp

## Context and Problem Statement

People work with agents outside Ploeg's Runs too: a Claude Code or Codex session next to the developer. The owner wants those sessions to read and write the same knowledge as Runs, with the same scopes ([ADR-0034](adr-0034-agent-knowledge-is-scoped-to-tenant-client-repository-and-work-item-in-two-graphs-per-tenant.md)). Omnigraph cannot limit an actor to one Client's rows, so a session holding its own graph token would read every Client of the Tenant. Which path does a session use?

## Decision Drivers

* A client user's session reaches only their Client's knowledge (ADR-0017).
* A session's machine holds no graph token.
* Session writes follow the same review line as Runs.
* Write tools need the person's confirmation ([ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md)).

## Considered Options

* Knowledge tools in unfold-mcp, which asks Ploeg for the signed-in person
* Knowledge tools in ploeg-mcp under the operator token
* A graph actor per session, straight to Omnigraph

## Decision Outcome

Chosen option: "Knowledge tools in unfold-mcp, which asks Ploeg for the signed-in person", because Unfold is the only component that knows the person, their Tenant, Client and role, and Ploeg can check that again without trusting a laptop.

* unfold-mcp ([ADR-0032](adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md)) gains `unfold_search_knowledge` and `unfold_read_knowledge`, and two write tools: `unfold_write_note` (a Work Item Note on a Work Item the person can see) and `unfold_suggest_promotion` (a Promotion request). Write tools are marked as writes so the client asks the person first.
* Unfold resolves the person from the editor credential (Unfold ADR-0037) and their SSO groups, and calls Ploeg's operator knowledge routes naming the person, role and Client (Ploeg ADR-0089). Ploeg applies the scopes.
* Text that agents or trackers wrote stays under `untrusted` in every answer.
* ploeg-mcp gains no knowledge tool: its operator token names no person.
* No Omnigraph URL or token is part of any session's configuration.

### Consequences

* Good, because sessions and Runs share one store, one scope filter and one review line.
* Good, because what a person learns in a session reaches the next Run of that Work Item.
* Bad, because session knowledge depends on the tenancy work (VIK-1876, VIK-1877); until then only the owner's default Tenant has it.
* Bad, because unfold-mcp gains its first write tools.

### Confirmation

Proposed checks, none built yet: the unfold-mcp tests of VIK-2007 against a fake Ploeg (a client user never gets another Client's object; a write without confirmation never reaches Ploeg; no Omnigraph setting in the configuration), in `mise run verify`.

## Pros and Cons of the Options

### Knowledge tools in ploeg-mcp under the operator token

* Good, because ploeg-mcp already talks to the operator API.
* Bad, because the token names no person, so a client user and a Tenant admin look the same.

### A graph actor per session, straight to Omnigraph

* Good, because no service sits in between.
* Bad, because the actor reads the whole Tenant graph and the token sits on a laptop.

## More Information

* Design: `openspec/changes/scoped-agent-knowledge/`; ticket VIK-2007; Ploeg's side VIK-2006.
* 2026-10-11 — Proposed after the owner chose sessions through Unfold's MCP server.
* 2026-10-11 — Owner answers: a session note reaches Runs at once; a Tenant member's Promotion request waits for an admin. Kept proposed until the measurement spike (VIK-1859) reports.
