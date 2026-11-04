# Observability and audit

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## LiteLLM OpenTelemetry integration (legacy `otel` callback and LITELLM_OTEL_V2 engine) { #litellm-otel }

Not to be confused with: Not a standard; it is LiteLLM's own emitter. There are two code paths. (1) The legacy callback (litellm/integrations/opentelemetry.py) emits 'litellm_request' spans with gen_ai.system, llm.is_streaming and a raw_gen_ai_request child span. Setting OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental switches it to OTel GenAI, added 2026-05-16 (https://github.com/BerriAI/litellm/blob/main/litellm/integrations/opentelemetry_utils/gen_ai_semconv.py). (2) LITELLM_OTEL_V2=true, off by default, is a typed engine added 2026-05-30. Its mapper chain always starts with 'genai', plus optional legacy/openinference/langfuse/weave/langtrace, and it adds auth, guardrail, cache, route, redis and postgres spans (https://github.com/BerriAI/litellm/blob/main/litellm/integrations/otel/README.md, https://github.com/BerriAI/litellm/blob/main/litellm/integrations/otel/model/config.py). absence: no LITELLM_OTEL_V2 mention found under docs/ by GitHub code search.

| | |
| --- | --- |
| Steward | BerriAI (single-vendor) |
| Status | stabilising |
| Latest | [v1.108.0 2026-11-04](https://github.com/BerriAI/litellm/releases/tag/v1.108.0) |
| Radar | **trial**: Fit decided it: the gateway already exports OTel, and the opt-in is a one-line change, but the GenAI path has open bugs on tool calls and streaming. |
| Moves when | Adopt when LiteLLM PR 45920 (tool-call parts and finish reason) is released and the opt-in passes on staging with message logging off. |
| Competes with | — |
| Complements | [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv), [OpenInference semantic conventions and instrumentations](observability.md#openinference) |
| Builds on | [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Superseded by | — |
| Decisions | [0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role](../../../../../apps/ploeg/docs/adrs/0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role.md), [0076-run-health-is-observable-by-team-and-role-through-one-correlation-key](../../../../../apps/ploeg/docs/adrs/0076-run-health-is-observable-by-team-and-role-through-one-correlation-key.md), [0049-a-run-card-reads-the-gateway-for-usage-so-far-while-a-run-is-running](../../../../../apps/ploeg/docs/adrs/0049-a-run-card-reads-the-gateway-for-usage-so-far-while-a-run-is-running.md), [0012-two-level-budgets-authorized-and-settled](../../../../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Turn on the GenAI opt-in on the gateway (proposed) | LiteLLM gateway | Staging LiteLLM uses the legacy otel callback; set OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental so its spans carry GenAI names that join ADR-0113's harness traces. | S | Gateway and harness spans in one vocabulary. |
| Check gen_ai.operation.name with message logging off | LiteLLM gateway | Staging sets message_logging false for privacy; LiteLLM issue 45284 drops gen_ai.operation.name when message logging is off, so test before relying on that attribute. | S | Avoids dashboards that silently group everything as unknown. |
| Hold the V2 engine until the Events API break is fixed | LiteLLM gateway | opentelemetry-api 1.44 breaks LITELLM_OTEL_V2 (issue 41990); stay on the legacy callback with the opt-in. | S | No broken export after an upgrade. |
| Join gateway spans on the Run alias (proposed) | Run tracing | Ploeg ADR-0076 makes ploeg.run.alias the correlation key; the key alias ploeg-<12hex> should appear as a span attribute. | S | A Run's gateway calls are findable from its Work Item. |
| Live usage from traces is not settlement | Ploeg settlement | Spans can feed Unfold's live view (Ploeg ADR-0049) but settlement stays on spend logs per ADR-0012 and ADR-0177. | S | Keeps money facts on durable sources. |

**Shipped adoption:** "Code present on main (https://github.com/BerriAI/litellm/tree/main/litellm/integrations/otel)"; "OTel packages bumped to 1.44.0/0.65b0 (https://github.com/BerriAI/litellm/pull/45593)"

**Open problems:** "Tool-call responses are recorded as empty parts and the streamed finish reason is wrong (https://github.com/BerriAI/litellm/issues/45796), fix PR open (https://github.com/BerriAI/litellm/pull/45920)"; "gen_ai.operation.name goes missing when turn_off_message_logging is set (https://github.com/BerriAI/litellm/issues/45284)"; "opentelemetry-api >= 1.44.0 breaks the V2 integration through Events API removal (https://github.com/BerriAI/litellm/issues/41990)"

**Watched:** github-releases `BerriAI/litellm` at v1.108.0

## OpenInference semantic conventions and instrumentations { #openinference }

Not to be confused with: Arize's own OTel-based attribute vocabulary (llm.*, openinference.span.kind) behind Arize Phoenix. It is not the OTel GenAI conventions, but it can dual-write them.

| | |
| --- | --- |
| Steward | Arize AI (single-vendor) |
| Status | stable |
| Latest | [python-openinference-semantic-conventions v0.1.43 2026-10-29](https://github.com/Arize-ai/openinference/releases/tag/python-openinference-semantic-conventions-v0.1.43) |
| Radar | **hold**: Fit decided it: a single-vendor vocabulary competing with the GenAI conventions Unfold aims at. |
| Moves when | OpenInference ships full GenAI dual-write by default, or a self-hoster requires Phoenix. |
| Competes with | [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv), [OpenLLMetry (Traceloop) and opentelemetry-semantic-conventions-ai](observability.md#openllmetry-semconv-ai) |
| Complements | [LiteLLM OpenTelemetry integration (legacy `otel` callback and LITELLM_OTEL_V2 engine)](observability.md#litellm-otel) |
| Builds on | [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Superseded by | — |
| Decisions | [0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role](../../../../../apps/ploeg/docs/adrs/0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role.md), [0076-run-health-is-observable-by-team-and-role-through-one-correlation-key](../../../../../apps/ploeg/docs/adrs/0076-run-health-is-observable-by-team-and-role-through-one-correlation-key.md), [0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks](../../../../../apps/ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Do not adopt as the trace vocabulary | Run tracing | Ploeg ADR-0113 points harnesses at an OTLP collector; OpenInference's llm.* names would split dashboards from GenAI-named gateway metrics. | S | One vocabulary. |
| Accept dual-written data if a self-hoster runs Phoenix | self-hosting docs | With OPENINFERENCE_ENABLE_GENAI_SEMCONV=true, OpenInference also writes GenAI names; note it as compatible. | S | Self-hosters keep their Phoenix. |
| LiteLLM's openinference mapper stays off | LiteLLM gateway | Choose LiteLLM's GenAI mapper rather than its openinference mapper. | S | Consistent gateway spans. |
| Evaluation tooling reference | Ploeg bake-offs | Phoenix's evaluation features are a design reference for the shadow judge (Ploeg ADR-0135), without a dependency. | S | Ideas without lock-in. |
| Watch GenAI coverage | Run tracing | Coverage is 34 of 79 attributes; recheck if a self-hoster asks. | S | Know when it becomes interchangeable. |

**Shipped adoption:** Instrumentations shipped 2026-10-31, e.g. openinference-instrumentation-anthropic v3.3.0 (https://github.com/Arize-ai/openinference/releases/tag/python-openinference-instrumentation-anthropic-v3.3.0); LiteLLM openinference mapper (https://github.com/BerriAI/litellm/blob/main/litellm/integrations/otel/README.md); Spec (https://github.com/Arize-ai/openinference/tree/main/spec)

**Open problems:** A bidirectional GenAI compatibility layer is still unpublished (https://github.com/Arize-ai/openinference/issues/2817); Request for a config switch to emit GenAI-format attributes (https://github.com/Arize-ai/openinference/issues/2983); GenAI coverage is 34/79 attributes per the harness in https://github.com/Arize-ai/openinference/pull/4031 (open)

**Watched:** rss `https://github.com/Arize-ai/openinference/releases.atom`

## OpenLLMetry (Traceloop) and opentelemetry-semantic-conventions-ai { #openllmetry-semconv-ai }

Not to be confused with: Traceloop's Python/TS instrumentation SDK. Its older attribute names (llm.*, gen_ai.prompt.N) are what LiteLLM calls the 'legacy' vocabulary. The README says 'Our semantic conventions are now part of OpenTelemetry'.

| | |
| --- | --- |
| Steward | Traceloop (single-vendor) |
| Status | stabilising |
| Latest | [0.62.4 2026-09-29](https://github.com/traceloop/openllmetry/releases/tag/0.62.4) |
| Radar | **hold**: Fit decided it: superseded by the OTel GenAI conventions, per its own README. |
| Moves when | None expected; drop the record once LiteLLM's legacy mapper is removed. |
| Competes with | [OpenInference semantic conventions and instrumentations](observability.md#openinference) |
| Complements | [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Builds on | [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Superseded by | [OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific)](observability.md#otel-genai-semconv) |
| Decisions | [0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role](../../../../../apps/ploeg/docs/adrs/0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role.md), [0002-native-node-and-single-writer-storage](../../../../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Move LiteLLM off the legacy names | LiteLLM gateway | LiteLLM's legacy mapper emits these names; switch to the GenAI opt-in so traces match ADR-0113. | S | Removes a superseded vocabulary from the trace store. |
| No SDK in Ploeg or Unfold | Ploeg / Unfold | Ploeg is Go and Unfold has one npm runtime dependency (Unfold ADR 0002); a Python or TS instrumentation SDK does not fit. | S | No dependency growth. |
| Credential-leak lesson for span content | Run tracing | OpenLLMetry leaked credentials onto spans through object walks; keep ADR-0113's logPrompts default false and redact tool details. | S | Keeps secrets out of traces. |
| Ignore its Responses metrics gap | Run tracing | It records no metrics for the Responses API; irrelevant while Runs use Chat Completions. | S | No action needed. |
| Map old dashboards (proposed) | Run tracing | If any panel uses gen_ai.prompt.N or llm.*, rename it to GenAI names during the switch. | S | No broken panels after the switch. |

**Shipped adoption:** Release 0.62.4 with MCP client span fixes (https://github.com/traceloop/openllmetry/releases/tag/0.62.4); LiteLLM 'legacy' mapper emits these names (https://github.com/BerriAI/litellm/blob/main/litellm/integrations/otel/README.md)

**Open problems:** Agent observability semconv RFC still open (https://github.com/traceloop/openllmetry/issues/3460); OpenAI Responses API records no metrics (https://github.com/traceloop/openllmetry/issues/4585); A CrewAI __dict__ walk leaked credentials onto spans, fixed in 0.62.4 (https://github.com/traceloop/openllmetry/releases/tag/0.62.4)

**Watched:** github-releases `traceloop/openllmetry` at 0.62.4

## OpenTelemetry Semantic Conventions for Generative AI (client, agent, MCP, A2A, provider-specific) { #otel-genai-semconv }

Not to be confused with: Since semconv v1.42.0 (2026-06-12) every gen_ai.*, openai.* and mcp.* definition in open-telemetry/semantic-conventions is deprecated and lives in the separate repo open-telemetry/semantic-conventions-genai (https://github.com/open-telemetry/semantic-conventions/releases/tag/v1.42.0, https://github.com/open-telemetry/semantic-conventions/issues/3696). This is not OpenInference and not Traceloop's semantic-conventions-ai.

| | |
| --- | --- |
| Steward | OpenTelemetry GenAI SIG (CNCF) (foundation) |
| Status | draft |
| Latest | [no release; main branch (repo created 2026-05-05, pushed 2026-11-04); core semconv is at v1.45.0 (2026-11-02) 2026-11-04](https://github.com/open-telemetry/semantic-conventions-genai) |
| Radar | **trial**: Fit decided it over maturity: every document is still Development, but both gateways and ADR-0113 already point at it. |
| Moves when | Adopt when the GenAI repository tags a release with a schema URL; hold if the agent span names are renamed again. |
| Competes with | [OpenInference semantic conventions and instrumentations](observability.md#openinference), [OpenLLMetry (Traceloop) and opentelemetry-semantic-conventions-ai](observability.md#openllmetry-semconv-ai) |
| Complements | [LiteLLM OpenTelemetry integration (legacy `otel` callback and LITELLM_OTEL_V2 engine)](observability.md#litellm-otel), [Supply Chain Integrity, Transparency, and Trust (SCITT) - RFC 9943 architecture, RFC 9942 COSE Receipts, SCRAPI](security-supply-chain.md#ietf-scitt), [IETF AUDIT (Agent Use of Delegation and Interaction Traceability) BoF](security-supply-chain.md#ietf-audit) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role](../../../../../apps/ploeg/docs/adrs/0113-a-runs-harness-exports-opentelemetry-to-a-collector-set-per-team-and-role.md), [0076-run-health-is-observable-by-team-and-role-through-one-correlation-key](../../../../../apps/ploeg/docs/adrs/0076-run-health-is-observable-by-team-and-role-through-one-correlation-key.md), [0074-ploeg-exposes-its-execution-facts-and-consumers-collect-everything-else](../../../../../apps/ploeg/docs/adrs/0074-ploeg-exposes-its-execution-facts-and-consumers-collect-everything-else.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md), [2026-10-01-vscode-1-140-fit](../../../../../apps/unfold/docs/research/2026-10-01-vscode-1-140-fit.md), [2026-10-30-model-gateway-contract](../../../../../apps/ploeg/docs/research/2026-10-30-model-gateway-contract.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Name Run spans after invoke_agent and execute_tool (proposed) | Run tracing | Ploeg ADR-0113 (proposed) exports harness OTel per Team and Role; ploeg.run.alias joins it, and gen_ai.* names let gateway, harness and Ploeg spans share one vocabulary, as the 1.140 dossier recommends. | M | One trace per Run across harness, gateway and Ploeg. |
| Gateway usage metrics in GenAI names | LiteLLM gateway / Agent Router | Agent Router emits gen_ai.client.token.usage; LiteLLM can with the opt-in. Dashboards keyed on these survive an ADR-0177 gateway switch. | S | Dashboards that do not change with the gateway kind. |
| MCP spans for unfold-mcp and ploeg-mcp (proposed) | unfold-mcp / ploeg-mcp | The 2026-09-30 MCP patterns record proposes spans named {mcp.method.name} {gen_ai.tool.name}; implement them in both servers. | S | Shows which tools fail silently with isError results. |
| Pin a commit, not a release | Run tracing | The repository has no tagged release or schema URL; record the pinned commit in ADR-0113's Confirmation. | S | Reproducible attribute names despite churn. |
| Propose a cost attribute (proposed) | standards participation | Ploeg ADR-0110 names a GenAI cost or budget attribute as a trigger; the owner could propose one. | S | Standard place for per-Run spend in traces. |

**Shipped adoption:** LiteLLM: OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental, added 2026-05-16 (https://github.com/BerriAI/litellm/pull/27418), and the LITELLM_OTEL_V2 genai mapper (https://github.com/BerriAI/litellm/pull/28909); OpenInference dual-write behind OPENINFERENCE_ENABLE_GENAI_SEMCONV=true, validated against the new repo (https://github.com/Arize-ai/openinference/pull/4031); OpenLLMetry emits gen_ai.client.operation.duration and gen_ai.client.token.usage (https://github.com/traceloop/openllmetry/issues/4585); Conformance harness that runs instrumentors against the registry (https://github.com/open-telemetry/semantic-conventions-conformance)

**Open problems:** Every doc is Status: Development, including agent spans (https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md) and MCP (https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md); README still says 'Schema URL: TODO' and there is no tagged release, so consumers pin commits (https://github.com/open-telemetry/semantic-conventions-genai); Attribute churn: gen_ai.usage.cache_creation.input_tokens was renamed to cache_write (genai #440) and top_k changed type (#217), both cited in https://github.com/Arize-ai/openinference/pull/4031; Open PRs: agent lifecycle events for async runs (https://github.com/open-telemetry/semantic-conventions-genai/pull/445), guardrail span (https://github.com/open-telemetry/semantic-conventions-genai/pull/427), ollama provider value (https://github.com/open-telemetry/semantic-conventions-genai/pull/663)

**Watched:** rss `https://github.com/open-telemetry/semantic-conventions-genai/commits/HEAD.atom`, github-releases `open-telemetry/semantic-conventions` at v1.45.0
