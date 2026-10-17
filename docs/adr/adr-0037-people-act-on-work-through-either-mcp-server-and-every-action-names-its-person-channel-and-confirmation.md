---
status: accepted
date: 2026-10-17
decision-makers: Ryan Grippeling
---

# People act on work through either MCP server, and every action names its person, channel and confirmation

## Context and Problem Statement

[ADR-0011](adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md) and [ADR-0032](adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md) made both MCP servers read-first; only `unfold_ask` can spend, after a confirmation. People also want to act from their AI client: hand work to a Team, approve, retry, stop and steer it. Today an action through Unfold runs as the signed-in person and Unfold passes that person to Ploeg, but nothing records which channel (browser, VS Code, an AI client) made it or what the person agreed to, and `ploeg-mcp` acts as a shared read-only account. Where may people act, and what must every action leave behind?

## Decision Drivers

* Ploeg is the open core; Unfold is the interface and integration layer on top of it (owner, 2026-10-17).
* Auditability is essential: every change names a person, a channel and what they agreed to.
* People get real freedom to act from the client they work in.
* A model never acts on its own.

## Considered Options

* Both servers act, under one attribution and confirmation rule
* Only `unfold-mcp` acts; `ploeg-mcp` stays read-only
* Only `ploeg-mcp` acts; `unfold-mcp` stays read-only

## Decision Outcome

Chosen option: "Both servers act, under one attribution and confirmation rule", because Ploeg must be operable on its own and Unfold adds its reasons, links and integrations on top.

* **Ploeg** records every operator action with its Operator Consumer, person, channel and confirmation, and `ploeg-mcp` acts over HTTP as the verified person ([Ploeg ADR-0106](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0106-every-operator-action-names-its-person-and-channel-and-an-mcp-action-needs-the-persons-confirmation.md)).
* **Unfold** records every action it takes or forwards, whatever the channel, in one Action Record: the person, the channel (`browser`, the editor credential's name such as `unfold-mcp on ryan-pc-mint`, or `mcp:<client name and version>`), the action and its target and inputs, the confirmation, the result, and the matching Ploeg audit id. It passes the channel and confirmation on to Ploeg.
* **First slice of actions**, on both servers: assign (hand a task to a Team), approve and reject a proposal, retry, stop, and steer (a note for the next Run, or a message, pause or resume for an attended session).
* **Every action that changes state asks the person first**, through an MCP elicitation stating the exact effect and any cost; a declined or unanswered confirmation changes nothing, and a client without elicitation is refused with a link to the page where the person can act. The browser keeps its own buttons and records `browser` as the channel.
* **Where the record shows**: on each Work Item's activity, and on a per-person Activity page; both can be exported.

### Consequences

* Good, because every change to work is traceable to a person, a channel and the text they agreed to, in Unfold and in Ploeg.
* Good, because people can act from whichever client they use, including without Unfold.
* Bad, because two MCP servers offer overlapping actions, so their wording and confirmation text must stay aligned.
* Bad, because an elicitation is shown by the person's client; a client that renders it without the person seeing it would weaken the confirmation (recorded as a re-evaluation trigger in Ploeg ADR-0106, [ploeg-hq #146](https://github.com/ploeg-hq/ploeg/pull/146)).

### Confirmation

Unfold tests assert an Action Record with person, channel, confirmation and result for each slice-1 action through the browser API and through `unfold-mcp`, that a declined confirmation records nothing as done and changes nothing, and that the channel reaches Ploeg. Ploeg's own tests confirm its side.

## More Information

* Owner's words, 2026-10-17: Ploeg "should be open. It's the core of this all. Unfold is the UI layer that also adds some integrations"; auditability is "super important"; people get "true freedom" to "assign, approve, retry, cancel and steer work".
* Amends ADR-0011 and ADR-0032: both servers now act, under this rule.
