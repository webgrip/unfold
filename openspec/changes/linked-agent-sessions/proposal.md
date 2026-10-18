# Linked agent sessions: Claude Code sessions on their Work Items

## Why

The owner asked on 2026-10-17: "I think I want to link my Anthropic account to
Unfold, so I can also just link my Claude Code sessions to certain issues etc.
Maybe even show it in a way that makes sense in the Unfold UI." From the
options researched that day, the owner chose: "I like Agent Trace, let's
implement that properly. I also want proper opentelemetry … I think 1 and 2
are great too". Here 1 is an MCP tool that links a session and 2 is a Claude
Code plugin with hooks.

Anthropic's terms forbid third-party apps from offering a claude.ai login or
holding Claude credentials. So linking a session goes through the person's
Unfold identity, never through their Claude account.

Application: `apps/unfold`. Ticket: VIK-2137.

## What Changes

- **Application ADR 0047 (proposed)**: Linked Sessions report through a Claude
  Code plugin and the person's editor credential. Each commit carries an Agent
  Trace 0.1 record. Telemetry is read from the estate's metrics and log stores.
  There is no Claude sign-in.
- A new domain term, **Linked Session**, in `docs/domain/model.yaml`.
- Routes under `/api/linked-sessions` and `/api/agent-trace` (API contract,
  section Linked Sessions).
- `unfold-mcp` gains `unfold_linked_sessions` (read) and
  `unfold_link_session` (changes a link, spends nothing).
- The Work Item page gains an **Agent sessions** card. New pages
  `#linked-session/<id>` and Settings › Agent sessions.
- A Claude Code plugin in `apps/unfold/extensions/claude-code`, listed by a
  marketplace at the repository root.
- A new configuration key, `observability.metricsUrl`.

## Capabilities

### New Capabilities

- `linked-sessions`: how a person's own agent session reports, is linked, is
  attributed and shows its telemetry.

### Modified Capabilities

None.
