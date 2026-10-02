# Model gateway capabilities

De Vloer never talks to a model provider. Every session gets one LiteLLM virtual key that the control plane mints with an alias, a dollar ceiling, a lifetime and a model allow-list, and the workspace sees only that key and the gateway URL ([src/broker.ts](../../src/broker.ts), [src/runtime/workspace.ts](../../src/runtime/workspace.ts)). That single seam is what makes the list below possible: anything LiteLLM can attach to a key, a request or a proxy config becomes something De Vloer can offer without the harness knowing.

This page is an inventory of what the gateway can do as of LiteLLM v1.100.0 and what De Vloer would have to change to hand each capability to a user. It is not a claim that any of it is exercised; [validation](../validation.md) is the record of what was.

Sources: [v1.99.0 release notes](https://docs.litellm.ai/release_notes/v1.99.0/v1-99-0) ([GitHub release](https://github.com/BerriAI/litellm/releases/tag/v1.99.0)), [v1.100.0 release notes](https://docs.litellm.ai/release_notes/v1.100.0/v1-100-0) ([GitHub release](https://github.com/BerriAI/litellm/releases/tag/v1.100.0)). Both estates run or are moving to v1.100.0.

## Where a capability can live

| Layer | Who owns it | How De Vloer reaches it |
|---|---|---|
| Proxy config | The estate, in Git | Nothing to do; every key inherits it |
| Virtual key | De Vloer's broker at mint time | Fields on `/key/generate` and `/key/update` |
| Request | The harness inside the sandbox | Headers or metadata De Vloer sets in the harness config, never per turn |
| Ledger | LiteLLM's spend and request logs | Broker reads, shown in the session view |

## Already offered

| Capability | What the user gets | Layer |
|---|---|---|
| Per-session key with `max_budget`, `duration` and `key_alias` | A run cannot outspend its ceiling and cannot outlive its lifetime | Key |
| Model allow-list per key | A session only sees the models its profile lists | Key |
| Spend read-back with a settlement delay | The session view shows real cost after the gateway has settled it | Ledger |
| Block on stop, extend on request | Stopping a session revokes its credit; a human can top it up | Key |
| Fallbacks down the family, never up | An outage on Opus degrades to Sonnet, never the reverse | Proxy |
| Pre-call context checks and bounded retries | Over-window requests fail before tokens are spent; auth errors are never retried | Proxy |
| OTel spans without prompt content | Every turn is a trace in the estate's trace store; prompts never leave the sandbox | Proxy |

## Could offer now, with a profile change only

These are exposed by the proxy as ordinary model names or key fields, so a De Vloer profile can list them today.

| Capability | What the user gets | Since | What changes |
|---|---|---|---|
| Auto-router with operator-defined tier sets | Pick a tier such as `cheap`, `balanced` or `best` instead of a model; the gateway classifies each turn and routes it | 1.99 tier sets, 1.100 custom classifier tiers and dry-run | Register the router as a `model_name` in the proxy, list it in the profile's models |
| Plan-mode tier floor for coding-agent clients | Planning turns never drop below a chosen tier, execution turns may | 1.99 | Proxy `complexity_router_config`; nothing in De Vloer |
| Per-group reasoning effort ceilings | A session's thinking level is bounded by what the estate allows for that group | 1.100 | Proxy config; the profile documents the ceiling |
| Fallback access enforcement | A key that may not use the fallback model does not silently get it during an outage | 1.100 `enforce_fallback_model_access` | Proxy config |
| Model deprecation alerts | A warning before a listed alias stops working | 1.99 `/model/deprecations` | Optional: broker reads it at boot and flags stale profile entries |
| Streaming keepalives and partial-stream spend | Long tool calls do not drop the connection; a session killed mid-answer still gets billed correctly | 1.99 | Nothing |

## Could offer with broker changes

Each row is a small, contained change to [src/broker.ts](../../src/broker.ts) or the harness config in [src/runtime/workspace.ts](../../src/runtime/workspace.ts).

| Capability | What the user gets | Since | Broker change |
|---|---|---|---|
| Which model actually answered | The session view names the routed model per turn, not just the tier | 1.99 `router_model_name` in responses and spend logs | Read `/spend/logs` for the key alias; show model per request |
| Auto-router savings | "This session cost X; on a fixed model it would have cost Y" | 1.99 per-request savings to callbacks, 1.100 shadow-eval savings | Read savings fields from the ledger; show in the session summary |
| Budget windows with rollover | A long-lived crew gets a weekly allowance and unspent credit carries over | 1.100 | Set `budget_duration` and the rollover flag on generate instead of `budget_duration: null` |
| Shared budget across a model access group | One ceiling for a whole crew or team regardless of who spends it | 1.100 | Mint keys into a model access group whose budget the estate owns |
| Per-model budgets on a key | A session may spend freely on Haiku but only a little on Opus | 1.99 consolidated tracking, 1.100 update enforcement | Add per-model budgets on generate from the profile |
| Prompt-cache affinity per session | Repeated context in a long session is served from cache, at cache rates | 1.99 `prompt_cache_key` from user id, deployment affinity | Set a stable `user` and cache key per session in the harness config |
| Session-level cache observability | The session view shows cache hit rate and what it saved | 1.100 | Read cache fields from request logs |
| Cost breakdown honouring service tier | Fast-mode and priority-tier requests are billed at their real rate in the session total | 1.100 | Nothing, unless the profile exposes a tier choice |
| Spend lifecycle timestamps | Accurate "first token" and "settled" times per turn | 1.99 | Read from the ledger |

## Could offer with an estate change

These need something in the estate's proxy config or cluster that neither estate has yet.

| Capability | What the user gets | Since | Estate prerequisite |
|---|---|---|---|
| MCP tools through the gateway, granted per key | The sandbox gets ClickUp, GitLab or Forgejo tools with no tool credential inside it; De Vloer's key grant is the only permission | 1.99 client-held credentials and per-server auth, 1.100 toolset enforcement at team and key level, RFC 7662 introspection, RS256 session tokens | Register MCP servers in the proxy. The second estate already defaults to deny with `supported_db_objects: ["mcp"]` and `require_key_mcp_access_defined: true`, so the first grant is explicit |
| Guardrails on every turn | Estate-wide policy, including on streaming and on MCP tool calls, without the harness knowing | 1.99 MCP tool guardrails, policy pipelines on caller metadata; 1.100 guardrails on streaming | Configure guardrail providers in the proxy; the key carries the policy |
| PII masking in the ledger | Spend and debug logs never hold personal data even when the prompt did | 1.99 | Guardrail provider configured |
| Team and project rate limits | Per-team tokens-per-minute in both directions so one crew cannot starve another | 1.99 project ITPM/OTPM | Teams defined in the proxy; De Vloer mints under a team |
| Provider budgets and cross-provider fallback | A monthly cap per upstream provider, and Anthropic falling to Fireworks | 1.98 and earlier | A Redis or Valkey instance; the second estate's config defers this on purpose |
| Personal OAuth login to the gateway | An operator holds their own key from an OIDC login, so the interactive lane can bill to a person rather than a minted key | 1.99 CLI PKCE login, keychain storage | SSO configured on the proxy; De Vloer would accept a supplied key instead of minting |
| Per-team trace routing | Each team's spans land in its own OTel or New Relic service name | 1.99 Phoenix per-key projects, 1.100 OTel v2 per-team `service.name` | Team callbacks configured in the proxy |

## Not for De Vloer

| Item | Why |
|---|---|
| Admin UI changes (dark mode, React 19, shadcn migration) | Operator tooling for the estate, not a user capability |
| Enterprise-licensed features (audit logs on by default, some guardrail tiers) | [Platform and governance](../design/platform-and-governance.md) forbids silent dependence on Enterprise |
| Batch, OCR, vector store and web search providers | No harness in a De Vloer session calls these routes today |
| Breaking changes in 1.100 | Internal token calculator removal and a Cerebras parameter fix; neither reaches a key or a request |

## Ordering

The first three are cheap and visible. The fourth is the one that changes the trust model, because it removes the last credential that has to live inside a sandbox.

1. Auto-router tier as a listed model, with routed model and savings shown in the session view.
2. Budget rollover and shared crew budgets on mint.
3. Prompt-cache affinity and cache observability.
4. MCP tools through the gateway, so a merge-request crew no longer needs a forge token in its environment.
