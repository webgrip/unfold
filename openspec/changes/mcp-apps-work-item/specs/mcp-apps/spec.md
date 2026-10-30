# MCP Apps

## ADDED Requirements

### Requirement: The extension is negotiated

`unfold-mcp` SHALL treat a client as supporting MCP Apps only when its
capabilities list `text/html;profile=mcp-app` in
`extensions["io.modelcontextprotocol/ui"].mimeTypes`. For the 2025 revisions
these are the capabilities of `initialize`; for 2026-07-28 they are the
capabilities in the request's `_meta`. To such a client, `unfold-mcp` SHALL
advertise `extensions["io.modelcontextprotocol/ui"]` and `resources` in
`initialize` or `server/discover`.

#### Scenario: A 2026-07-28 client declares the extension on one request only

- **WHEN** one `tools/list` request declares the extension and the next one does not
- **THEN** only the answer to the first names UI resources

### Requirement: A client without the extension sees no change

For a client that does not declare the extension, every answer SHALL be
byte-identical to the answer without MCP Apps support: no `resources`
capability, no `_meta` on tools, and `-32601` for `resources/list` and
`resources/read`.

#### Scenario: Claude Code over stdio

- **WHEN** a client initializes without `extensions`
- **THEN** `initialize`, `tools/list` and `tools/call` answer exactly as before

### Requirement: UI resources are self-contained

`ui://unfold/work-item` and `ui://unfold/now` SHALL each be one HTML5
document of MIME type `text/html;profile=mcp-app`, with every script and
style inline. They MUST NOT reference an external URL or open a network
connection. Each SHALL carry a Content Security Policy with
`default-src 'none'` and `connect-src 'none'`, and each resource SHALL declare
no CSP domains.

#### Scenario: Reading the Work Item resource

- **WHEN** a capable client reads `ui://unfold/work-item`
- **THEN** it gets the document, and the document names no `http:`, `https:` or protocol-relative URL

### Requirement: Untrusted text stays text

The view SHALL insert titles, questions, answers and Run summaries as text,
never as markup. It SHALL open only `http:` and `https:` links, and only
through the host's `ui/open-link`.

#### Scenario: A title with markup

- **WHEN** a Work Item's title is `<img src=x onerror=alert(1)>`
- **THEN** the card shows those characters and creates no element

### Requirement: Actions from the view confirm like the tool

An action from the view that spends money or changes work SHALL call the
action tool through the host's `tools/call`. It SHALL reach the person's
confirmation exactly as the model's call does. The view MUST NOT send
`inputResponses` or `requestState`, and MUST treat a returned
`input_required` as not confirmed. Nothing is spent or changed before the
person accepts. A restart forgets a pending confirmation, so a retry asks
again. A cancel changes nothing.

#### Scenario: Asking a model from the card

- **WHEN** a person asks a question the record does not answer and picks "Ask a model"
- **THEN** the tool asks them to confirm the spend, and nothing is spent until they accept
