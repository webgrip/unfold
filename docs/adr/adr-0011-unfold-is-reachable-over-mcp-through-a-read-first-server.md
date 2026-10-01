---
status: accepted
date: 2026-09-30
decision-makers: Ryan Grippeling
---

# Unfold is reachable over MCP through a separate, read-first server on Ploeg's operator API

## Context and Problem Statement

People already work in AI clients such as Claude Code, Claude.ai, ChatGPT, Cursor and Codex, and those clients speak MCP. A person can create and assign a Work Item today through their tracker's MCP server, but cannot see Unfold's own state from those clients: Runs, spend, reviewer Verdicts, the pull request, work that is stuck or waiting for approval. They also cannot approve proposed work or create a Work Item without a tracker. Should Unfold expose itself over MCP, where should the server live, and what may it do?

The scope is the north side: a person's client talking to Unfold. It also records what the south side, agents inside a Run, may and may not get.

## Decision Drivers

* A model must never be able to start paid work on its own ([Ploeg ADR-0012](../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md), [Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)).
* ploegd holds the LiteLLM master key and forge admin token and is not on a public route ([Vloer ADR-0015](../../apps/vloer/docs/adrs/0015-ploeg-operator-read-api.md)).
* Runs never call Ploeg's API; they report through the outcome drop box ([Ploeg ADR-0011](../../apps/ploeg/docs/adrs/0011-the-pull-request-is-the-blackboard.md), [Ploeg ADR-0018](../../apps/ploeg/docs/adrs/0018-the-outcome-drop-box-is-every-harnesss-return-path.md)).
* Vloer ships no production npm dependencies ([Vloer ADR-0002](../../apps/vloer/docs/adrs/0002-native-node-and-single-writer-storage.md)).
* An install that runs Ploeg without Vloer should still be reachable.
* MCP carries no budget, authority or tenant; Unfold must keep all three.

## Considered Options

* A separate `ploeg-mcp` command in `apps/ploeg`, a named consumer of the operator API, read-first, with proposal-only writes and human-confirmed approval
* A `/mcp` route inside ploegd
* An MCP server inside Vloer's Node server
* A server generated from an API description
* No MCP server; a CLI (`ploegctl`) and an agent skill instead
* No MCP server; the tracker's MCP server is enough

## Decision Outcome

Chosen option: "A separate `ploeg-mcp` command", because it is the only option that keeps ploegd internal, works without Vloer, uses a Tier-1 SDK in Ploeg's language, and reuses the operator API's existing authorization instead of adding a second one.

* **Where.** `apps/ploeg/cmd/ploeg-mcp`, built on `github.com/modelcontextprotocol/go-sdk`, serving MCP `2026-07-28` statelessly (`StreamableHTTPOptions{Stateless: true}`) and over stdio. It ships in Ploeg's image and chart as its own Deployment, off by default. It reaches Unfold only through the operator API, as a named consumer from `PLOEG_OPERATOR_CONSUMERS`, and shares one Go client for that API with `ploegctl`.
* **Toolsets.** Read (default): `unfold_overview`, `unfold_find_work`, `unfold_get_work`, `unfold_recent_runs`, `unfold_changes_since`. Propose: `unfold_propose_work`. Steer: `unfold_approve_work`, `unfold_reject_work`, `unfold_cancel_work`. The server enforces which toolsets a consumer or token has; a tool that is not granted is not listed.
* **Proposals never dispatch.** A Work Item created over MCP is `proposed` and waits for approval under the same per-Team limits as Run-created work. This needs `POST /api/v1/operator/work-items` ([Vloer ADR-0023](../../apps/vloer/docs/adrs/0023-vloer-submits-work-to-ploeg-and-never-executes-it.md)) with a proposed mode. The request is idempotent by a key derived from principal, Team, title and description.
* **Approval needs a person.** Approve and cancel return an MCP elicitation form; only `accept` acts. A client without elicitation gets a refusal and a link to approve in Vloer or the tracker.
* **Identity by phase.** First stdio with an operator token from the environment. Then Streamable HTTP with a static bearer on the internal gateway, for command-line clients. Then an OAuth 2.1 resource server for Authentik tokens, with audience validation and no token passthrough, for Claude.ai and ChatGPT. The OAuth phase requires a public route and gets its own security review.
* **Long-running work** is addressed by Work Item id and polled; the server keeps no session state and does not use the MCP Tasks extension.
* **Refined on 2026-09-30** by [the build guide](../research/2026-09-30-mcp-server-patterns.md), which binds the implementation:
  * one `/mcp` serves both protocol eras;
  * `structuredContent` and `content` each carry the full answer;
  * tool schemas stay in the common subset;
  * every call returns within 30 seconds;
  * approve, reject and cancel are gated by the owner's grant, a sealed single-use `requestState` and `_meta["anthropic/requiresUserInteraction"]`, because a form `accept` is the client's consent, not proof of a person;
  * the OAuth phase uses Authentik with pre-registered clients (Claude.ai, ChatGPT, and one public client for CLIs), and `ploeg-mcp` checks `aud` against those client ids, because Authentik ignores `resource` (owner decision, 2026-09-30; guide §6).
