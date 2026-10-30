# Design — mcp-apps-work-item

## Context

- MCP Apps stable spec 2026-01-26 (`modelcontextprotocol/ext-apps`,
  `specification/2026-01-26/apps.mdx`):
  - The extension id is `io.modelcontextprotocol/ui`.
  - A UI resource is a `ui://…` URI with MIME type `text/html;profile=mcp-app`.
  - A tool names its UI resource in `_meta.ui.resourceUri` on its `tools/list`
    entry. The spec defines no UI link on a tool result.
- The core extensions page (`docs/extensions/overview.mdx`) negotiates an
  extension under `capabilities.extensions`:
  - for the 2025 revisions, in `initialize`;
  - for 2026-07-28, in each request's
    `_meta["io.modelcontextprotocol/clientCapabilities"]` and in the
    `server/discover` result.
- System ADR-0037 and the confirmation flow in `src/mcp.ts`: every action tool
  confirms through elicitation, and the confirmation is sealed to the person,
  the tool and its arguments.

## Decisions

- **D1 Negotiation per call.** A client supports MCP Apps when its
  capabilities list `text/html;profile=mcp-app` under
  `extensions["io.modelcontextprotocol/ui"].mimeTypes`. A 2025 client's
  capabilities are read from `initialize`; a 2026-07-28 client's from the
  request itself. A client without the extension gets the same answers as
  before this change:
  - `initialize`, `server/discover`, `tools/list` and `resources/*` answer as
    they did;
  - there is no `resources` capability and no `_meta` on tools;
  - `resources/list` and `resources/read` answer `-32601`.
- **D2 Both meta keys.** A tool carries `_meta.ui.resourceUri` and also the
  deprecated `_meta["ui/resourceUri"]`. The reference SDK's `registerAppTool`
  writes both, so hosts built before the nested key still find the resource.
- **D3 One view, two resources.**
  - Both resources serve the same script and styles. The root element's
    `data-view` attribute picks the Now list or the Work Item card.
  - The HTML is assembled at start-up from `public/styles/tokens.css`,
    `public/mcp-apps/view.css` and `public/mcp-apps/view.js`, so the card
    follows the browser's brand tokens.
- **D4 Content Security Policy.**
  - The resource declares an empty `_meta.ui.csp`, so hosts apply the spec's
    restrictive default (`connect-src 'none'`).
  - The HTML also carries its own policy in a `<meta>` element, which narrows
    any host policy further: `default-src 'none'`, `connect-src 'none'`,
    `form-action 'none'`, `base-uri 'none'`, `frame-src 'none'` and
    `object-src 'none'`.
  - Inline script and style stay allowed, because hosts load the view from a
    string into a sandboxed iframe.
- **D5 Untrusted text.** Titles, questions, answers and Run summaries are
  inserted as text nodes and never parsed as HTML. Links open through
  `ui/open-link`, and only for `http:` and `https:` URLs.
- **D6 Confirmation stays with the tool.**
  - The view calls `tools/call` with only `name` and `arguments`. It never
    sends `inputResponses` or `requestState`.
  - An `input_required` result handed back to the view counts as "not
    confirmed".
  - The host's own MCP client answers the elicitation, as it does for a call
    the model makes. A host that cannot is refused by the tool, which answers
    with the Unfold link.
  - Reads call read-only tools directly: refresh, open a Work Item from the
    Now list, and a free Ask answered from the record.
- **D7 Caching.** `tools/list` and `server/discover` stay `cacheScope:
  "public"`, because they hold no one's personal data. If a cache hands the UI
  metadata to a client without the extension, no harm follows: that client
  ignores `_meta`.

## Risks

- A host may run the view's `tools/call` without forwarding the elicitation.
  The tool then refuses with the link, and nothing changes.
- The how-to tracks which clients support MCP Apps. Only support read on a
  primary source is marked verified there.
