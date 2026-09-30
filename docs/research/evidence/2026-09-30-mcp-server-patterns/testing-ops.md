# Testing, evals, observability, operations and lifecycle

> Raw research-agent report, 2026-09-30, kept as evidence for [the MCP server patterns guide](../../2026-09-30-mcp-server-patterns.md). Agent output, not independently verified line by line; the guide states which claims were checked first-hand.

# ploeg-mcp: testing, evals, observability, operations and lifecycle (crawled 2026-09-30)

Scope is `ploeg-mcp`: go-sdk v1.8.0 (released 2026-09-14, https://github.com/modelcontextprotocol/go-sdk/releases/tag/v1.8.0), MCP 2026-07-28, stateless Streamable HTTP plus stdio. Its toolsets follow ADR-0011 (`docs/adr/adr-0011-glide-is-reachable-over-mcp-through-a-read-first-server.md`): read, propose and steer, and a tool that is not granted is not listed.

## 1. Conformance

**Official suite.** The suite is `@modelcontextprotocol/conformance` (https://github.com/modelcontextprotocol/conformance). Server mode connects as a client to a server that is already running.
- `npx @modelcontextprotocol/conformance server --url <url> [--scenario X | --suite active|all|draft|pending | --spec-version 2026-07-28 [--force] | --requirements 2026-07-28] [--expected-failures f.yml] [-o dir] [--timeout 30000] [--verbose]`. `--requirements` replaces `--suite`, `--spec-version` and `--scenario`. The option list is in `src/index.ts` on main.
- `npx @modelcontextprotocol/conformance list --server` lists scenarios. `list --requirements 2026-07-28` shows what that revision requires.
- Results are written to `results/server-<scenario>-<timestamp>/checks.json`. Every scenario also emits `wire-schema-valid`, which validates each message the server sent against the spec JSON schema.
- The suite names `core`, `extensions`, `backcompat`, `auth`, `metadata` and `sep-835` exist only for **client** testing. Server suites are `active` (the default), `all`, `draft` and `pending` (README and https://github.com/modelcontextprotocol/conformance/blob/main/SDK_INTEGRATION.md).

**Frozen 2026-07-28 server requirement set** (https://github.com/modelcontextprotocol/conformance/blob/main/requirements/2026-07-28.yaml, anchored at 0.2.0-alpha.10):
- Lifecycle, tools, resources and prompts: `server-stateless`, `completion-complete`, `tools-list`, `tools-call-{simple-text,image,audio,embedded-resource,mixed-content,error,with-progress}`, `server-sse-multiple-streams`, `resources-{list,read-text,read-binary,templates-read}`, `sep-2164-resource-not-found`, `prompts-{list,get-simple,get-with-args,get-embedded-resource,get-with-image}`.
- Transport and caching: `dns-rebinding-protection`, `caching`.
- MRTR: 14 `input-required-result-*` scenarios, including `-tampered-state` and `-request-state`.
- Tasks scenarios are `not_scored` (reason `extension`).

**`server-stateless` check IDs** (`src/scenarios/server/stateless.ts`), which you can baseline one at a time as `scenario:check-id`:
- Discovery and identity: `sep-2575-server-implements-discover`, `sep-2575-discover-capabilities-match-handlers`, `sep-2575-server-identifies-in-result-meta`, `sep-2575-request-meta-client-info-optional`, `sep-2575-server-declares-prompts-in-discover`.
- HTTP error handling: `sep-2575-http-server-header-mismatch-400`, `sep-2575-http-server-meta-invalid-400`, `sep-2575-http-server-method-not-found-404`, `sep-2575-http-server-unsupported-version-400`, `sep-2575-server-unsupported-version-error`, `sep-2575-http-server-error-jsonrpc-id`, `sep-2575-http-server-no-independent-requests-on-stream`.
- Capabilities and logging: `sep-2575-missing-capability-http-400`, `sep-2575-server-rejects-undeclared-capability`, `sep-2575-server-no-log-without-loglevel`.
- Subscriptions: `sep-2575-server-sends-subscription-ack`, `sep-2575-server-tags-subscription-id`, `sep-2575-server-honors-notification-filter`, `sep-2575-server-sends-tools-list-changed-on-subscription`, `sep-2575-server-sends-prompts-list-changed-on-subscription`.

**Scenarios that need fixture tools.** `tools-call-*` expects fixture tools such as `test_simple_text`, `test_image_content`, `test_multiple_content_types` and `test_tool_with_logging` (`src/scenarios/server/tools.ts`). `server-stateless` calls `test_missing_capability`, `test_trigger_tool_change` and `test_trigger_prompt_change`. **A production server with 9 business tools fails most of the required set by design.** `tools-list` adds `tools-name-format` (1–128 chars, `[A-Za-z0-9_.-]`) and `tools-list-deterministic-order`.

**Baseline file format.**
```yaml
server:
  - tools-call-with-progress                               # whole scenario
  - server-stateless:sep-2575-server-implements-discover   # one check; "- a: b" is YAML map → rejected
```
- A failure listed in the baseline exits 0. A failure not listed exits 1.
- A pass that is still listed also exits 1 (stale entry). This works per check when you baseline a single check.
- A baselined check that is absent is tolerated. Listing a scenario both whole and per-check is rejected.

**How the go-sdk wires it** (https://github.com/modelcontextprotocol/go-sdk/blob/main/.github/workflows/conformance.yml):
- It pins `CONFORMANCE_VERSION: "0.2.0-alpha.11"`.
- It builds `./conformance/everything-server` and runs it twice: `-stateless=false` with `--requirements 2025-11-25`, then `-stateless` with `--requirements 2026-07-28`. Both runs use `--expected-failures ./conformance/baseline.yml`.
- The server baseline is empty; client entries are the OAuth extensions (https://github.com/modelcontextprotocol/go-sdk/blob/main/conformance/baseline.yml). The `known-sdks.ts` `specOverrides` document that go-sdk speaks 2026-07-28 only when started stateless.

**Version pinning.** On npm, `latest` is **0.1.16 (2026-03-30)** and `alpha` is **0.2.0-alpha.11 (2026-08-07)** (https://registry.npmjs.org/@modelcontextprotocol/conformance). The 0.1.16 dist contains no `2026-07-28` string, so a bare `npx` tests the wrong era.

**Inspector CLI v2** (latest 2.8.0; https://github.com/modelcontextprotocol/inspector/blob/main/clients/cli/README.md):
- List tools: `npx @modelcontextprotocol/inspector --cli https://host/mcp --transport http --header "Authorization: Bearer $T" --method tools/list --format json`
- Call a tool: `... --method tools/call --tool-name glide_get_work --tool-args-json '{"id":"..."}'`
- Stdio: `npx @modelcontextprotocol/inspector --cli ./ploeg-mcp stdio --method tools/list`
- `--strict` on `tools/list` exits 6 on non-portable schemas. It warns on an array-form `type` (`["null","boolean"]`), a remote `$ref`, or a keyword-less schema. It errors on a bare `true`/`false`.
- Exit codes: 3 auth, 4 unreachable, **5 = `isError:true` or tool not found**, 6 non-portable schema. Each non-zero exit writes one JSON `ErrorEnvelope` line to stderr.
- v2 changed exit codes and argument ordering from v1 (`docs/v1-to-v2-migration.md`).

**Third-party testers.** Janix-ai mcp-validator advertises 2024-11-05 through 2025-06-18 support only, so it is not useful for 2026-07-28 (https://github.com/Janix-ai/mcp-protocol-validator/blob/main/README.md). Others found but not assessed: https://github.com/RHEcosystemAppEng/mcp-validation, https://github.com/YawLabs/mcp-compliance, https://github.com/r-huijts/mcp-server-tester.

## 2. Go unit and integration testing

- **In-memory transport.** Use `t1, t2 := mcp.NewInMemoryTransports()`, then `server.Connect(ctx, t1, nil)` and `client.Connect(ctx, t2, nil)`. It speaks 2026-07-28 by default: the wire starts with `server/discover`, and results carry `resultType`, `ttlMs`, `cacheScope` and `_meta["io.modelcontextprotocol/serverInfo"]` (https://github.com/modelcontextprotocol/go-sdk/blob/main/docs/troubleshooting.md).
- **Wire logging.** `mcp.LoggingTransport{Transport: t2, Writer: &buf}` gives wire-level golden output. Sort the lines, because reads race writes (same doc).
- **HTTP tests.** Use `httptest.NewServer(mcp.NewStreamableHTTPHandler(getServer, &mcp.StreamableHTTPOptions{Stateless: true}))` with the SDK client's streamable transport, and add raw `POST`s to assert status codes.
  - A 2026-07-28 request is accepted **only** when `Stateless=true` (https://github.com/modelcontextprotocol/go-sdk/blob/main/docs/protocol.md).
  - Assert 405 on GET/DELETE, 404 plus `-32601` on an unknown method, 400 plus `-32020` on an `Mcp-Name` mismatch, and 400 plus `-32022` on an unsupported version (https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
- **Schema snapshots.** GitHub's `toolsnaps` stores one `__toolsnaps__/<tool>.snap` per tool. Tests fail on a diff, `UPDATE_TOOLSNAPS=true go test ./...` regenerates, and a missing snap fails when `GITHUB_ACTIONS=true` (https://github.com/github/github-mcp-server/blob/main/docs/testing.md). Their handler tests run in the order snapshot, then key schema assertions (such as the `ReadOnly` annotation), then a behaviour table. Forgejo sets `GITHUB_*` as aliases of `FORGEJO_*`, so that CI switch works there (https://forgejo.org/docs/latest/user/actions/reference/).
  - For ploeg-mcp, snapshot `tools/list` **per principal** (read-only, read+propose, owner). This is the regression test for "a tool that is not granted is not listed".
- **What schema inference produces.** jsonschema-go (the SDK's inference) maps structs to `additionalProperties: false`. Fields without `omitempty`/`omitzero` become `required`. Pointers become `["null", T]` and slices `["null","array"]` (https://github.com/google/jsonschema-go/blob/main/jsonschema/infer.go). So:
  - Snapshots catch required-set changes, which are breaking.
  - `--strict` will warn on your pointer and slice fields.
  - The SDK validates input against the input schema and output against the output schema (https://github.com/modelcontextprotocol/go-sdk/blob/main/docs/server.md, Tools section).
- **Fuzzing.** Native `go test -fuzz=FuzzToolArgs` over the raw `arguments` JSON asserts no panic and either a structured `isError` or `-32602`, never a 500 (https://go.dev/doc/security/fuzz/). Fuzz header/body mismatch cases too: base64 `=?base64?...?=` sentinels and case-insensitive header names.
- **Contract tests.** Ploeg publishes JSON Schema, not OpenAPI (ADR-0011).
  - Validate the shared operator client's requests and responses against those schemas.
  - ADR-0011's own Confirmation adds an in-memory run against a test ploegd, covering propose-stays-`proposed`, approve-declined-dispatches-nothing and read-only-cannot-list-write-tools.
  - GitHub mocks REST with `MockHTTPClientWithHandlers` and keeps e2e tests separate (testing.md above).

## 3. LLM-in-the-loop evaluation

**Anthropic's method** (https://www.anthropic.com/engineering/writing-tools-for-agents):
- Write realistic multi-step tasks ("Strong evaluation tasks might require multiple tool calls—potentially dozens"), each with a verifiable outcome.
- Verifiers range from string match to Claude-as-judge. Avoid "overly strict verifiers". Expected tools are optional; do not over-specify.
- Run "simple agentic loops (while-loops wrapping alternating LLM API and tool calls)", one per task.
- Track accuracy, runtime per tool call and per task, number of tool calls, total tokens and tool errors.
- Use held-out test sets "to ensure we did not overfit". Support a `response_format` of concise or detailed (206 vs 72 tokens in their example). Claude Code caps tool responses at 25,000 tokens.

**OpenAI guidance** (https://developers.openai.com/api/docs/guides/evaluation-best-practices): metric-based graders include "function call accuracy". Ask "Does the agent call the tool with the correct arguments?". Anti-patterns are "vibe-based evals" and not calibrating LLM judges against humans.

**Harnesses:**
- promptfoo: `providers[].config.mcp: {enabled: true, timeout: 60000, server: {url, headers}}`, or `servers:[...]` (https://www.promptfoo.dev/docs/integrations/mcp/). That page documents no MCP-specific tool-call assertion.
- Inspect AI: `mcp_server_http(name=..., url=..., authorization="$TOKEN")`, `mcp_tools(server, tools=[...])`, `react(tools=[server])` (https://inspect.aisi.org.uk/tools-mcp.html).
- LangChain agentevals: `create_trajectory_match_evaluator` (strict/unordered/subset/superset, `tool_args_match_mode`) and `create_trajectory_llm_as_judge` (https://github.com/langchain-ai/agentevals).
- mcp-evals: LLM rubric scoring 1–5, last push 2025-06-23, spawns a TS server path. Poor fit (https://github.com/mclenhard/mcp-evals).
- Benchmarks for metric ideas rather than direct use: MCP-Bench measures task completion, tool selection, parameter accuracy, planning and dependency awareness (https://github.com/Accenture/mcp-bench, arXiv 2508.20453). Also MCP-Universe (https://github.com/SalesforceAIResearch/MCP-Universe) and MCPMark (https://github.com/eval-sys/mcpmark).
- Not crawled, so no verified claims: Braintrust and LangSmith MCP-specific features.

**Concrete Claude Code headless setup through LiteLLM** (https://code.claude.com/docs/en/cli-reference, https://code.claude.com/docs/en/headless, https://docs.litellm.ai/docs/proxy/client_setup/claude_code):
```bash
# harness renders eval-mcp.json per principal (token injected; don't rely on shell expansion)
# {"mcpServers":{"ploeg":{"type":"http","url":"http://ploeg-mcp-eval:8080/mcp",
#   "headers":{"Authorization":"Bearer <eval-token>"},"timeout":120000}}}
ANTHROPIC_BASE_URL=https://litellm.internal ANTHROPIC_AUTH_TOKEN="$LITELLM_EVAL_KEY" \
claude --bare -p "$TASK_PROMPT" \
  --mcp-config eval-mcp.json --strict-mcp-config \
  --tools "" \
  --allowedTools "mcp__ploeg__glide_overview,mcp__ploeg__glide_find_work,mcp__ploeg__glide_get_work,mcp__ploeg__glide_recent_runs,mcp__ploeg__glide_changes_since,mcp__ploeg__glide_propose_work" \
  --permission-mode dontAsk --permission-prompts none \
  --max-turns 20 --max-budget-usd 0.50 --no-session-persistence \
  --model sonnet --output-format stream-json --verbose > runs/$TASK_ID.$SEED.jsonl
```
- `--tools ""` removes the built-in tools. It does not affect MCP tools.
- `--bare` skips `.mcp.json`, hooks and CLAUDE.md.
- `--permission-prompts none` needs Claude Code v2.1.259 or later.

Scoring with jq:
- Gate the run first: `select(.type=="system" and .subtype=="init") | .mcp_servers, .mcp_server_errors`. Fail if the server is not connected or the errors array is non-empty. An invalid entry is **skipped silently and the run exits 0** (headless doc).
- Tool calls: `select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | {name,input}`.
- Tool errors: `tool_result` blocks with `is_error` in the `user` messages.
- Totals from the final `result` line: cost (`total_cost_usd`), usage and turns.
- Steer tools: approve and cancel return MRTR elicitation. In `-p` with `--permission-prompts none`, unanswered elicitations are cancelled. Test "no elicitation → refusal plus Vloer link" as its own expected outcome.
- The Agent SDK (Python or TS) gives the same loop with native message objects when you need custom verifiers.

**Metrics to report per model and per tool-description version, 3–5 seeds, split train vs held-out:**
- Task success: a state verifier against the test ploegd (for example, a Work Item exists with status `proposed` and the right Team), or an answer verifier.
- Wrong-tool rate: a call outside the task's acceptable set, or a first call that is wrong.
- Argument-error rate: `-32602` or `isError` from validation.
- Retries: the same tool called again after an error.
- Excess calls over a minimal path.
- Tokens and cost per task, p95 wall time.
- Write-safety violations: any steer call attempted by a non-owner, any propose when the task said "just look".
- Output tokens per tool result, checked against the 25k cap.

## 4. Observability

**Semantic conventions.** OTel MCP semconv lives in the GenAI repo with status **Development** (https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md).
- Server span kind is `SERVER`. The span name is `{mcp.method.name} {gen_ai.tool.name}`.
- Required: `mcp.method.name`.
- Conditionally required: `gen_ai.tool.name`, `jsonrpc.request.id`, `rpc.response.status_code` (the JSON-RPC code as a string), and `error.type`. For `isError:true` results, `error.type` SHOULD be **`tool_error`**.
- Recommended: `gen_ai.operation.name=execute_tool`, `mcp.protocol.version`, `network.transport` (`tcp` for HTTP, `pipe` for stdio), `network.protocol.name/version`.
- Opt-in and sensitive: `gen_ai.tool.call.arguments` and `gen_ai.tool.call.result`.
- Metrics: `mcp.server.operation.duration` is a histogram in seconds with buckets `[0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,30,60,120,300]`. `mcp.server.session.duration` is meaningless when stateless.
- Gap: the well-known `mcp.method.name` list has no `server/discover` or `subscriptions/listen`, so use them as custom values.

**Trace propagation.** SEP-414 is Final (https://modelcontextprotocol.io/community/seps/414-request-meta). `traceparent`, `tracestate` and `baggage` go **unprefixed** in `params._meta`. The server SHOULD parent on the `_meta` context and link the HTTP span. The changelog records it (https://modelcontextprotocol.io/specification/2026-07-28/changelog). Claude Code propagates `traceparent` through a custom `ANTHROPIC_BASE_URL` only with `CLAUDE_CODE_PROPAGATE_TRACEPARENT=1` (https://code.claude.com/docs/en/env-vars).

**What go-sdk v1.8 provides.** It has **no built-in OTel**; the SDK closed SEP-414 as "No SDK work needed" (https://github.com/modelcontextprotocol/go-sdk/issues/934). Instrument with receiving `mcp.Middleware` (`func(MethodHandler) MethodHandler`, `mcp/shared.go`). **The JSON-RPC id is not exposed to middleware** (open proposal https://github.com/modelcontextprotocol/go-sdk/issues/1264), so `jsonrpc.request.id` cannot be recorded yet.

**Log one line per call to VictoriaLogs:**
- Protocol: `mcp.method.name`, tool, `mcp.protocol.version`, `clientInfo.name`/`version` (from `_meta`), transport, HTTP status, JSON-RPC code.
- Identity and correlation: principal/consumer, toolset grant, `trace_id`.
- Outcome: duration, argument bytes, result bytes and approximate tokens, `isError` plus a low-cardinality error class, `Mcp-Name` header vs body mismatch.
- For operator API calls: route, status and latency.
- Never log the token or the arguments by default.

**Sentry's lessons**, from 60M requests a month (https://www.zenml.io/llmops-database/scaling-an-mcp-server-for-error-monitoring-to-60-million-monthly-requests, talk https://www.youtube.com/watch?v=nlwRj7Mrkc8):
- They shipped with "no observability" and learned of outages from Twitter.
- A stdio transport break hit about 10% of queries unnoticed until they had per-transport analytics.
- The SDK's default catch returned "something went wrong".
- Sentry positions its MCP monitoring around "the silent ones MCP hides" (https://sentry.io/resources/mcp-observability/). mcp-use records `mcp.tool.is_error` (https://github.com/mcp-use/mcp-use/pull/2565).
- GitHub stores the upstream API errors in the context for middleware (https://github.com/github/github-mcp-server/blob/main/docs/error-handling.md). Copy that pattern for operator API errors.

**VictoriaMetrics naming.** VictoriaMetrics stores OTLP names unchanged by default. `-usePromCompatibleNaming`, `-opentelemetry.usePrometheusNaming` and `-opentelemetry.convertMetricNamesToPrometheus` each rename differently. Exponential histograms become `vmrange` (https://docs.victoriametrics.com/victoriametrics/integrations/opentelemetry/). VictoriaTraces ingests at `:10428/insert/opentelemetry/v1/traces`, with gRPC via `-otlpGRPCListenAddr=:4317` (https://docs.victoriametrics.com/victoriatraces/data-ingestion/opentelemetry/).

**Dashboard.** Prefer stat panels and tables:
- Calls and error rate per tool, **split protocol-error vs `tool_error`**.
- p95 per tool; result size p95 per tool.
- Calls by `clientInfo.name` and protocol version; 400/404 by JSON-RPC code (`-32020`/`-32022`/`-32601`); 401/403 rate.
- Operator API latency and errors; open listen streams.

**Alerts:**
- `tool_error` ratio above X% for 10m per tool.
- Any `-32020`/`-32022` spike after a deploy.
- p95 above 50s: Claude Code's 60s per-request limit.
- 5xx above 1%.
- Zero calls from a client that normally calls.

## 5. Operations

**Stateless means horizontally scalable, with two exceptions:**
- MRTR `requestState` carries elicitation across retries, so it must be sealed with a key shared by all replicas. GitHub requires `GITHUB_MCP_SERVER_MRTR_STATE_KEY` (32-byte base64), the same on every replica. They warn that "changing it invalidates confirmations already in flight" (https://github.com/github/github-mcp-server/blob/main/docs/streamable-http.md). Conformance tests `input-required-result-tampered-state`.
- A `subscriptions/listen` stream is long-lived SSE (changelog).

**Transport rules to implement** (streamable-http spec):
- Origin validation is a MUST, with 403.
- Answer 405 to GET and DELETE. Ignore `Mcp-Session-Id` and `Last-Event-ID`.
- SSE responses SHOULD carry `X-Accel-Buffering: no`. Listen streams are encouraged to send periodic `:` comment keep-alives.
- **Closing the SSE stream MUST be treated as cancellation.**
- A broken stream loses the request, and the client re-issues it with a new ID (changelog item 9).

**go-sdk v1.8 `StreamableHTTPOptions`** (https://github.com/modelcontextprotocol/go-sdk/blob/v1.8.0/mcp/streamable.go): `Stateless`, `JSONResponse`, `Logger`, `MaxRequestBodyBytes`, `DisableLocalhostProtection`, `CrossOriginProtection` and `PropagateRequestCancellation`.
- `CrossOriginProtection` is deprecated, and **nil means no Origin check**. Wrap the handler with `http.NewCrossOriginProtection().Handler(h)` instead.
- `PropagateRequestCancellation` defaults to **false**.
- I found no `X-Accel-Buffering` in `streamable.go`. The early `: ok` flush exists only for the standalone stream, with a comment on Envoy buffering HTTP/2 HEADERS frames. Add the header in your own middleware.

**Probes.**
- Liveness: a plain `/healthz`, not `/mcp`.
- Readiness: check that the operator API is reachable, or keep it cheap to avoid cascading failures.
- Do not probe `/mcp` with GET; stateless answers 405.

**Graceful shutdown.**
- `http.Server.Shutdown` waits "indefinitely for connections to return to idle" (https://pkg.go.dev/net/http#Server.Shutdown). Listen streams never go idle. Cancel them through a `BaseContext` you cancel on SIGTERM, bound `Shutdown` with a context shorter than `terminationGracePeriodSeconds`, and let tool calls finish.
- Add `preStop: sleep` (native sleep action since Kubernetes 1.30, KEP-3960) to cover the race with endpoint removal. Distroless images have no `/bin/sleep` (https://github.com/kubernetes/enhancements/blob/master/keps/sig-node/3960-pod-lifecycle-sleep-action/README.md).

**Timeouts, end to end.**
- Claude Code: each HTTP request times out at max(60s, per-server `timeout`, `MCP_TIMEOUT`) until the first response byte. The idle timeout is 5 min for network servers. `MCP_TOOL_TIMEOUT` defaults to about 28h. Progress notifications do not extend the per-server `timeout` (https://code.claude.com/docs/en/mcp, env-vars).
- Envoy defaults: route timeout **15s** ("typically a problem for streaming responses"), stream idle **5 min**, connection idle 1h (https://www.envoyproxy.io/docs/envoy/latest/faq/configuration/timeouts).
- Cilium: stream idle defaults to 300s. The Helm value `envoy.streamIdleTimeoutDurationSeconds` did not set `proxy-stream-idle-timeout-seconds` on 1.18.5 up to 1.19. The workaround is `extraConfig: {proxy-stream-idle-timeout-seconds: 3600}`; the issue was closed as not planned (https://github.com/cilium/cilium/issues/43814, https://github.com/cilium/cilium/issues/34582).
- Gateway API has `HTTPRoute.spec.rules[].timeouts.request/backendRequest` (https://gateway-api.sigs.k8s.io/geps/gep-1742/). **Not found:** what route timeout Cilium's generated config sets for an HTTPRoute with none. Verify on the cluster.
- nginx: `proxy_buffering on` and `proxy_read_timeout 60s` are the defaults. `X-Accel-Buffering: no` turns buffering off per response (https://nginx.org/en/docs/http/ngx_http_proxy_module.html).
- Keep the server's tool deadline (for example 45s) below every proxy and client limit. Long work is addressed by Work Item ID and polled, as ADR-0011 already decides.

**Caching `tools/list`.**
- `ttlMs` and `cacheScope` are required on list results. The SDK sets `cacheScope="public"` when a result leaves it empty and `ttlMs=0` on SDK-built lists.
- Set policy with `ServerOptions.SetCacheable`. It must not call back into `Server`, or it deadlocks (https://github.com/modelcontextprotocol/go-sdk/blob/main/docs/server.md#cacheable-list-results).
- Because the ploeg-mcp tool list varies by principal, set **`private`**.
- Tool lists SHOULD be in deterministic order (changelog; checked by `tools-list-deterministic-order`).

**Rate limits and cost.**
- Rate-limit per principal at the server or gateway. Intermediaries that trust the `Mcp-*` headers SHOULD check that the protocol version requires header–body validation (spec).
- Cost is dominated by tool-definition tokens per turn. Behind a non-first-party `ANTHROPIC_BASE_URL`, Claude Code **loads all MCP tools upfront** (tool search is off) unless `ENABLE_TOOL_SEARCH=true` and the proxy forwards `tool_reference` blocks (env-vars).
- Cap result size with pagination and `response_format`. `_meta["anthropic/maxResultSizeChars"]` raises Claude Code's per-tool limit up to 500k characters.

## 6. Lifecycle and versioning

**Evolving tools without breaking clients.**
- Additive only: new optional properties, new tools.
- Removing, renaming or making a property required is breaking. With `additionalProperties:false` from struct inference, a client using a stale schema fails loudly with `-32602`, not silently.
- Renames: keep an alias map old→new (GitHub's `DeprecatedToolAliases` in `pkg/github/deprecated_tool_aliases.go`), which "silently resolve[s] old names" in config filters. GitHub has collapsed 25 legacy names into `actions_*`/`projects_*` (https://github.com/github/github-mcp-server/blob/main/docs/tool-renaming.md). For ploeg-mcp, apply aliases to toolset and grant config and to `tools/call` names, and list only the canonical names.
- Deprecation windows: MCP now has a lifecycle policy with at least 12 months of deprecation for spec features (changelog, SEP-2596). Mirror that: announce, alias, then remove in a major version.
- `notifications/tools/list_changed` only reaches clients holding a `subscriptions/listen` stream. For a deploy-time change, rely on `ttlMs` plus restart.
- Version by semver in `Implementation.Version` (it appears in `_meta.io.modelcontextprotocol/serverInfo`), and keep a changelog section "Tool contract changes" generated from toolsnap diffs.

**Registry.** The MCP Registry is in **preview** with API freeze v0.1. "Breaking changes or data resets may occur" (https://github.com/modelcontextprotocol/registry; https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/remote-servers.mdx).
- `server.json` `$schema`: `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`, with `remotes:[{type:"streamable-http",url}]`. A remote "**MUST** be publicly accessible".
- OCI packages use `registryType:"oci"` with `LABEL io.modelcontextprotocol.server.name=...`. Only Docker Hub, GHCR, Quay, `*.pkg.dev`, ACR and MCR are accepted, **so a self-hosted Forgejo registry is not** (https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx).
- Versions are immutable, and ranges are prohibited (https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/versioning.mdx).
- A private registry means running a subregistry that implements the generic API (`GET /v0.1/servers`, etc.; https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/generic-registry-api.md).

**Other distribution channels.**
- `.mcpb` bundles are local-only zip files with `manifest.json`, `server.type: binary` works for Go, built with `mcpb init/pack/sign/verify`. They do not support remote HTTP (https://github.com/modelcontextprotocol/mcpb).
- Cursor: `cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64` (https://cursor.com/docs/context/mcp/install-links).
- VS Code: `vscode:mcp/install?<urlencoded JSON>` and `https://insiders.vscode.dev/redirect/mcp/install?name=..&config=..`. These come from search snippets of https://code.visualstudio.com/api/extension-guides/ai/mcp; I did not fetch that page.
- Claude Code: `claude mcp add --transport http ploeg https://.../mcp --header "Authorization: Bearer ..."`.
- Claude.ai custom connectors connect from Anthropic's cloud, so the URL must be public or reached via "MCP tunnels". Request-header auth is beta and limited to some organizations (https://claude.com/docs/connectors/custom/remote-mcp).

**Docs to ship.** Model them on https://github.com/github/github-mcp-server/tree/main/docs:
- One install guide per client under `installation-guides/`.
- Server configuration, remote server, toolsets, tool renaming, error handling, testing.

For ploeg-mcp:
- Install snippets for Claude Code, Codex, OpenCode and Cursor, over stdio and HTTP.
- A tool reference generated from toolsnaps: name, toolset, read-only or destructive annotation, arguments, example.
- A grants matrix per principal.
- Security notes: no token passthrough, elicitation-gated steer, Origin policy.
- Timeouts and limits.
- Changelog and deprecations.

## 7. Traps (with evidence)

1. **A bare `npx` runs the old referee.** `latest` = 0.1.16, which predates 2026-07-28. Pin `@0.2.0-alpha.11` or newer (npm registry above; the go-sdk pins alpha.11).
2. **ADR-0011's Confirmation command cannot pass against the production binary.** The 2026-07-28 required set needs fixture tools (`test_simple_text`, `test_trigger_tool_change`, ...). Build a `-tags conformance` variant of ploeg-mcp that adds the everything-server fixtures behind the **same** handler and middleware stack. Run protocol scenarios (`server-stateless`, `tools-list`, `caching`, `dns-rebinding-protection`) against the real binary, and baseline the rest per check (requirements yaml, tools.ts, stateless.ts).
3. **`dns-rebinding-protection` only runs against localhost URLs.** Against the ingress URL it tests nothing (`src/scenarios/server/dns-rebinding.ts`).
4. **`uses: modelcontextprotocol/conformance@v0.1.11` on Forgejo resolves against `data.forgejo.org`**, not GitHub. Use the full `https://github.com/...` URL or plain `npx` (Forgejo actions reference).
5. **Green conformance does not mean it works in Claude.ai.** Claude.ai connects from Anthropic's cloud, and static-header auth is beta. One reported case (closed, no maintainer reply visible) had Claude.ai send no header and start OAuth instead (https://github.com/anthropics/claude-ai-mcp/issues/967; connectors doc).
6. **`isError` results are HTTP 200, so RED metrics look green** while tools fail. Record `error.type=tool_error` (semconv) and split it on dashboards; Sentry's "silent ones".
7. **Per-principal `tools/list` gets `cacheScope:"public"` by default.** A shared intermediary may serve the owner's steer tools to a read-only user. Set `private` in `SetCacheable` (go-sdk server.md).
8. **No Origin validation by default.** `CrossOriginProtection` nil means none, while the spec says MUST (streamable.go v1.8.0; spec).
9. **SSE buffered or cut by the ingress.**
   - The SDK sends no `X-Accel-Buffering`.
   - nginx buffers by default and reads with a 60s timeout.
   - Envoy's route timeout is 15s and stream idle is 5 min. The Cilium Helm idle value is ignored on 1.18.5 up to 1.19.
10. **The listen stream gets killed and the client gives up.** Claude Code reopens a listen stream at most 3 times if it closes within 10s. After 5 reopens in an hour it waits about 6h. An idle timeout that kills the stream every 5 minutes therefore silently stops `list_changed` delivery. Send `:` keep-alives (Claude Code mcp doc; spec note).
11. **The 60s first-byte limit.** Claude Code's per-request timer runs until the first response byte (60s minimum). `JSONResponse:true`, or SSE without an early flush, makes calls longer than 60s fail client-side while the server logs success.
12. **Disconnects cancel, or don't cancel, work.** The spec says a closed stream is cancellation. `PropagateRequestCancellation` defaults to false, so orphaned handlers keep calling the operator API. Turning it on means a proxy timeout aborts a mutating call mid-flight.
13. **Retry duplicates.** The client MUST re-issue a lost request with a new ID. Without idempotency keys on propose, approve, reject and cancel, a retry double-writes. ADR-0011 keys only propose.
14. **MRTR state across replicas.** Unsealed or unauthenticated `requestState` is tamperable, and a per-pod key breaks approvals that land on another replica. Use a shared, stable key (GitHub streamable-http.md; conformance `-tampered-state`).
15. **Elicitation "accept" is asserted by the client.** An automated client can return `accept`. This is my inference from the MRTR design: the client supplies `inputResponses` on retry. Therefore also gate steer tools on the principal (owner only), as ADR-0011 does.
16. **Shutdown hangs.** `Shutdown` waits indefinitely, listen streams never idle, and the pod is SIGKILLed after the grace period, which drops in-flight calls (Go docs).
17. **Tool lists cached after a rename.** Claude Code's discovery cache keeps a tool list up to 4h by default (`MCP_DISCOVERY_CACHE_MAX_STALE_S=14400`, up to 7 days) and connects on first use. With `ttlMs` also cached, renamed tools yield "tool not found". Keep aliases (env-vars; GitHub tool-renaming).
18. **A breaking schema change that is loud, or silent.** Inferred structs reject unknown or renamed properties (`-32602`), which is loud. A handler decoding into `map[string]any` or a hand-written schema without `additionalProperties:false` **silently drops** the renamed parameter and runs with defaults (infer.go; go-sdk validation).
19. **Nullable types break some clients.** Pointer and slice fields produce array-form `type`, which "several MCP clients" reject or ignore. Inspector `--strict` warns (infer.go; Inspector README).
20. **The eval environment differs from production.** Through LiteLLM, Claude Code turns off tool search and loads all tools upfront. First-party users defer them. Token and wrong-tool numbers do not transfer (env-vars `ANTHROPIC_BASE_URL`, `ENABLE_TOOL_SEARCH`).
21. **Evals pass with zero tools.** An invalid `--mcp-config` entry is skipped and the run exits 0. Gate on `system/init.mcp_servers[].status` and `mcp_server_errors` (headless doc).
22. **Evals overfit to tool descriptions.** Iterating descriptions on the same tasks inflates scores. Keep a held-out split (Anthropic).
23. **Relying on `ServerSession.Elicit` in stateless mode.** Server-to-client requests are "rejected immediately", so use the `InputRequests` return path (streamable.go `Stateless` doc; server.md MRTR).
24. **Logs look fine while a transport is broken.** Sentry's stdio break hit about 10% of traffic unnoticed without per-transport metrics. Label `network.transport` (zenml case study).
25. **Dashboards break on a flag change.** Toggling VictoriaMetrics OTLP naming flags renames `mcp.server.operation.duration` series (VM docs).
26. **Trace gaps.** Keys prefixed as `io.modelcontextprotocol.traceparent` break correlation (SEP-414). `jsonrpc.request.id` is unavailable in go-sdk middleware (#1264). Through LiteLLM, Claude Code sends no `traceparent` unless `CLAUDE_CODE_PROPAGATE_TRACEPARENT=1`.
27. **Localhost protection 403s.** DNS-rebinding "localhost protection" rejects requests arriving on 127.0.0.1 with a non-localhost Host header. A sidecar proxy forwarding to localhost gets 403 (`DisableLocalhostProtection` doc, streamable.go).
28. **Oversized results get truncated to files.** Results above 25k tokens are moved out of context in Claude Code, so the model never sees them (Claude Code mcp doc).

## 8. CI and ops checklist for ploeg-mcp

1. `go test ./cmd/ploeg-mcp/...` uses `mcp.NewInMemoryTransports()` against a test ploegd. Cover every tool and each ADR-0011 Confirmation case.
2. Toolsnaps: one snap per tool **and** one `tools/list` snap per principal (read, read+propose, owner). A missing snap fails when `FORGEJO_ACTIONS`/`GITHUB_ACTIONS` is set.
3. A test asserting that no required field or property was removed or renamed without an alias entry and a major version bump.
4. `httptest` stateless tests covering 405 on GET/DELETE, 404/`-32601`, 400/`-32020` on header mismatch (including base64 sentinels), 400/`-32022`, and 403 on a bad Origin.
5. `go test -fuzz` on tool arguments and header decoding, run nightly for a time-boxed period.
6. Contract tests: the shared operator client validated against Ploeg's published JSON Schemas.
7. Conformance on the real binary, pinned `@modelcontextprotocol/conformance@0.2.0-alpha.11` (or newer, pinned): `--requirements 2026-07-28 --expected-failures conformance/baseline.yml`, per-check baseline entries only.
8. Conformance on the `-tags conformance` fixture build, with the same middleware stack, for the full required set, run against `http://127.0.0.1` so `dns-rebinding-protection` actually runs.
9. Stale-baseline failure is left on: a pass that is still listed exits 1.
10. `npx @modelcontextprotocol/inspector@2 --cli <url> --transport http --method tools/list --strict` fails CI on exit 6. Warnings are reviewed.
11. An Inspector smoke test per principal: `tools/call` on each read tool, where exit 5 fails the job.
12. Stdio smoke: `ploeg-mcp stdio` with the Inspector `--method tools/list`.
13. An eval job (nightly and on tool-description changes): Claude Code `--bare -p` through LiteLLM, fixed seeds, train and held-out split, with the init-event gate.
14. Eval metrics are stored per run: task success, wrong-tool rate, argument errors, retries, excess calls, tokens and cost per task, p95 time. Regression over 5 points fails.
15. Eval both with tool search off (LiteLLM) and once with `ENABLE_TOOL_SEARCH=true` if the proxy supports it, and document which matches users.
16. Receiving middleware emits semconv spans and metrics, including `error.type=tool_error` and `network.transport`. It extracts `_meta.traceparent` and links the HTTP span.
17. OTLP goes to VictoriaTraces `/insert/opentelemetry/v1/traces` and VictoriaMetrics `/opentelemetry/v1/metrics`. Pin the naming flag, and pin dashboard queries to the resulting names.
18. A structured per-call log with principal, tool, duration, result bytes, `isError` and the operator API status. No tokens or arguments by default.
19. Alerts: `tool_error` ratio, p95 above 50s, 5xx above 1%, and spikes of `-32020`/`-32022`/401 after a deploy.
20. `SetCacheable`: `cacheScope:"private"` plus a modest `ttlMs` (for example 300000), and deterministic tool order.
21. Origin: `http.NewCrossOriginProtection()` wrapping the handler, with an explicit allowlist.
22. Middleware sets `X-Accel-Buffering: no` on SSE responses. Listen streams get `:` keep-alives every 15–30s.
23. A server-side tool deadline of 45s or less, and long work returns a Work Item ID for polling.
24. HTTPRoute `timeouts.request` set explicitly. Verify Cilium's effective route and stream-idle values on the cluster. Set `proxy-stream-idle-timeout-seconds` via `extraConfig` if on 1.18.x. These values live in `homelab-cluster`, not in this repo.
25. `PropagateRequestCancellation` decided deliberately, with idempotency keys on propose, approve, reject and cancel.
26. The MRTR `requestState` key is SOPS-sealed, shared by all replicas, and rotated only between deploys.
27. Probes: liveness `/healthz`, readiness as a cheap operator API check, never `/mcp`.
28. Shutdown: a `BaseContext` cancelled on SIGTERM, `Shutdown(ctx)` shorter than `terminationGracePeriodSeconds`, and `preStop: sleep: {seconds: 5}`.
29. `MaxRequestBodyBytes` set explicitly. Rate limiting per principal at the gateway.
30. Result size budget: paginate and support `response_format`, and test each tool's worst case against 25k tokens.
31. Rename policy: an alias map, deprecation noted in the changelog, and removal only in a major version with aliases kept for at least one release.
32. The version in `Implementation.Version` matches the image tag and chart `appVersion`. The changelog has a "Tool contract" section generated from snap diffs.
33. Docs: per-client install snippets (Claude Code `claude mcp add --transport http`, Codex, OpenCode, Cursor deeplink), a generated tool reference, a grants matrix, security notes and a timeouts table.
34. Registry: only needed for the public OAuth phase (it requires a public URL and an allowed OCI registry). Before that, if a catalog is needed, use a private generic-API subregistry.
35. A Claude.ai end-to-end check (manual, before each public-route release): connect, list per principal, one read call, one elicitation-gated steer call.

Absences recorded above:
- No go-sdk OTel package, and no request ID exposed to middleware.
- The semconv lacks `server/discover` and `subscriptions/listen`.
- promptfoo's MCP page documents no tool-call assertion.
- mcpb has no remote support.
- Cilium's default HTTPRoute route timeout is undocumented in what I crawled.
- Braintrust and LangSmith MCP features were not crawled.
- The VS Code link format was taken from search snippets only.
