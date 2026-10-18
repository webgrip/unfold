---
status: proposed
date: 2026-10-18
decision-makers: Ryan Grippeling
review-by: 2027-01-18
---

# The Agents window has an Unfold chat that reads, and acts only after you confirm

## Context and Problem Statement

In the VS Code Agents window, Unfold offers one agent, "Unfold teams". Every message there starts a paid Team session, and a short message such as "test" is refused as too thin a brief (`objective_too_thin`). On 2026-10-18 the owner said: "I need to be able to use this interface to chat with unfold. Maybe there needs to be some kind of normal chat interface there with access to mcp".

Ploeg authorizes every model call ([system ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)). The Ask ([system ADR-0031](../../../../docs/adr/adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md)) already pays one question about one Work Item from a Team's Ask Allowance, and `unfold-mcp` ([ADR 0012](0012-agent-host-protocol-host.md#update-2026-10-10-mcp-servers-and-plugins)) already offers Unfold's reads and actions as tools that confirm before they change anything.

How does a person chat with Unfold in the Agents window, with its tools, without starting Team work by accident and without spending outside Ploeg's authority?

## Decision Drivers

* A short message gets an answer; there is no brief threshold in a chat.
* Ploeg admits and caps every model call; Unfold never holds a key Ploeg did not mint.
* Nothing changes without the person's confirmation, which states the effect and any cost.
* One set of tools: the MCP tools are not copied or forked.
* "Unfold teams" sessions keep working exactly as before.
* The deterministic demo says it is one and never invents model calls or spend.

## Considered Options

* A second agent, "Unfold", beside "Unfold teams", with its own Ploeg chat allowance.
* Let "Unfold teams" sessions answer short messages as an Ask.
* Only `unfold-mcp` in the person's own Copilot or Claude chat.

## Decision Outcome

Chosen option: a second agent, because the owner decided it on 2026-10-18 and it keeps a conversation apart from Team work. The decisions below are the owner's; this record does not reopen them.

1. **Two entries.** The root state lists `unfold-chat` ("Unfold") after `unfold` ("Unfold teams"). A chat session is `unfold-chat:/<id>` for a VS Code 1.141 window and `ahp-session:/<id>` for a client that declares `vscode.ahpSessionUris`, with one default chat derived from that URI. Only the person who started a chat sees it.
2. **Read, and act on confirm.** The chat model's tools are the `unfold-mcp` tools of `src/mcp.ts`, served in process and run as the person with a credential delegated per call, as the MCP endpoint runs them. A tool that only reads runs at once and shows as a tool call. Every tool with `readOnly: false` first shows as a tool call awaiting confirmation (`chat/toolCallReady` with `confirmationTitle` and Allow/Deny options); for a tool that confirms itself the title is the tool's own planned message, which names the effect and the cost, such as the Team whose budget a hand-off spends. It runs only after `chat/toolCallConfirmed` allows it; a denial, Stop, or five minutes without an answer reaches the model as declined. `unfold_ask` is left out, because it would spend a second allowance for an answer the chat model can give. A turn takes at most eight tool-call rounds; the ninth model call offers no tools.
3. **A separate chat allowance, the Team's Ask model.** Each person message is one admission: `POST /api/v1/operator/teams/{team}/chats` (Ploeg ADR-0115, unreleased) returns a key capped at the per-chat budget and the models it may call. The whole tool loop of that turn uses that one key with `credential.models[0]`, and the turn finishes the chat in Ploeg however it ends, which blocks the key. A replay that returns no key is admitted again under a new chat id; a key is never reused. A used-up allowance (402) ends the turn with `chat/error` that says when the allowance resets, and nothing is asked. Ploeg authorizes and meters; Unfold keeps the conversation text.
4. **The Team that pays is session configuration.** The session's configuration offers the Teams the person may use, each described with what is left of its chat allowance, and may be changed between messages. The chat's activity and each answer's last line show what is left.
5. **History.** Unfold stores each turn's message, Markdown, tool calls with their confirmation and result, and errors. `listSessions` lists chats with the first message as their title; a snapshot after a reconnect or restart shows the whole conversation; read, archive, rename and dispose work as on other sessions. The model reads the last ten answered turns. A turn a restart interrupted becomes an error and its Ploeg chat is finished.
6. **Demo.** In the demo the chat answers every message with a fixed reply that says it is a demo, with no admission and no model call.
7. **Team work.** Starting Team work from the chat happens through `unfold_hand_off`, confirmed like any other action; a chat never becomes a Team session.

### Consequences

* Good, because "test" or "hi" gets an answer, metered and capped by Ploeg.
* Good, because the MCP tools have one implementation, with the same confirmations and authorization in an editor's chat and in Unfold's.
* Good, because "Unfold teams" sessions, their URIs and their refusals are unchanged.
* Bad, because this Unfold release needs a Ploeg that serves the chat routes; until Ploeg ADR-0115 is released and pinned, every message ends with Ploeg's refusal. It must not be released before that pin.
* Bad, because a confirmation waits in the process: a restart while a tool call awaits confirmation loses it, and the turn becomes an error.
* Neutral, because the answer arrives whole, not streamed token by token.

### Confirmation

`test/ahp-chat.test.ts` covers both agents for 0.9 and 1.0 clients, a short message answered, a read tool shown, an acting tool allowed and one denied, Stop during a confirmation, the allowance used up, the key finished on success and on error, eight rounds at most, history across a reconnect and a restart, the demo, and the Ploeg client against Ploeg ADR-0115's routes. Live VS Code rendering of the confirmation is not yet verified.

## Pros and Cons of the Options

### Short messages in "Unfold teams" as an Ask

* Good, because no new agent.
* Bad, because an Ask is about one Work Item and has no tools; a session's message would mean two things.

### Only `unfold-mcp` in another chat

* Good, because nothing new in the host.
* Bad, because it needs another product's chat and model, outside Ploeg's allowance.

## More Information

The agent-host contract is in [api.md](../contracts/api.md#chatting-with-unfold). Ploeg's side is Ploeg ADR-0115 (ploeg-hq pull request #165, unreleased).
