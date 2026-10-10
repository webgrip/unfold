---
status: accepted
date: 2026-10-10
decision-makers: Ryan Grippeling
---

# Unfold also serves its own read-only MCP tools, next to ploeg-mcp

## Context and Problem Statement

[ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) put the only MCP server on Ploeg's operator API, and rejected a server inside the Unfold application. Since then, more of what a person asks about lives only in Unfold. Unfold decides why a Work Item waits and what fixes it (`public/core/reasons.js`), owns the Run card ([ADR-0030](adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md)), and runs workbench sessions. Ploeg names none of its consumers ([Ploeg ADR-0069](../../apps/ploeg/docs/adrs/0069-ploeg-names-none-of-its-consumers.md)), so `ploeg-mcp` can say a Work Item is `needs_human` and quote Ploeg's close reason. It cannot say what Unfold says next: "Budget held, not spent. Find out why those Runs failed first." On 2026-10-10 the owner asked for MCP access to both. Where does Unfold's part live?

## Decision Drivers

* A person asks their own AI client "why does Work Item 184 wait, and what do I do?" and gets the answer the Unfold page gives.
* Unfold ships no production npm dependencies ([Unfold ADR-0002](../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md)).
* The reason and fix are computed once, by the code the browser uses.
* The server reads as the person, with that person's Teams, never with an operator token.

## Considered Options

* A separate `unfold-mcp` process in the Unfold application that reads Unfold's HTTP API with the person's editor credential
* Only `ploeg-mcp`, with Unfold's reasons moved into Ploeg
* An MCP route inside Unfold's HTTP server

## Decision Outcome

Chosen option: "A separate `unfold-mcp` process", because it gives the client Unfold's own reasons and fixes without a dependency, without a new server route, and without giving Ploeg a consumer's vocabulary.

* `apps/unfold/src/mcp.ts` implements MCP over newline-delimited stdio JSON-RPC by hand: `initialize` (revisions 2025-11-25, 2025-06-18 and 2025-03-26), `ping`, `tools/list` and `tools/call`. `npm run mcp` starts it.
* It reads `UNFOLD_URL` and `UNFOLD_TOKEN`, an editor credential ([Unfold ADR-0037](../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)). `npm run mcp -- login` runs the editor sign-in and prints the credential. The person approves it in the browser, and can revoke it there.
* Four read-only tools: `unfold_now`, `unfold_find_work`, `unfold_get_work` and `unfold_sessions`. Each waiting Work Item carries the reason, chip, sentence and fix from `listReason` and `detailReason`, the same functions Now and the Work Item page use, and a link to its Unfold page.
* Text from trackers and agents sits under `untrusted`. A demo answer says it is the demo and invents no spend.
* `ploeg-mcp` stays as [Ploeg ADR-0081](../../apps/ploeg/docs/adrs/0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp.md) records it: Ploeg's facts for any consumer, under the operator token. ADR-0011's tool names become `ploeg_*` for that reason.
* ADR-0011's other rules still hold for both servers: read first, Runs get neither server, and write tools need a person's confirmation. Neither server has write tools yet.

### Consequences

* Good, because a client gets the same verdict and fix as the Unfold page, from the same code.
* Good, because the person's own Teams and revocation apply; no shared token sits on a laptop.
* Bad, because two MCP servers exist, and a person who wants both registers both.
* Bad, because the hand-written protocol covers only the old `initialize` handshake over stdio. A client that only speaks the stateless 2026-07-28 revision cannot use `unfold-mcp` until it gains `server/discover`.
* Bad, because the editor credential is labelled "VS Code" in the credential list until the sign-in takes a client name.

### Confirmation

`apps/unfold/test/mcp.test.ts` drives every tool against the demo application and a live application with an editor credential. It covers the stdio framing, a refused token that never appears in the answer, a timeout, a redirect and an unreachable server. `mise exec -- npm test` runs it.

## Pros and Cons of the Options

### Only ploeg-mcp, with Unfold's reasons moved into Ploeg

* Good, because one server.
* Bad, because it puts a consumer's words and fixes into Ploeg, against Ploeg ADR-0069, and duplicates the browser's code.

### An MCP route inside Unfold's HTTP server

* Good, because no extra process and no port-forward.
* Bad, because a remote MCP route needs the OAuth resource-server work ADR-0011 left for phase 3, and a public route without it would accept long-lived bearer credentials from anywhere.

## More Information

* Amends ADR-0011's "where": Unfold's own facts come from `unfold-mcp`, and Ploeg's facts come from `ploeg-mcp`.
* How-to: [Ask Unfold and Ploeg from an AI client](../how-to/ask-from-an-ai-client.md).