* **South side.** Runs get no Unfold MCP server. Third-party MCP servers reach a Run only through LiteLLM's gateway with per-Run keys, and no harness loads MCP configuration from the target repository.

**The owner's answers (2026-09-30):**

* **Remote is in scope** for the self-hosted phase: all three identity phases are planned, and the OAuth phase still needs its own security review before its public route goes live.
* **Proposals live in Ploeg only**, like Run-created work. Nothing is written to the tracker, and the `provider` is `operator`.
* **Only the owner holds the steer toolset** (approve, cancel). Every other identity gets read, and propose only when granted.
* **A client without elicitation** gets a refusal and a link to approve in Vloer. The model never approves on its own.

The evidence, prior art and security requirements are in [the research record](../research/2026-09-29-mcp-access.md).

### Consequences

* Good, because a person can ask their own AI client what Unfold is doing, what it cost and what is waiting for them, without opening Vloer.
* Good, because the server adds no new authority: every call is authorized again by the operator API, and paid work still needs a person.
* Good, because `ploegctl` and `ploeg-mcp` share one client, and Vloer and MCP share one submission route.
* Bad, because the remote phase puts a new service on a public route, which needs an Authentik application, a route in `homelab-cluster` and a security review.
* Bad, because approval over MCP depends on client elicitation support, which is uneven; some people will be sent to Vloer to approve.
* Bad, because `ploeg-mcp` asserts the acting person to Ploeg, as Vloer does, so it is a trusted consumer and must be reviewed as one.

### Confirmation

Accepted, not implemented. It is implemented when:

* `go test ./cmd/ploeg-mcp/...` in `apps/ploeg` drives every tool through `mcp.NewInMemoryTransports()` against a test ploegd, including a propose that stays `proposed`, an approve that is declined and dispatches nothing, and a read-only consumer that cannot list write tools;
* `npx @modelcontextprotocol/conformance@0.2.0-alpha.11 server` passes in CI with `--requirements 2026-07-28` and again with `2025-11-25`, against a `-tags conformance` build that adds the fixture tools behind the same middleware, using a per-check baseline; the protocol scenarios (`server-stateless`, `tools-list`, `caching`, `dns-rebinding-protection`) also pass against the production binary;
* `grep -rn "operator" apps/ploeg/cmd/ploeg-mcp` shows it reaching Unfold only through the shared operator client, and no ploegd route serves `/mcp`.

## Pros and Cons of the Options

### A separate `ploeg-mcp` command

* Good, because ploegd stays off the public network.
* Good, because the official Go SDK is Tier 1, maintained by Google's Go team, and supports the stateless revision and OAuth resource-server helpers.
* Neutral, because it is one more Deployment to run.
* Bad, because it duplicates Vloer's Authentik sign-in for the remote phase.

### A `/mcp` route inside ploegd

* Good, because it is the least code: direct store access, one process.
* Bad, because the process holding the master keys would face the internet.

### Inside Vloer's server

* Good, because Vloer already has sign-in, roles and per-user Team scope.
* Bad, because it needs a production npm dependency or a hand-written protocol implementation.
* Bad, because an install without Vloer would have no MCP.

### Generated from an API description

* Good, because it would stay in sync with the API automatically.
* Bad, because Ploeg publishes JSON Schema, not OpenAPI, and a 1:1 wrapper has no approval semantics.

### A CLI and a skill instead

* Good, because it avoids the protocol entirely, and terminal agents run CLIs well.
* Bad, because Claude.ai, ChatGPT and phones cannot run a CLI.

### The tracker's MCP server is enough

* Good, because it already works for creating and stopping work.
* Bad, because trackers cannot show Runs, spend, Verdicts or proposed work.

## More Information

* Research record: [2026-09-29 MCP access](../research/2026-09-29-mcp-access.md).
* Related: [Ploeg ADR-0007](../../apps/ploeg/docs/adrs/0007-a2a-adopt-nothing-watchlist-a-facade.md) keeps the A2A dispatch facade on its watchlist; this record answers the same need for MCP clients first.
* 2026-09-29 — Proposed after an eight-agent research sweep. Numbered 0011 because system ADRs 0005–0010 are on the unmerged `docs/agency-offering` branch.
* 2026-09-30 — Accepted by the owner, remote phase included; the four open questions answered in the Decision Outcome (VIK-1502).
* 2026-09-30 — Refined by a six-agent build-pattern sweep ([research record](../research/2026-09-30-mcp-server-patterns.md)); the Confirmation's conformance check now uses a fixture build, because most required scenarios call fixture tools a production server does not have.
* 2026-09-30 — The owner chose Authentik with pre-registered clients as the OAuth-phase identity provider, over Keycloak and an authorization server in front of Authentik.
