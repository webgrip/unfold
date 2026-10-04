# The agent host seam after VS Code 1.138: what is open, what is closed, what breaks

Research date: 2026-09-17. This dossier extends [the 0.9.0 survey](2026-09-10-agent-host-protocol.md) with the roadmap, governance and conformance questions that survey left open. Sources: the [1.138 release notes](https://code.visualstudio.com/updates/v1_138) (16 September 2026), the [specification](https://microsoft.github.io/agent-host-protocol/) and [repository](https://github.com/microsoft/agent-host-protocol) at spec 0.9.0, the [architecture blog](https://code.visualstudio.com/blogs/2026/08/26/agent-host-architecture), the installed VS Code 1.138.0 stable bundle (commit `7debcd0e`), and the issue record in `microsoft/vscode` and `microsoft/agent-host-protocol`.

Primary evidence gathered first-hand from the shipped build is marked **(build)**. Everything else carries its source link.

## Verdict

The harness seam is closed and the host seam is open, and that is unlikely to change. De Vloer is on the correct side of it. The urgent work is not new capability but conformance: the host negotiates a single protocol minor against a client that ships weekly on a spec whose minors are wire-breaking by its own rule.

## What 1.138 actually shipped

No finalized or proposed extension API. The release is agent-host features: sessions in local Dev Containers (`chat.agentHost.devContainer.enabled`), expanded Codex support, session cleanup with mark-as-done and auto-delete after a grace period, an attention badge (`sessions.showApplicationBadge`), pull-request creation from a session (`chat.agentMerge.enabled`), and a unified workspace/repository picker. The notes carry their own disclaimer that they were generated with Copilot and may contain inaccuracies.

The one architectural sentence that matters: the agent host "runs agent harnesses in a dedicated process based on the Agent Host Protocol, so you can connect to the same session from multiple VS Code windows."

## The seam: closed north, open south

**Harness contribution is closed.** The first-party adapters are compiled into `src/vs/platform/agentHost/node/{copilot,claude,codex}/`. The concept documentation states it plainly: "the *first-party* agent adapters run inside the Agent Host process" and "Extensions can still contribute chat customizations such as tools, MCP servers, and custom agents, but the agent runtime itself runs in the Agent Host process." Of the 180 entries in `extensionsApiProposals.ts`, **zero** contain `host`. There is no `chatAgentHost` proposal; the name does not exist.

**Host substitution is open.** `chat.remoteAgentHosts` accepts a raw `ws://host:port` plus an optional `connectionToken` — no extension, no manifest, no review. Two independent parties ship against it today.

**(build)** In 1.138.0 stable the setting is registered `scope: APPLICATION`, `restricted: true`, `tags: ['experimental','advanced']`, with `required: ['address','name']`. It carries no `deprecationMessage`. Its gates `chat.remoteAgentHostsEnabled` and `chat.remoteAgentHostsAutoConnect` both default to **true** (`Rr(m7o, !0, …)`). It appears nowhere on code.visualstudio.com — it exists only in the settings registry and in issue threads. It is also VS Code's own test harness: `src/vs/platform/agentHost/test/node/testRemoteAgentHost.sh` writes a literal `"chat.remoteAgentHosts"` block.

## Will there be more surface area

Three independent signals, all pointing the same way.

1. **The extension-API request is unowned.** [vscode#325827](https://github.com/microsoft/vscode/issues/325827), "Support registration of external agents via Extension API in the agents view", opened 2026-07-14 by an external author. Open, unassigned, no milestone, **no labels at all**, one comment — also external. No Microsoft employee has replied. The best statement of the gap is @cyberluke, 2026-08-27: an extension "cannot currently implement `IAgent`, participate in Agent Host lifecycle management or appear in the harness picker alongside Copilot, Claude and Codex", and "The current architecture gives selected external providers first-class access that Marketplace publishers cannot technically reproduce."

2. **Microsoft's own extensibility roadmap rules it out by name.** [vscode#336199](https://github.com/microsoft/vscode/issues/336199), "Agent Host: support RemoteAgent providers and brokered sessions", opened 2026-09-14 by the VS Code team, assigned to two Microsoft engineers. It proposes host-to-host federation — a host acting as an AHP client to other hosts, contributing each endpoint as a standard `IAgent`, with a `B → A → C` delegation flow, tunnel discovery and a relay transport. Its **initial non-goals** are, verbatim: *"External plugin loader or public extension API; SSH/Dev Container implementations; Importing all pre-existing downstream sessions; Peer/fork/subagent parity; Transparent forwarding of arbitrary upstream tools, customizations, or credentials; General cyclic federation."*

3. **Private protocol extensions are being reserved.** `agentHostExtensionProtocol.ts` defines `vscode/`-prefixed AHP methods (`vscode/devContainers/connect`, `vscode/requestWorkspaceTrust`, `vscode/createAgentHostDetachedWorktree`) on top of the namespace mechanism AHP added as 1.0 blocker [#367](https://github.com/microsoft/agent-host-protocol/issues/367). Microsoft reserving a private namespace is the opposite of an extension point.

**There is no published roadmap to consult.** The `iteration-plan` label ends at February 2026. [vscode#300108](https://github.com/microsoft/vscode/issues/300108) announced weekly stable releases from 2026-03-09 and promised a replacement planning format "by mid-March" — six months later it has not appeared, and the draft still carries `iteration-plan-draft`. The [roadmap wiki](https://github.com/microsoft/vscode/wiki/Roadmap) is still titled "2023/24". What replaced iteration plans is weekly endgame issues, which are pure release mechanics. The only forward-looking readable artifacts are the per-release milestones and the roadmap markdown on the `tyler/remote-agent-hosts` planning branch linked from #336199.

So: more surface area is coming, but through the door we already use, not through a new one. Federation, tunnel discovery and a relay transport widen host substitution. The harness picker stays shut.

## Conformance: the part that breaks

**(build)** VS Code 1.138 sends `initialize` with `protocolVersions` = the known list **minus `0.8.0`**: `["0.9.0","0.7.0","0.6.0","0.5.2","0.5.1"]`. Its current constant is `"0.9.0"`. Our host at [`src/ahp/host.ts:473`](../../src/ahp/host.ts) accepts a client only if its list contains something matching `/^0\.9\.\d+$/`, and answers otherwise with `-32005` and `supportedVersions: ['^0.9.0']`. Today that matches.

It will not keep matching. Minor-to-minor gaps in the spec are 9, 13, 7, 24, 11, 18 and 10 days — a **flat mean of 13.1 days**, neither accelerating nor slowing. By AHP's own compatibility rule, peers are compatible only on the same pre-1.0 minor, so every one of those bumps is a wire break. VS Code ships weekly. The spec says so itself: *"Backwards-incompatible changes to AHP are inevitable."*

This is not theoretical. [vscode#325738](https://github.com/microsoft/vscode/issues/325738) (2026-07-14, 25 👍, still open) reports exactly the failure mode: `Failed to connect to SSH agent-host: Client offered protocol versions [0.5.1], none of which are compatible with this server's version 0.5.0`. The reporter's root cause is that the agent host resolves against the public update channel rather than pinning to the client commit, so client and host drift on every release.

The spec's instruction to hosts is *"Hosts SHOULD pick the highest offered version they implement"* and *"Clients SHOULD offer a wide range of protocol versions."* We implement neither side of that advice: we test one exact version and accept one minor.

### Implemented surface

Measured against the 30 client→server methods in `types/common/messages.ts`:

| | Count | Methods |
| --- | --- | --- |
| Fully implemented | 11 | `initialize`, `ping`, `reconnect`, `subscribe`, `listSessions`, `resolveSessionConfig`, `sessionConfigCompletions`, `createSession`, `createChat`, `disposeSession`, `resourceRead` |
| Stubbed, returns `{}` | 4 | `disposeChat`, `fetchTurns`, `completions`, `authenticate` |
| Hard-refused | 1 | `invokeChangesetOperation` (`-32009`, by candidate-contract policy) |
| Absent | 14 | terminals (2), resource mutation (8), `resourceRequest`, `createResourceWatch`, automations (3) |

Server→client requests: the spec defines **10** (the nine resource operations plus `createResourceWatch`, all callable in both directions). We implement **0**.

**(build/code)** The absences are correct rather than negligent: the host advertises none of the optional capabilities — no `completionTriggerCharacters`, no `automations`, no `telemetry`, no `defaultDirectory`, and `terminalCommandPrefix: undefined` explicitly. Declining by not advertising is the sanctioned pattern, and it makes the four `{}` stubs unreachable by a conformant client. They remain latent risk, not live bugs.

Two real defects, both in [`src/ahp/host.ts`](../../src/ahp/host.ts):

- `serverSeq` is a process-global counter (`:61`) that is never persisted. It resets to 0 on restart while clients reconnect carrying `lastSeenServerSeq`. A sequence number that moves backwards violates the reconnect contract.
- `projections` (`:62`) and `summaries` (`:64`) are never evicted — not on `disposeSession`, not on client close — and `projection()` (`:245`) replays a session's entire event history on first subscribe.

### Session status has bits we never set

`SessionStatus` is a bitset: `Idle=1`, `Error=2`, `InProgress=8`, `InputNeeded=24`, **`IsRead=32`**, **`IsArchived=64`**. Bits 0–4 are mutually exclusive activity; bits 5+ are orthogonal metadata. Our `sessionStatus()` (`:30`) emits only the first four.

That matters more than a missing flag, because there is nothing behind it. There is no `DELETE FROM sessions`, no `DELETE FROM events`, no `VACUUM`, no TTL, no purge anywhere in `src/`. AHP tokens never expire and `revokeToken()` (`:78`) has no HTTP caller. The event log is unbounded and `Store.listSessions()` has no `LIMIT`. 1.138's mark-as-done and auto-delete map onto `IsArchived`, and ticket **PV-048** is the landing spot.

## Governance and ecosystem

Single-vendor, with an open licence on top. CODEOWNERS is `* @connor4312 @roblourens`. Every meaningful contributor is Microsoft. No foundation, no governance document, no external steering body. The .NET package ships as `Microsoft.VisualStudioCode.AgentHostProtocol`. Six client SDKs (Rust, TypeScript, Kotlin, Swift, Go, .NET) — **all client-only; there is no server SDK in any language**, and [#422](https://github.com/microsoft/agent-host-protocol/issues/422) asking for one has no maintainer reply.

**Independent server implementations now exist**, which the [previous dossier](2026-09-10-agent-host-protocol.md) and Ploeg's [ADR 0006](../../../ploeg/docs/adrs/0006-ahp-is-the-wrong-layer.md) both recorded as absent:

| Implementation | Kind | Status |
| --- | --- | --- |
| [`Qusic/pi-ahp`](https://github.com/Qusic/pi-ahp) | Host embedding the `pi` agent, targets 0.9.0 | 11★, npm 292 dl/month, active (2026-09-16) |
| [Agent Console](https://qusic.github.io/agent-console/) | Paid native iOS/iPadOS AHP client, App Store | Shipped commercial product |
| [`softov/ahpd`](https://github.com/softov/ahpd) | Host with a Claude Agent SDK backend | npm 605 dl/month, first published 2026-09-06 |
| [`wyrd-company/*`](https://github.com/wyrd-company) | Server + adapters for Cursor/Codex/Claude/Pi, gRPC and NATS transports, an A2A↔AHP bridge | **Abandoned** — all repos last pushed 2026-07-25 |
| [`TylerLeonhardt/ahpx`](https://github.com/TylerLeonhardt/ahpx) | CLI client | Author is on the VS Code team |

The official [implementations page](https://microsoft.github.io/agent-host-protocol/guide/implementations.html) still lists one server ("The reference AHP server implementation" — VS Code) and one non-Microsoft client, whose author works at Microsoft. [PR #449](https://github.com/microsoft/agent-host-protocol/pull/449), adding `pi-ahp` to that list, has sat since 2026-09-13 with no reviewer, no label and no comment.

The whole downstream dependents graph is 2 repositories and 19 packages. Note that registry counts are inflated by a namespace-squatting campaign that has claimed ~46 Hex packages, ~20 crates and the GitHub org `agent-host-protocol/`, none containing an implementation.

### Public scrutiny is near zero, and that is a finding

Four HN submissions across four months totalling 10 points and 1 comment. Exactly two HN comments ever mention AHP. No Lobsters thread surfaced; dev.to returned nothing; six trade-press articles, all neutral-to-positive with no critical passage. Exactly one independent critical blog post exists: Rohit Ramachandran, [2026-07-17](https://rohitai.com/blog/vscode-agent-host-protocol-session-infrastructure) — *"The ecosystem could trade editor lock-in for host lock-in"* and *"Whoever controls the host controls the mapping, lifecycle, policy, persistence, and visibility of the session."*

The absence of criticism reflects low awareness, not consensus. The real argument is inside Microsoft's own trackers, and the sharpest objections are unresolved:

- **Security.** [AHP#266](https://github.com/microsoft/agent-host-protocol/issues/266) (Ross Wollman, Microsoft): AHP "intentionally does not assume the host is compromised", yet "the client pushes a broad write token *into* the host (`authenticate`) → exfiltration / reuse; and the host renders the approval prompt → it can lie or swap the payload." Rob Lourens' reply concedes the surface rather than closing it: "It can also simply do actions without a prompt at all." The threat-model PR [#88](https://github.com/microsoft/agent-host-protocol/pull/88) has been unmerged since 2026-04-27, its author noting "longer term, I do think it's critical we have an 'untrusted' mode."
- **1.0.** [#366](https://github.com/microsoft/agent-host-protocol/issues/366) is an admitted blocker: unknown enum values fail whole-message decode, so "after 1.0 every enum extension effectively becomes a MAJOR change."
- **Purity.** [#186](https://github.com/microsoft/agent-host-protocol/issues/186) showed the documented-pure reducers stamp `modifiedAt` from `Date.now()`; closed *not planned*, labelled `debt`. Our hand-rolled wire types avoid this class of problem entirely.
- **Layering.** [#282](https://github.com/microsoft/agent-host-protocol/issues/282) asks whether the host↔ACP seam is "a third-party extension point or an implementation detail of the first-party adapters" — *"The question that decides our roadmap."* Unanswered since 2026-08-15.
- **Demand for the alternative.** [vscode#265496](https://github.com/microsoft/vscode/issues/265496), asking VS Code to support ACP, has **324 👍 and 49 comments and has been open since 2025-09-06**. Three community ACP extensions exist because it was never answered.

## Layer map

| Seam | Protocol | Who claims it |
| --- | --- | --- |
| Client ↔ session state, multi-client sync | **AHP** | VS Code; De Vloer's host |
| Host ↔ agent, 1:1 conversation | **ACP** | Ploeg's `pkg/harness/adapters/acp` |
| Agent ↔ tools | **MCP** | Inside the harness, below both |
| Agent ↔ agent | A2A | **Nobody in this estate**, and an explicit AHP anti-goal |
| Dispatch, leases, claims, outcomes | *(none)* | Ploeg's own contract — no protocol claims this |
| Budget, spend, accounting | *(none)* | **Unclaimed by every protocol surveyed** |
| Provenance, attestation, supply chain | *(none)* | **Unclaimed** — AHP has OTLP telemetry and nothing else |

Microsoft's own framing, verbatim: *"AHP is a coordination layer. ACP is a communication layer. They compose naturally."* — *"A useful mental model: AHP is a mutex over ACP."* — and, in the anti-goals, *"A replacement for ACP or other downstream agent protocols."*

**The stack Microsoft documents is the one Glide already has, split across two applications.** Vloer speaks AHP north, Ploeg speaks ACP south. No AHP host in the wild actually does this: `pi-ahp` embeds `pi`, `ahpd` uses the Claude SDK directly, and wyrd's adapters wrap vendor SDKs. The layering is asserted by its author and demonstrated by nobody.

**ACP is not stalled, and it is no longer single-vendor** — correcting both an intermediate finding in this sweep and the premise carried in [ADR 0006](../../../ploeg/docs/adrs/0006-ahp-is-the-wrong-layer.md). Schema **v1.21.0** and Rust **v1.7.0** shipped 2026-08-20, eight days before AHP 0.9.0, with **v2.0.0-alpha.3** the same day. ACP has a stable 1.x compatibility line; AHP has no 1.0.

The governance gap between the two is now wide and runs the opposite way to AHP. The repository moved out of `zed-industries/` to the neutral org [`agentclientprotocol/`](https://github.com/agentclientprotocol/agent-client-protocol) and is **jointly governed by Zed and JetBrains**, described as interim "while working toward transitioning to an independent foundation", with two lead maintainers — Ben Brandt (Zed) and Sergey Ignatov (JetBrains, appointed 2026-02-18) — core maintainers from both companies plus Block, an RFD process, working groups, bi-weekly core meetings, Apache-2.0 and no CLA. Against AHP's `* @connor4312 @roblourens` and no governance document at all, ACP is the better-governed of the two by every observable measure.

Scale follows governance: **4,264 stars against AHP's 342**, 40 agents and roughly 120 clients listed, and a stabilised [agent registry](https://zed.dev/blog/acp-registry) carrying 41 entries. GitHub Copilot CLI shipped ACP in public preview on 2026-01-28; Cursor, JetBrains AI Assistant, Gemini CLI, Goose, OpenCode, OpenHands, Qt Creator and Neovim are implementers. Ploeg's pin to ACP v1 through `coder/acp-go-sdk v0.13.5` (a third-party SDK, not an official one) is a sound position on the healthier protocol.

### The seam has other claimants now

AHP is the only protocol *purpose-built* for this seam, but it is no longer the only one on it.

- **ACP v2 is moving into it.** The [v2 draft](https://agentclientprotocol.com/announcements/acp-v2-draft) (2026-07-20) makes `session/resume` mandatory with a `replayFrom` cursor, and the prompt-lifecycle RFD states the design "allows for multiple clients to be attached to the same session". It specifies no arbitration, presence or ordering guarantees — reconnect-and-replay plus a door left open, not a coordination protocol. But it narrows AHP's reason to exist, and it is the trigger most worth watching.
- **A2A v1.0 has normative multi-client language.** §3.5.2 "Multiple Streams Per Task": *"An agent MAY serve multiple concurrent streams to one or more clients for the same task… Events MUST be broadcast to all active streams… Multiple team members monitoring the same long-running task."* Plus `SubscribeToTask` in §3.1.6. It is a `MAY` with no capability flag to advertise it, no replay, no resume cursor and no session primitive above the task — but A2A sits under the Linux Foundation's Agentic AI Foundation with an eight-seat corporate TSC including Microsoft, which is governance AHP cannot match.
- **MCP has vacated the seam.** The 2026-07-28 revision removed protocol-level sessions and `Mcp-Session-Id`, removed the initialize handshake, and removed SSE stream resumability and message redelivery.
- **AG-UI has ruled it out.** Its 1.0 draft carries a section titled "No resumption": the SSE binding does not use `Last-Event-ID` and "a broken stream cannot be re-entered."

And one competitor is a product rather than a protocol: **Zed Delta**, ["a multiplayer environment for coding with agents"](https://zed.dev/blog/introducing-delta), public beta 2026-09-16, syncs third-party harness sessions into a shared thread with cloud runners that keep working after the laptop closes. Closed, proprietary, no spec. It is the closest thing anyone has shipped to De Vloer's premise, and it is worth tracking as a product comparison rather than a protocol decision.

## Cost, provenance and budget are outside the protocol

AHP defines **no** cost, price, credit or currency field anywhere. Cost can ride only in `UsageInfo._meta` as provider-specific metadata — which is exactly what `host.ts:381` already does. The doctrine's anti-goals exclude "A required model provider, model router, or credential flow", and there is no provenance, attestation or supply-chain surface at all.

This is the durable answer to what cannot be commoditised by the protocol: budget authorization, LiteLLM key lifecycle, crew composition with required reviewers, tracker binding, candidate signing and in-toto provenance, and Ploeg's authority all sit in seams no protocol claims.

## Absence checks

Confirmed zero mentions of **De Vloer**, **Vloer**, **Ploeg**, **Glide** (in this sense), **webgrip** or **forgejo.webgrip.dev** anywhere in the AHP repository, its issues, or the surrounding ecosystem. Also confirmed absent from AHP: **OpenCode**, **LiteLLM**, **Vikunja**, **Kata Containers**, **in-toto**. The only OpenCode↔AHP artifact is [`maxious/opencode-plugin-agent-host-protocol`](https://github.com/maxious/opencode-plugin-agent-host-protocol) (3★), whose README opens *"Status: Not implemented"*, which targets a fictional "AHP v1", and which was created and abandoned on 2026-04-02.

Nothing upstream to reconcile with, no naming collision, and every integration in these directions would be built from scratch.

## Method and limits

GitHub code search requires authentication and was unavailable; `ahp-session`, `ahp-chat` and `chat.remoteAgentHosts` as code strings across GitHub are unsearched. The REST API rate-limited late in the sweep. Reddit, Lobsters and Bluesky were unreachable behind bot walls — treat "no discussion found" there as unverified rather than proven zero. Build-level findings marked **(build)** were read directly from `/Applications/Visual Studio Code.app` at 1.138.0 commit `7debcd0e` and are first-hand.

No protocol-research contract block exists in [AGENTS.md](../../../../AGENTS.md); landing spots were inferred from each application's stated homes for evidence, verdicts and actions.
