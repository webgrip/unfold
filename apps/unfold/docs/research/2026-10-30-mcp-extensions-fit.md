# MCP extensions against Unfold and Ploeg: Tasks now fits, the rest borders us

Research date: 2026-10-30. The owner asked for a full exploration of every extension on [modelcontextprotocol.io/extensions/overview](https://modelcontextprotocol.io/extensions/overview): what Unfold and Ploeg can integrate with, what borders them, and what to leave alone. This dossier follows the MCP section of [the protocol-gap dossier](2026-10-13-protocol-integration-gaps.md#mcp), which read the extensions as they stood on 2026-10-13.

Sources:

- the [extensions overview](https://modelcontextprotocol.io/extensions/overview), the [client matrix](https://modelcontextprotocol.io/extensions/client-matrix) and its source [`client-matrix.mdx`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/extensions/client-matrix.mdx) with its commit history, because the rendered page drops the support marks;
- every `ext-` and `experimental-ext-` repository in the [modelcontextprotocol organisation](https://github.com/modelcontextprotocol): the specification files, READMEs, decision logs, implementation lists, releases and contributors;
- the [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md), the [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [Go SDK](https://github.com/modelcontextprotocol/go-sdk) pull requests for each extension, and [Authentik's token-exchange documentation](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/token_exchange/);
- this repository at `origin/development` `5b5e16f0`, with Ploeg's contract bundle at 0.2.0-rc.97 (`10911fdc`).

**Method.** One researcher read the specifications first-hand and mapped them onto [`mcp.ts`](../../src/mcp.ts), [`mcp-http.ts`](../../src/mcp-http.ts), [`mcp-apps.ts`](../../src/mcp-apps.ts) and [`ploeg-mcp`](../../../ploeg/cmd/ploeg-mcp/main.go). No subagents ran. Claims about client support come from the matrix source and a changelog, not from a client we drove; that limit is listed under [Not verified](#not-verified).

**Landing.** `AGENTS.md` has no protocol-research contract block, so the destinations follow the earlier dossiers: this dossier, a dated re-survey on the MCP row of [the protocol ledger](2026-09-11-ecosystem-alternatives.md#appendix-adjacent-components-and-communication-protocols), and updated and new rows on [the watchlist](2026-10-13-protocol-integration-gaps.md#watchlist).

## Verdict

**Adopt the Tasks extension in `unfold-mcp` for a hand-off, keep MCP Apps as built, and adopt nothing else now.** Watchlist trigger T5 fired on 2026-10-28: the matrix now marks Claude (web) and Claude Code as Tasks clients ([#3459](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3459)). Tasks models exactly what a Work Item already is, a long piece of work with a durable handle that sometimes waits for a person. Today a person who hands work off from Claude Code must poll `unfold_get_work` by hand. With Tasks, the Work Item shows up in Claude Code's own tasks panel and asks its question there. That is the one change in this sweep that people would notice.

The other ten extensions sort into three groups:

- **Built and correct.** MCP Apps (`io.modelcontextprotocol/ui`) has been served by `unfold-mcp` since [#722](https://forgejo.webgrip.dev/webgrip/unfold/pulls/722). Nothing to add.
- **Border us, wait.** Skills over MCP, Triggers and Events, trust and action annotations, the two auth extensions and Server Cards each touch a seam we own. In every case either no client people use implements it, or the specification is a draft skeleton. Each has a named trigger below.
- **Ignore.** Interceptors, Variants, Filesystems and File Uploads claim seams Unfold and Ploeg do not have, or have no specification text yet.

Maturity killed none of the "wait" items on its own. Client absence killed four (Skills, both auth extensions, Server Cards). Draft status killed three (Events, trust annotations, action metadata).

## 1. What MCP extensions are

The overview defines an extension as an optional addition "that define[s] capabilities beyond the core protocol", named `{vendor-prefix}/{extension-name}`, with `io.modelcontextprotocol` for official ones. Extensions became part of the protocol in `2026-07-28`.

- **Negotiation.** A `2026-07-28` client lists the extensions it supports in `_meta["io.modelcontextprotocol/clientCapabilities"].extensions` on every request. A server lists its own in `capabilities.extensions` of the `server/discover` result. Older revisions carry the same field through `initialize`, outside the published schema.
- **Opt-in always.** "Extensions are always disabled by default and require explicit opt-in from the developer, at every stage." A side that supports an extension the other lacks falls back to core behaviour, or refuses if the extension is mandatory.
- **Lifecycle** ([SEP-3392](https://modelcontextprotocol.io/seps/3392-extension-lifecycle)). Experimental (anything may change, "implementers should pin to a tag or commit"), Beta (an Extensions Track SEP, one reference implementation in an official SDK, breaking changes rare and signalled by a `revision` string), Stable (a second SEP, two interoperating implementations and a conformance scenario; revisions keyed to core protocol revisions and immutable). A Beta extension may instead be promoted into the core specification.
- **Where they live.** Official extensions sit in `ext-*` repositories, with the stage visible in the directory (`specification/experimental|beta|stable/`). Incubation repositories carry the `experimental-ext-` prefix and need a Working Group or Interest Group behind them.

`unfold-mcp` already negotiates this way: [`mcp.ts`](../../src/mcp.ts) reads the per-request client capabilities and [`mcp-apps.ts`](../../src/mcp-apps.ts) advertises `io.modelcontextprotocol/ui`. Adding an extension is therefore a wire change, not a framework change. `unfold-mcp` is hand-written and needs no SDK release. `ploeg-mcp` is on the Go SDK, which so far ships none of these extensions ([Tasks #1335](https://github.com/modelcontextprotocol/go-sdk/pull/1335) and [Skills #1238](https://github.com/modelcontextprotocol/go-sdk/pull/1238) are open).

## 2. The inventory

Stage is as the repository's directory states it; the overview page's stage is given where they differ. "Clients" lists clients the matrix marks for the extension that people in this project use or will use.

| Extension | Identifier | Stage | Governance and activity | Clients people use | What it is |
| --- | --- | --- | --- | --- | --- |
| [OAuth Client Credentials](https://modelcontextprotocol.io/extensions/auth/oauth-client-credentials) | `io.modelcontextprotocol/oauth-client-credentials` | Stable, revision `2026-07-28` | [ext-auth](https://github.com/modelcontextprotocol/ext-auth), contributors from Anthropic, Okta, Microsoft and Stytch | none (only `mcpc`) | OAuth 2.1 client credentials for machine-to-machine access, client secret or RFC 7523 JWT; no DCR |
| [Enterprise-Managed Authorization](https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization) | `io.modelcontextprotocol/enterprise-managed-authorization` | Stable, revision `2026-07-28` | ext-auth | none (`mcpc`, Archestra) | The client exchanges the person's SSO ID token at the enterprise IdP for an Identity Assertion JWT Authorization Grant (ID-JAG, RFC 8693 then RFC 7523), so the IdP decides which MCP servers a person may use |
| [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) | `io.modelcontextprotocol/ui` | Stable | [ext-apps](https://github.com/modelcontextprotocol/ext-apps), `@modelcontextprotocol/ext-apps` v2.0.4 (2026-10-27), 3,000+ stars | Claude web and Desktop, VS Code Copilot, M365 Copilot, ChatGPT, Cursor, Goose; **not** Claude Code | A tool points at a `ui://` HTML resource rendered in a sandboxed iframe |
| [Tasks](https://modelcontextprotocol.io/extensions/tasks/overview) | `io.modelcontextprotocol/tasks` | Beta, destination Core | [ext-tasks](https://github.com/modelcontextprotocol/ext-tasks), `@modelcontextprotocol/ext-tasks` 0.2.2 | **Claude web, Claude Code** (since 2026-10-28), MCPJam | A `tools/call` may return a durable task handle; the client polls `tasks/get`, answers `input_required` through `tasks/update`, stops it with `tasks/cancel` |
| [Skills over MCP](https://modelcontextprotocol.io/extensions/skills/overview) | `io.modelcontextprotocol/skills` | Beta, destination not stated; [SEP-2640](https://modelcontextprotocol.io/seps/2640-skills-extension) Final | [ext-skills](https://github.com/modelcontextprotocol/ext-skills), Skills Over MCP WG; TypeScript SDK v2.4.0 ships it, Go SDK in progress | ChatGPT (partial, snapshot at plugin submission); VS Code only "planned" ([#338300](https://github.com/microsoft/vscode/issues/338300)) | `skills/list`, `skills/get`, `skill://` resources with per-file digests |
| [Server Cards](https://modelcontextprotocol.io/seps/2127-mcp-server-cards) | none yet; [SEP-2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) | overview says Beta, the [repository](https://github.com/modelcontextprotocol/ext-server-card) says Experimental and "not an accepted or official MCP extension" | four contributors | none | A public JSON card at `<mcp-url>/server-card`, listed from `/.well-known/ai-catalog.json`, describing a remote server before connecting |
| [Interceptors](https://github.com/modelcontextprotocol/experimental-ext-interceptors) | SEP-2624 | Experimental | Interceptors WG; C# in progress, Go, Python and TypeScript "Planned" | none | Validators and mutators, deployed as MCP servers, that check or rewrite tool calls, resources and prompts at defined hooks |
| [Variants](https://github.com/modelcontextprotocol/experimental-ext-variants) | SEP-2053 | Experimental | three contributors; all SDKs "Planned" | none | One server presents different tool sets or descriptions per model family, context budget or API version |
| [Tool annotations](https://github.com/modelcontextprotocol/experimental-ext-tool-annotations): trust annotations and action metadata | `io.modelcontextprotocol/trust-annotations`, `io.modelcontextprotocol/action-metadata` | Experimental, "draft skeleton" | Tool Annotations IG, one contributor | none | Two booleans on results, `sensitive` and `untrusted`, plus an `evidenceRef`; and a static contract on a tool for where its inputs go and what it can cause |
| [Triggers and Events](https://github.com/modelcontextprotocol/experimental-ext-triggers-events) | none yet | Experimental, a [design sketch](https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/main/docs/design-sketch-proposal.md) | WG led by AWS and Anthropic | none | `events/list`, then poll, a push stream or a webhook subscription signed as **Standard Webhooks**, with cursors and replay |
| [Filesystems](https://github.com/modelcontextprotocol/experimental-ext-filesystems), [File Uploads](https://github.com/modelcontextprotocol/experimental-ext-file-uploads) | none | Experimental | Filesystems has a problem statement only; File Uploads is an empty README | none | Scoped listing, search and writes on resources; file uploads to tools |

**Absence checks.** No extension specification, decision log or implementation list mentions Ploeg, Unfold, AHP or Forgejo. No extension carries budget, spend, tenant or authority vocabulary; the auth extensions stop at "may this client call this server". Claude Code appears in the matrix for Tasks only, and its changelog records that it skips MCP Apps UI resources in resource lists.

## 3. Layer map

| Seam | What implements it today | Extension that claims it | Fit |
| --- | --- | --- | --- |
| A person follows one Work Item from an AI client | `unfold_get_work`, polled by hand | **Tasks** | **Adopt** |
| The Work Item shown as a card in a chat client | [`mcp-apps.ts`](../../src/mcp-apps.ts): `ui://unfold/work-item`, `ui://unfold/now` | MCP Apps | Built |
| A Team's skills reaching a person's own agent | Ploeg's digest catalogue ([Ploeg ADR-0092](../../../ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md), proposed) for Runs; [the Claude Code plugin](../../extensions/claude-code/plugin.json) for people | Skills over MCP | Wait (T10) |
| An agent reacting to "a Work Item needs you" without polling | outbound CloudEvents over Standard Webhooks ([outbound events](../operations/outbound-events.md)); the Claude Code channel in the plugin | Triggers and Events | Wait (T29) |
| Marking tracker and agent text as untrusted | an `untrusted` sub-object on every tool result, explained in the server instructions ([`mcp.ts`](../../src/mcp.ts)) | trust annotations | Wait (T30) |
| Saying what an action tool does before a person confirms it | `readOnlyHint`/`destructiveHint` plus a confirmation on every action ([Ploeg ADR-0108](../../../ploeg/docs/adrs/0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md)) | action metadata | Wait (T30) |
| A person signs in to a remote MCP server | Authentik OAuth resource server in [`mcp-auth.ts`](../../src/mcp-auth.ts) and `ploeg-mcp`'s HTTP mode | core MCP authorization | Built |
| An agency's IdP decides which MCP servers its people use | **nobody** | Enterprise-Managed Authorization | Wait (T31) |
| A program without a person reads Unfold | **nobody** over MCP; the HTTP API with a token | OAuth Client Credentials | Wait (T32) |
| Discovering a hosted Unfold endpoint | **nobody**: no hosted offering | Server Cards | Wait (T33) |
| Policy on tool calls inside a Run | Ploeg's LiteLLM gateway ([Ploeg ADR-0078](../../../ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md)) | Interceptors | Ignore (T34) |
| Different tool text per model | **nobody**, and no need measured | Variants | Ignore |
| Files on resources, uploads into tools | **nobody** | Filesystems, File Uploads | Ignore |

Two seams nobody claims: the agency's IdP deciding MCP access, and a non-person reader. Both are agency-phase needs ([Who Unfold is for](../../../../docs/concepts/who-unfold-is-for.md)) and neither has a client that people use.

## 4. Extension by extension

### Tasks: adopt in `unfold-mcp`

**What changed.** On 2026-10-13 no client in the matrix implemented Tasks, so [ADR-0011](../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) excluded it ("does not use the MCP Tasks extension") and watchlist item T5 named the trigger: Claude, ChatGPT or VS Code under Tasks. MCPJam was added on 2026-10-06; Claude (web) and Claude Code on 2026-10-28, requested by an MCP lead maintainer ([#3459](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3459)). Claude Code's changelog is consistent with that: long-running MCP tool calls move to the background, show in the tasks panel and can be stopped from there.

**How a Work Item maps onto a task.**

| Task | Unfold |
| --- | --- |
| `tools/call` returns `resultType: "task"` | `unfold_hand_off`, after the person confirmed it, returns a task instead of its synchronous summary, but only to a client that declared the extension on that request |
| `taskId` | An unguessable sealed value over the Work Item id, the person and the Tenant. `tasks/get` re-derives the Work Item from it, so the server stays stateless, as ADR-0011's build guide requires, and adds no store |
| `working` with `statusMessage` | The Work Item's state and the "why it waits" sentence `unfold_now` already writes |
| `input_required` with `inputRequests` | The Work Item waits on a person's answer (`needs_human` with a question). The question goes out as the same elicitation `unfold_answer_question` uses; the answer comes back through `tasks/update` and takes the same confirmed path |
| `completed` with `result` | A review-ready pull request or a terminal state, as a full `CallToolResult`: link, outcome and spend. A Work Item that ends without a pull request is still `completed`, with the reason in the result; `failed` is reserved for JSON-RPC errors, as the specification requires |
| `tasks/cancel` | **Stops following, never stops paid work.** See the tension below |
| `ttlMs`, `pollIntervalMs` | `null` or several days, since Work Items run for hours; a poll interval of tens of seconds |

**The tension.** `tasks/cancel` arrives as a protocol request with no confirmation round, from a tasks panel or from the model. Stopping a Work Item is an action that needs the person's confirmation ([Ploeg ADR-0108](../../../ploeg/docs/adrs/0108-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md), [Ploeg ADR-0152](../../../ploeg/docs/adrs/0152-ploeg-mcp-signs-each-confirmation-and-acts-on-it-once.md)), and the rejected shapes of the protocol-gap dossier forbid Tasks starting paid work without a person. The shape that keeps both: `tasks/cancel` ends the task handle with `statusMessage` saying the Work Item still runs and that `unfold_stop_work` stops it, with confirmation. Unfold's rule that a cancel never becomes an automatic retry is untouched, because nothing in Ploeg changes.

**Cost and order.** Three JSON-RPC methods and one result shape in a hand-written server, about S to M. It reverses one line of ADR-0011, so it needs an owner decision recorded as a dated amendment or a new system ADR before code. Ploeg changes nothing: `ploeg-mcp` could later return a task from its own propose tool, as a generic capability, once the Go SDK ships the extension.

### MCP Apps: built, keep the text whole

`unfold-mcp` serves a Work Item card and a "what waits for you" view ([`mcp-apps.ts`](../../src/mcp-apps.ts), #722). The extension is Stable and reaches every chat client people use except Claude Code, which runs in a terminal. So the rule ADR-0011's build guide already sets matters here: `content` and `structuredContent` each carry the full answer, and the card adds nothing a terminal user lacks. No change.

### Skills over MCP: borders Ploeg's catalogue, wait

The model is close to [Ploeg ADR-0092](../../../ploeg/docs/adrs/0092-a-team-pins-its-skills-in-a-catalogue-that-ploegd-fetches-once-and-serves-by-digest.md): skills served by name with a digest per file. ADR-0092 asks that "a developer can install exactly what the agents get", and a Team's catalogue served over `ploeg-mcp` would do that without a second install step. Two things block it: neither Claude Code nor VS Code consumes the extension (VS Code lists it as planned), and the Go SDK has no release with it. The [Claude Code plugin](../../extensions/claude-code/plugin.json) already carries Unfold's skills to people. T10 stays as written, with a Ploeg-side prerequisite added. Because Ploeg knows no consumer ([ADR-0050](../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md)), a skills endpoint would be a Ploeg contract that any client may read, not an Unfold feature.

### Triggers and Events: we already speak its webhook format, wait

The design sketch signs webhook deliveries as a Standard Webhooks profile, plus one `X-MCP-Subscription-Id` header, with client-supplied `whsec_` secrets, TTL-bound subscriptions and cursor replay. Unfold's outbound events already deliver CloudEvents signed as Standard Webhooks from a durable outbox ([outbound events](../operations/outbound-events.md)), and intake verifies the same scheme ([`signatures.ts`](../../src/intake/signatures.ts)). If the extension lands, an `events/list` of "Work Item needs you", "pull request ready" and "Run finished" on `unfold-mcp` is a mapping onto the outbox, not a second delivery system. It is a sketch with no SEP and no client, so nothing is built. One cheap guard follows now: keep the outbound delivery strictly Standard Webhooks-conformant, without Unfold-only signature variations.

### Trust annotations and action metadata: our pattern, not yet a standard

Unfold and Ploeg mark tracker and agent text with an `untrusted` sub-object and tell the client in the server instructions to treat it as data. The trust-annotations draft defines exactly that signal, `untrusted: true`, as one of two booleans on a result or a content block, with richer detail behind an `evidenceRef`. Its granularity is coarser than ours: it marks a whole result, while ours marks fields. Action metadata describes what a tool does with data before it is called, the static half of what Ploeg ADR-0108's confirmation shows a person. Both are draft skeletons with one contributor. Adding the `_meta` key costs a few lines but would bind us to a shape the README says may vanish. Wait for T30. Describing our field-level pattern to the Interest Group would be an outward-facing step, so it is left as an owner decision.

### Enterprise-Managed Authorization: the agency feature, wait

This is the extension an agency's administrator would want: their IdP grants or withholds Unfold per person, and people never click "connect". It needs three parties to support it: the client, the IdP and Unfold's authorization server. Only `mcpc` and Archestra do on the client side. Authentik documents RFC 8693 token exchange, including on-behalf-of since 2026.8.0, but nothing for ID-JAG, and Unfold's resource server delegates to Authentik. Wait for T31.

### OAuth Client Credentials: no one asked, wait

A program without a person, such as an agency's dashboard or an n8n flow, could read Unfold over MCP with a pre-registered client. Authentik supports the grant. Under ADR-0011 and Ploeg ADR-0108, such a principal could only ever hold the read toolset, because every action needs a person. The HTTP API ([OpenAPI](../contracts/openapi.yaml)) already serves that reader. Wait for T32.

### Server Cards: nothing to discover yet

A card describes a public remote server for discovery. Unfold has no hosted offering, and the self-hosted endpoints are behind each installation's sign-in. The overview and the repository disagree on its stage. Wait for T33.

### Interceptors, Variants, Filesystems, File Uploads: ignore

- **Interceptors** would let a third party validate or rewrite tool calls. The place that needs this is a Run's tool calls, and Ploeg already bounds those at the LiteLLM gateway (Ploeg ADR-0078). The extension would add a second policy point that Ploeg does not control. Only a C# implementation is in progress. T34 records when to look again.
- **Variants** solves tool descriptions that fail on some model families. No such failure has been measured on `unfold-mcp` or `ploeg-mcp`, and no SDK implements it.
- **Filesystems** and **File Uploads** have no specification text. Unfold's file-shaped surfaces, the Report a problem screenshots and intake attachments, go over HTTP.

## 5. Recommendations

1. **Decide on Tasks for hand-offs (owner).** Amend ADR-0011's "does not use the MCP Tasks extension" for `unfold_hand_off` under the mapping in [section 4](#tasks-adopt-in-unfold-mcp), with `tasks/cancel` that stops following and never stops paid work. Then build it in `unfold-mcp` behind a flag, with a test that a client without the extension gets today's synchronous result.
2. **Prove it in Claude Code before calling it supported.** The matrix and changelog are not a run. The acceptance check is a hand-off from Claude Code whose task shows in the tasks panel, asks a `needs_human` question there and completes with the pull request link. It needs no paid model: the deterministic demo's Work Items are enough.
3. **Keep MCP Apps' text fallback whole.** Claude Code, the most-used client, does not render the card.
4. **Keep outbound events strictly Standard Webhooks.** That keeps Triggers and Events a mapping later.
5. **Do not adopt the remaining extensions now.** Each has a trigger on the watchlist.
6. **Optional, outward-facing (owner):** describe the field-level `untrusted` pattern on [SEP-1913](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/1913) or in the Tool Annotations IG, since the draft only marks whole results.

## Watchlist changes

Recorded on [the watchlist](2026-10-13-protocol-integration-gaps.md#watchlist):

- **T5 fired** on 2026-10-28 (recommendations 1 and 2).
- **T10 re-confirmed, not fired.** Neither Claude Code nor VS Code is under Skills; prerequisite added: a Go SDK release with the extension, for `ploeg-mcp`.
- **New: T29–T34**, one row each for Triggers and Events, the two annotation drafts, Enterprise-Managed Authorization, Client Credentials, Server Cards and Interceptors.

## Not verified

- That Claude Code and claude.ai implement the Tasks *extension* on `2026-07-28` rather than only backgrounding slow tool calls. The matrix entry and the changelog support it; no client was driven against a task-returning server. Recommendation 2 is the check.
- Whether Claude Code surfaces `input_required` elicitation inside a task. The specification requires the same trust model as ordinary elicitation; client behaviour is unknown.
- Authentik support for ID-JAG: not found in its documentation on 2026-10-30, which is absence of evidence only.
