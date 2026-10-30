---
status: proposed
date: 2026-10-30
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# An ACP editor uses Unfold as the agent `unfold`, which follows one Work Item

## Context and Problem Statement

People reach Unfold from an editor only through VS Code ([ADR 0007](0007-thin-editor-client.md)). The agencies Unfold is for write PHP in PhpStorm, and PhpStorm, JetBrains Air, Zed and the Neovim plugins all start agents over the Agent Client Protocol (ACP). On 2026-10-30 the owner decided that phase 1 offers a north-side ACP agent (system ADR-0050, "Editors", [pull request #697](https://forgejo.webgrip.dev/webgrip/unfold/pulls/697)). An ACP agent is a chat partner that answers prompts and asks for permissions; Unfold is not a coding agent and never executes work itself. What does an ACP session mean in Unfold, and how do Unfold's rules about spend, permissions and delegation carry over?

## Decision Drivers

* An open standard on the wire for editors (system ADR-0050, rule 2), with no new credential ([ADR 0037](0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md)).
* Every spend and every change is confirmed by the person first, as `unfold-mcp` does (system ADR-0037).
* A tool permission is answered by the session's owner, allow or deny only.
* A delegation from an editor waits for a person and never starts a Run.
* The demo says it is a demo and invents no spend.

## Considered Options

* **A separate agent, `unfold-acp-agent`, whose ACP session follows one Work Item: a message asks or steers, the session feed streams back, permissions and spends go through `session/request_permission`**
* Extend `unfold-acp` (the relay) to inject Unfold answers into another agent's stream
* Serve ACP from the Unfold server over a socket, like the Agent Host Protocol host

## Decision Outcome

Chosen option: "**a separate agent that follows one Work Item**", because it is an ordinary ACP agent any client can start, it needs only the routes `unfold-mcp` already uses, and each confirmation maps to ACP's own permission prompt.

1. **Sign-in.** `unfold-acp-agent login` runs the editor sign-in as `unfold-acp-agent on <host>` and keeps the `vle_` credential in a file only the user can read. ACP's terminal authentication method runs the same command. Without a credential Unfold accepts, the agent answers ACP's `-32000`.
2. **Binding.** An ACP session follows at most one Work Item, or one of the person's workbench sessions and its Work Item, picked with `/work`, the `work-item` configuration option, `_meta.unfold.workItem` or `UNFOLD_WORK_ITEM`.
3. **Ask and steer.** Two ACP session modes. In `ask`, a message is an Unfold Ask, free from the record; a model Ask asks the person first, naming the most it spends and the Ask Allowance left. In `steer`, a message goes to the person's own workbench session, or becomes a note for the next Run, after they allow it. `session/cancel` ends the prompt turn only.
4. **Feed and permissions.** A watching prompt streams the session feed as agent messages and tool calls. A tool permission the Run's harness asks for reaches the session's owner as an ACP prompt with `allow_once` and `reject_once` only, and is answered `once` or `reject`, never `always`. A dismissed prompt leaves the request waiting in Unfold.
5. **Delegation.** `/propose` drafts and admits nothing until Ploeg offers an admission that holds a Work Item as `proposed` for a person; the request for that contract is in the OpenSpec change `add-acp-agent`, design D6.

### Consequences

* Good, because PhpStorm, Air, Zed and Neovim reach Unfold through one standard program, and each confirmation is the editor's own permission dialog.
* Good, because nothing new is stored and no route is added; the action record names `unfold-acp-agent` as the channel.
* Bad, because the agent polls the session feed while a prompt watches it.
* Bad, because delegation stays a draft until a Ploeg release adds the proposal admission.
* Bad, because editors render ACP differently, and none was run against it yet.

### Confirmation

`apps/unfold/test/acp-agent.test.ts` drives the agent with a fake ACP client against the demo (binding, Ask, steer refusal, proposal, watching a demo session, cancel) and against a fake Unfold (sign-in required, the spend prompt, the permission relay with allow and deny only, steering after confirmation). `test/editor-sign-in.test.ts` covers the approval page's name.

## Pros and Cons of the Options

### Extend `unfold-acp`

* Good, because one program would serve both directions.
* Bad, because the relay's promise is that it never changes a byte; injecting answers into another agent's stream breaks it.

### Serve ACP from the Unfold server

* Good, because the feed could be pushed instead of polled.
* Bad, because ACP's transport is a local subprocess on stdio; a remote socket needs a local bridge anyway.

## More Information

The how-to is [Use Unfold from PhpStorm and other ACP editors](../../../../docs/how-to/use-unfold-from-an-acp-editor.md). The registry entry is in `extensions/acp-agent/registry/unfold/` and is not submitted.
