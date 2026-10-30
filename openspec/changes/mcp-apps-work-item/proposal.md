# MCP Apps: an interactive Work Item card in AI clients

## Why

`unfold_now` and `unfold_get_work` answer with text and structured content.
A client that renders MCP Apps (Claude, ChatGPT, VS Code) can show the same
answer as a card that a person reads at a glance and acts on, without the
model retelling it. MCP Apps is an open MCP extension, so one implementation
reaches every client that speaks it (system ADR-0050 rule 2).

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- `unfold-mcp` serves two MCP Apps UI resources, `ui://unfold/work-item` and
  `ui://unfold/now`. Each is self-contained HTML with Unfold's design tokens,
  no network access and a strict Content Security Policy.
- `unfold_get_work` and `unfold_now` name their UI resource in
  `_meta.ui.resourceUri`, but only for clients that declare the
  `io.modelcontextprotocol/ui` extension.
- From the card, a person can ask a question, answer the question a Work Item
  waits on, leave a note and approve a proposal. Each of these calls an
  existing tool through the host's `tools/call` bridge, and each asks the
  person to confirm exactly as the tool does when the model calls it.
- The extension is negotiated on both transports and on every revision
  `unfold-mcp` speaks. A client that does not declare it gets today's answers
  byte for byte.

## Non-goals

- UI for any other tool, or a tool visible to the app only (`["app"]`).
- Display modes other than inline, and host style variables beyond the light
  or dark theme.
- A confirmation inside the card. The card never confirms for the person.
- Listing `unfold-mcp` over HTTPS for editors (ADR-0011 stands).

## Capabilities

### New Capabilities

- `mcp-apps`: which UI `unfold-mcp` serves to which client, what that UI may
  load, and how its actions reach the person's confirmation.

### Modified Capabilities

None.
