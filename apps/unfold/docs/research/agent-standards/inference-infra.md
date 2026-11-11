# Inference and agent runtime infrastructure

Generated from [`standards.yaml`](standards.yaml); see the [catalogue](index.md).

## Agent Router (formerly Envoy AI Gateway) { #agent-router }

Not to be confused with: AI/MCP gateway built on Envoy Gateway; CRDs AIGatewayRoute, MCPRoute (aigateway.envoyproxy.io/v1beta1), QuotaPolicy; CLI aigw; renamed and moved to AAIF (2026-09-10 [secondary] https://www.truefoundry.com/blog/envoy-ai-gateway-review)

| | |
| --- | --- |
| Steward | Agentic AI Foundation (listed on https://aaif.io/projects/) (foundation) |
| Status | stabilising |
| Latest | [v1.2.0 2026-10-07](https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0) |
| Radar | **trial**: Fit decided it: ADR-0177 already chose it as the second implementation, and v1.2.0 is foundation-hosted, but the QuotaPolicy window gaps and the per-tenant bucket bug fixed only in 1.2.0 keep it to a spike. |
| Moves when | Adopt when the ADR-0177 contract suite passes against Agent Router on a staging cluster and ADR-0177 is accepted; hold if the spike shows a client can select a model outside its JWT claim. |
| Competes with | [agentgateway](inference-infra.md#agentgateway), [LiteLLM Proxy (AI Gateway)](inference-infra.md#litellm), [Vendor MCP gateways (Kong AI MCP Proxy/OAuth2, Docker MCP Gateway, Microsoft MCP Gateway)](inference-infra.md#vendor-mcp-gateways) |
| Complements | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Builds on | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Superseded by | — |
| Decisions | [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0008-litellm-is-the-credential-and-metering-seam](../../../../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md), [2026-10-30-model-gateway-contract](../../../../../apps/ploeg/docs/research/2026-10-30-model-gateway-contract.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0162-a-team-spends-at-most-its-cap-per-period-and-a-claim-over-it-starts-nothing](../../../../../apps/ploeg/docs/adrs/0162-a-team-spends-at-most-its-cap-per-period-and-a-claim-over-it-starts-nothing.md), [0107-execution-runs-in-cells-that-pull-from-one-hub](../../../../../apps/ploeg/docs/adrs/0107-execution-runs-in-cells-that-pull-from-one-hub.md) |
| Watchlist | T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Second gateway implementation of the gateway contract (proposed) | LiteLLM gateway seam / Ploeg pkg/gateway | Ploeg ADR-0177 (proposed) names Envoy AI Gateway, now Agent Router, as the second implementation: ploegd signs a per-Run JWT, AIGatewayRoute rules enforce the model allowlist, and a CEL cost with a Global rate-limit rule enforces the budget. | L | An installer can switch gateway supply chains without a Ploeg release and keep per-Run budgets. |
| Settle Run spend from the Envoy access log (proposed) | Ploeg settlement / Run accounting | ADR-0177 section 2 replaces LiteLLM's spend logs with an access-log receiver that reads io.envoy.ai_gateway metadata per request; the contract suite must prove the errs-high rules of ADR-0012 and ADR-0155 hold. | M | Keeps settlement idempotent and never low on a gateway without a usage store. |
| QuotaPolicy as the Team spend cap (proposed) | hosted Tenant cluster / Team budgets | Ploeg ADR-0162's per-period Team cap could be rendered as Agent Router QuotaPolicy per Team or per Tenant once weekly and monthly windows exist; today only shorter windows are available. | M | Enforces a Tenant's model budget at the gateway, not only in Ploeg's state. |
| MCPRoute for read-only Run tools (proposed) | Ploeg workers / MCP access groups | ADR-0177 renders ADR-0078's team-and-group boundary as MCPRoute authorization rules over the Run JWT's team and mcp_groups claims. | M | Keeps the read-only tool boundary when LiteLLM is not deployed. |
| Residency per request for EU cells (proposed) | hosted Tenant cluster / Ploeg cells | ADR-0177 section 1.5 records provider and region per Usage entry; Agent Router's backend_name and a per-backend region give Ploeg ADR-0107's residency tag a fact to check. | S | Lets the hosted EU offering show that a Tenant's calls stayed in the EU. |

**Shipped adoption:** v1.2.0 needs Envoy Gateway v1.9.2, Envoy Proxy v1.39.1 and Gateway API v1.6.1 CRDs; supports GIE v1.6: https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0; Google Distributed Cloud air-gapped reference implementation: https://docs.cloud.google.com/distributed-cloud/hosted/docs/latest/gdcag/solutions/ai-gateway/envoy/reference-implementation; MCP features: MCPRoute multiplexing with backend__tool prefixing (prefixMode Never in 1.2), toolSelector include/includeRegex, OAuth auth-code+PKCE with protected resource metadata, CEL authorization over JWT claims/tool/params, injectionPolicy for upstream API keys, Last-Event-ID reconnection: https://theagentrouter.ai/docs/capabilities/mcp/

**Open problems:** MCP docs claim alignment with the June 2025 spec while the current MCP revision is 2026-07-28 (stateless): https://theagentrouter.ai/docs/capabilities/mcp/ vs https://modelcontextprotocol.io/specification/versioning; No GIE conformance report: https://github.com/kubernetes-sigs/gateway-api-inference-extension/tree/main/conformance/reports; QuotaPolicy windows: weekly/monthly/yearly and quota-aware routing not yet available; per-tenant Distinct bucket bug fixed only in 1.2.0: https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0; v1.2.0 runtime CEL errors now deny (403) and no upgrade from v1.0.x is supported: same URL

**Watched:** github-releases `theagentrouter/agent-router` at v1.2.0, github-releases `envoyproxy/gateway` at v1.9.3

## agentgateway { #agentgateway }

Not to be confused with: Rust proxy + Kubernetes controller for MCP, A2A, LLM and HTTP/gRPC traffic; Gateway API implementation and GIE-conformant inference gateway; CRDs AgentgatewayBackend/AgentgatewayModel/AgentgatewayPolicy

| | |
| --- | --- |
| Steward | Agentic AI Foundation (hosted project since 2026-06-04 [secondary] https://itbrief.com.au/story/agentic-ai-foundation-adds-agentgateway-as-hosted-project); originally Solo.io, LF project since Aug 2025 https://linuxfoundation.org/press/linux-foundation-welcomes-agentgateway-project-to-accelerate-ai-agent-adoption-while-maintaining-security-observability-and-governance (foundation) |
| Status | stabilising |
| Latest | [v1.7.0 2026-10-27](https://github.com/agentgateway/agentgateway/releases/tag/v1.7.0) |
| Radar | **assess**: Fit decided it: it is mature and foundation-hosted, but ADR-0177 already picked Agent Router as the second gateway and a second Gateway API controller adds an upgrade surface. |
| Moves when | Agent Router fails ADR-0177's contract spike (per-Run budget, revocation or settlement), or an Agency asks for ID-JAG on unfold-mcp (T31 fires on the server side). |
| Competes with | [Agent Router (formerly Envoy AI Gateway)](inference-infra.md#agent-router), [LiteLLM Proxy (AI Gateway)](inference-infra.md#litellm), [Vendor MCP gateways (Kong AI MCP Proxy/OAuth2, Docker MCP Gateway, Microsoft MCP Gateway)](inference-infra.md#vendor-mcp-gateways) |
| Complements | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension), [llm-d (Kubernetes-native distributed LLM inference)](inference-infra.md#llm-d) |
| Builds on | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Superseded by | — |
| Decisions | [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [2026-10-30-model-gateway-contract](../../../../../apps/ploeg/docs/research/2026-10-30-model-gateway-contract.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [2026-10-13-protocol-integration-gaps](../../../../../apps/unfold/docs/research/2026-10-13-protocol-integration-gaps.md) |
| Watchlist | T31, T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Third gateway implementation behind the gateway contract (proposed) | LiteLLM gateway seam / Ploeg pkg/gateway | Ploeg ADR-0177 (proposed) defines a six-operation gateway contract with a contract suite; agentgateway could be run against that suite as a third kind beside litellm and envoy-ai-gateway, using JWT minting and extAuth revocation like the Agent Router column. | L | Gives a self-hoster a Rust, Gateway-API-native gateway choice without a Ploeg code fork. |
| Front unfold-mcp with ID-JAG for an Agency IdP (proposed) | unfold-mcp / hosted Tenant cluster | Watchlist T31 names fronting Unfold's MCP resource server with agentgateway once an Agency on Okta asks; agentgateway would validate the Enterprise-Managed Authorization grant and pass a token Unfold already accepts (system ADR-0011, ADR-0037). | M | Lets an Agency's managed IdP govern which people reach Unfold over MCP without Unfold implementing ID-JAG itself. |
| MCP tool multiplexing for Runs instead of LiteLLM's MCP gateway (proposed) | Ploeg workers / Run sandbox egress | Ploeg ADR-0078 lets Runs reach read-only MCP tools only through the gateway bounded by a gateway team; agentgateway's MCP routing with per-team policy could serve that rule if LiteLLM's MCP gateway is retired. | M | Removes the stdio-MCP and admin-escalation risk class seen in LiteLLM advisories from the Run path. |
| GIE-conformant entry point for a self-hoster's own models (proposed) | self-hosting docs / self-hoster GPU cluster | agentgateway has GIE Gateway-profile conformance reports; a self-hoster who serves open-weight models on their own GPUs could route Ploeg's LiteLLM upstream through agentgateway and an InferencePool. | M | Documents one tested path for Agencies that refuse a hosted model provider. |
| Interceptor point for tool-call screening (proposed) | Run tracing / tripwire | Watchlist T34 waits for a gateway that runs MCP Interceptors; agentgateway's CEL policies could host the inline variant of the decider tripwire that system ADR-0042 (proposed) rejected for cost today. | M | Would let a later tripwire stop a hostile tool call before it runs instead of after. |

**Shipped adoption:** GIE Gateway-profile reports v1.4.0 and v1.6.0: https://github.com/kubernetes-sigs/gateway-api-inference-extension/tree/main/conformance/reports/v1.6.0/gateway/agentgateway; llm-d v1.0.0 lists AgentGateway v1.5.0 as supported: https://github.com/llm-d/llm-d/releases/tag/v1.0.0; Docs: Gateway API conformant (HTTPRoute, GRPCRoute, TCPRoute, TLSRoute); MCP stdio/SSE/Streamable HTTP, OpenAPI→MCP, A2A, OpenAI-compatible LLM API incl. Responses/Messages/Embeddings/Rerank: https://agentgateway.dev/docs/kubernetes/latest/

**Open problems:** MCP spec revision supported is not stated in docs: https://agentgateway.dev/docs/kubernetes/latest/; v1.7.0 notes do not mention A2A changes; feature parity per release unclear: https://github.com/agentgateway/agentgateway/releases/tag/v1.7.0; Would be a second Gateway API controller next to Envoy Gateway (estate inference)

**Watched:** github-releases `agentgateway/agentgateway` at v1.7.0

## Anthropic Messages API compatibility (/v1/messages) { #anthropic-messages-api }

| | |
| --- | --- |
| Steward | Anthropic (format); compat layers by third parties (single-vendor) |
| Status | stable |
| Latest | [no spec version; the API release notes are its changelog 2026-11-02](https://code.claude.com/docs/en/llm-gateway-protocol) |
| Radar | **adopt**: Fit decided it: Ploeg already runs the claude-code harness on this format through LiteLLM. |
| Moves when | LiteLLM or Agent Router stops forwarding a beta capability Claude Code needs, or Claude Code drops gateway support. |
| Competes with | [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions), [Open Responses](inference-infra.md#open-responses), [Google Gemini Interactions API](inference-infra.md#gemini-interactions-api) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [0034-the-harness-gets-placeholders-the-worker-keeps-credentials](../../../../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md), [0138-a-harness-runs-in-its-own-container-and-no-credential-enters-it](../../../../../apps/ploeg/docs/adrs/0138-a-harness-runs-in-its-own-container-and-no-credential-enters-it.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0084-a-claude-code-run-can-execute-in-a-teams-self-hosted-claude-environment](../../../../../apps/ploeg/docs/adrs/0084-a-claude-code-run-can-execute-in-a-teams-self-hosted-claude-environment.md), [0112-a-claude-environment-run-uses-the-claude-login-of-the-person-it-acts-for](../../../../../apps/ploeg/docs/adrs/0112-a-claude-environment-run-uses-the-claude-login-of-the-person-it-acts-for.md) |
| Watchlist | T19 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Claude Code harness through the gateway | Ploeg workers / LiteLLM gateway | The claude-code harness speaks /v1/messages; the worker's key proxy (Ploeg ADR-0034, ADR-0138) swaps the placeholder for the per-Run LiteLLM key. | S | Claude Code Runs stay metered and budgeted like every other Run. |
| Contract-test /v1/messages on both gateway kinds (proposed) | Ploeg pkg/gateway contract suite | ADR-0177's suite should cover /v1/messages and anthropic-beta header forwarding, which Claude Code needs as it evolves. | M | Prevents a gateway switch from silently breaking Claude Code Runs. |
| Do not route Claude Code to non-Claude models | Ploeg Team configuration | Anthropic does not support Claude Code on non-Claude models; a Team using the claude-code harness should list only Claude models (Ploeg ADR-0103 model choice). | S | Avoids hangs like the reported Ollama case. |
| One bill for people's own agents (proposed) | LiteLLM gateway / Unfold | Watchlist T19: if the owner decides, people's own Claude Code sessions could use a Ploeg-budgeted /v1/messages endpoint instead of personal logins. | M | An Agency sees Runs and its people's agent spend on one ledger. |
| Claude environment Runs stay outside the gateway | Ploeg claude-environment executor | Ploeg ADR-0084 and ADR-0112 run some Claude Code Runs on a Team's self-hosted Claude environment under a person's login, where the gateway does not meter. | S | Keeps clear which Runs the gateway can settle. |

**Shipped adoption:** LiteLLM /v1/messages for all providers (https://docs.litellm.ai/docs/anthropic_unified); vLLM /v1/messages and /v1/messages/count_tokens (https://docs.vllm.ai/en/latest/serving/online_serving/); Ollama Anthropic compatibility; no count_tokens, tool_choice or metadata (https://docs.ollama.com/api/anthropic-compatibility); Claude Code gateway docs: any gateway exposing a supported format works; Anthropic does not support routing Claude Code to non-Claude models (https://code.claude.com/docs/en/llm-gateway); Open WebUI v0.12.0 has an Anthropic Messages endpoint fix (https://github.com/open-webui/open-webui/releases)

**Open problems:** Claude Code hangs with a local Ollama model even though curl works (https://github.com/anthropics/claude-code/issues/51239); Gateways must forward anthropic-beta capabilities as Claude Code evolves (https://code.claude.com/docs/en/llm-gateway)

**Watched:** changelog-page `https://platform.claude.com/docs/en/release-notes/overview.md`

## Certified Kubernetes AI Conformance Program (Certified Kubernetes AI Platform) { #cncf-k8s-ai-conformance }

Not to be confused with: CNCF certification checklist per Kubernetes minor (v1.33 to v1.37) layered on k8s conformance; requirements authored in kubernetes-sigs/wg-ai-conformance

| | |
| --- | --- |
| Steward | CNCF + Kubernetes WG AI Conformance (foundation) |
| Status | stable |
| Latest | [v1.37 checklist (hybrid automated + manual verification starts at v1.37)](https://raw.githubusercontent.com/cncf/k8s-ai-conformance/main/docs/AIConformance-1.37.yaml) |
| Radar | **assess**: Fit decided it: the programme is stable, but most requirements concern accelerators Unfold does not use. |
| Moves when | The hosted phase starts and needs a platform acceptance list, or Unfold adds GPU workloads. |
| Competes with | — |
| Complements | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension), [Kubernetes Dynamic Resource Allocation (DRA, structured parameters)](inference-infra.md#k8s-dra), [Kubernetes Agent Sandbox (Sandbox CRD)](inference-infra.md#k8s-agent-sandbox), [Kata Containers](inference-infra.md#kata-containers) |
| Builds on | [Kubernetes Dynamic Resource Allocation (DRA, structured parameters)](inference-infra.md#k8s-dra), [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Superseded by | — |
| Decisions | [adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need](../../../../../docs/adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md), [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [2026-10-24-sandbox-runtimes-and-encryption](../../../../../docs/research/2026-10-24-sandbox-runtimes-and-encryption.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Cite Talos's AI conformance in self-hosting docs | self-hosting docs | Talos is certified for v1.37; self-host-the-whole-stack.md can say the documented base is a Certified Kubernetes AI Platform. | S | A credible answer to an Agency's platform question. |
| Map workload_sandboxing to Unfold's runtime kit | self-hosting docs / sandbox-runtimes kit | The SHOULD requirement workload_sandboxing is what system ADR-0045's Kata and gVisor kit provides; state the mapping. | S | Shows self-hosters which conformance items Unfold relies on. |
| Pre-flight checklist for hosted Tenant clusters (proposed) | hosted Tenant cluster | Use the MUST items that apply without GPUs (robust_controller, pod_autoscaling) as part of a Tenant cluster's acceptance list. | M | A repeatable bar for each Agency's cluster. |
| Ignore accelerator items for now | self-hosting docs | accelerator_metrics and gpu_sharing do not apply while Unfold runs no GPUs. | S | No wasted work. |
| Prefer certified distributions for Agency self-hosters | self-hosting docs | Recommend GKE, RKE2 or Talos where an Agency picks a distribution. | S | Fewer unsupported clusters to debug. |

**Shipped adoption:** Launched v1.0 on 2025-11-11 (EKS, VKS, Google named): https://www.cncf.io/announcements/2025/11/11/cncf-launches-certified-kubernetes-ai-conformance-program-to-standardize-ai-workloads-on-kubernetes/; v1.37 certified: gke, kubermatic, rke2, talos (Talos Linux 1.14.1): https://github.com/cncf/k8s-ai-conformance/tree/main/v1.37; Talos is also certified for v1.33 and v1.34: https://github.com/cncf/k8s-ai-conformance/tree/main/v1.34/talos

**Open problems:** v1.37 has 15 requirements: MUST = ai_inference (Gateway API), gang_scheduling, cluster_autoscaling, pod_autoscaling, accelerator_metrics, ai_service_metrics, secure_accelerator_access, robust_controller; SHOULD = driver_runtime_management, gpu_sharing, virtualized_accelerator, advanced_inference_ingress, high_performance_networking, disaggregated_inference, workload_sandboxing. GIE and sandboxing are only SHOULD: https://raw.githubusercontent.com/cncf/k8s-ai-conformance/main/docs/AIConformance-1.37.yaml; Talos v1.37 entry leaves advanced_inference_ingress and virtualized_accelerator blank: https://github.com/cncf/k8s-ai-conformance/blob/main/v1.37/talos/PRODUCT.yaml

**Watched:** rss `https://github.com/cncf/k8s-ai-conformance/commits/HEAD.atom`, changelog-page `https://github.com/cncf/k8s-ai-conformance/tree/main/docs`

## Container Device Interface (CDI) { #cdi }

Not to be confused with: runtime-level device injection spec (vendor.com/class=name), consumed by containerd/CRI-O/Docker/Podman; orchestration left to k8s (device plugins/DRA)

| | |
| --- | --- |
| Steward | CNCF TAG Runtime (cncf-tags org) (foundation) |
| Status | stable |
| Latest | [v1.1.1 (specs-go/v1.1.1) 2026-09-04](https://github.com/cncf-tags/container-device-interface/releases/tag/v1.1.1) |
| Radar | **hold**: Fit decided it: a stable runtime spec with no device workloads in Unfold. |
| Moves when | Any Unfold workload needs a device beyond CPU and memory. |
| Competes with | — |
| Complements | [Kubernetes Dynamic Resource Allocation (DRA, structured parameters)](inference-infra.md#k8s-dra), [NVIDIA GPU Operator](inference-infra.md#nvidia-gpu-operator) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [0120-a-worker-container-meets-the-restricted-pod-security-standard-by-default](../../../../../apps/ploeg/docs/adrs/0120-a-worker-container-meets-the-restricted-pod-security-standard-by-default.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Verify Talos containerd CDI before any GPU work | self-hoster GPU cluster | Whether Talos's containerd enables CDI with the NVIDIA toolkit extension is unverified; check it first. | S | Avoids a silent GPU injection failure. |
| Prefer CDI over privileged device mounts (proposed) | Run sandbox | Any device a Run needs should come through CDI, keeping Ploeg ADR-0120's restricted pod standard. | S | No privileged containers for devices. |
| Underpins DRA if adopted | self-hoster GPU cluster | DRA drivers inject through CDI; no direct Unfold work. | S | Clear dependency chain. |
| Docker workspaces with GPUs (proposed) | Unfold docker placement | Docker 28.2 enables CDI by default, so a local GPU workspace could request a device by name. | S | Local ML repositories become workable. |
| Nothing needed today | Unfold clusters | No device injection in use. | S | No wasted work. |

**Shipped adoption:** CRI-O default-on; containerd needs enable_cdi; Docker default from 28.2.0: https://github.com/cncf-tags/container-device-interface; GPU Operator GPUCluster requires a CDI-compatible runtime: https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/release-notes.html

**Open problems:** Whether Talos containerd has enable_cdi and spec dirs set with the nvidia-container-toolkit extension is not verified; Talos NVIDIA guide does not mention CDI: https://docs.siderolabs.com/talos/v1.11/configure-your-talos-cluster/hardware-and-drivers/nvidia-gpu-proprietary

**Watched:** github-releases `cncf-tags/container-device-interface` at v1.1.1

## Google Gemini Interactions API { #gemini-interactions-api }

| | |
| --- | --- |
| Steward | Google (single-vendor) |
| Status | stable |
| Latest | [GA 'as of June 2026', endpoint POST https://generativelanguage.googleapis.com/v1beta/interactions; docs changelog 2026-06-22 [secondary]; google-genai python v2.34.0 2026-06-22](https://aistudio.google.com/docs/interactions-overview) |
| Radar | **hold**: Fit decided it: single-vendor, not an open spec, and not used by any harness or provider Unfold runs. |
| Moves when | An Agency requires Gemini models for Runs and LiteLLM's bridge cannot serve a harness's needs. |
| Competes with | [Open Responses](inference-infra.md#open-responses), [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions), [Anthropic Messages API compatibility (/v1/messages)](inference-infra.md#anthropic-messages-api) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in](../../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md), [0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript](../../../../../apps/ploeg/docs/adrs/0090-a-runs-agent-session-is-kept-as-a-bounded-redacted-transcript.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Ignore for Runs | Ploeg workers | No Ploeg harness speaks it and Fireworks does not serve Gemini; keep Runs on Chat Completions and Messages. | S | No new wire format to support. |
| Reach Gemini through LiteLLM if ever needed | LiteLLM gateway | LiteLLM bridges Gemini behind its OpenAI-compatible endpoint, so a Team could list a Gemini model without a new client. | S | Model choice without code. |
| Watch data retention for Agency code | hosted Tenant cluster policy | Stored interactions are retained 55 days on paid tiers; an Agency's code must not land there by default, consistent with system ADR-0050's no-lock-in rule. | S | Avoids a retention surprise for Client code. |
| Reject background interactions for Runs | Ploeg Run model | Background interactions keep state at Google, outside Ploeg's settlement and transcript (Ploeg ADR-0090). | S | Keeps every Run's state where Ploeg can read it. |
| Track in the gateway contract's model list | Ploeg pkg/gateway | If a Gemini model is ever configured, ADR-0177's Models operation must state its price, never zero. | S | Keeps the premise check's never-a-paid-model rule correct. |

**Shipped adoption:** Google: primary API; generateContent legacy but supported (https://blog.google/innovation-and-ai/technology/developers-tools/interactions-api-general-availability); LiteLLM proxy POST /v1beta/interactions; non-Google providers bridged via /responses (https://docs.litellm.ai/docs/interactions)

**Open problems:** No open spec; stored interactions retained 55 days paid / 1 day free; store=false is incompatible with background (https://aistudio.google.com/docs/interactions-overview)

**Watched:** github-releases `googleapis/python-genai` at v2.34.0

## gVisor (runsc) { #gvisor }

Not to be confused with: user-space application kernel OCI runtime; RuntimeClass handler runsc

| | |
| --- | --- |
| Steward | Google (single-vendor) |
| Status | stable |
| Latest | [release-20261102.0 2026-11-02](https://github.com/google/gvisor/releases/tag/release-20261102.0) |
| Radar | **adopt**: Both decided it: accepted in system ADR-0045 and widely used, stable upstream. |
| Moves when | A Team's bench shows more than a few percent of Runs failing under gVisor that pass under Kata. |
| Competes with | [Kata Containers](inference-infra.md#kata-containers) |
| Complements | [Kubernetes Agent Sandbox (Sandbox CRD)](inference-infra.md#k8s-agent-sandbox) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need](../../../../../docs/adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md), [0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour](../../../../../apps/ploeg/docs/adrs/0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour.md), [0168-profile-p1-turns-on-the-worker-admission-policy-and-a-sandbox-team-names-its-runtime-class-there](../../../../../apps/ploeg/docs/adrs/0168-profile-p1-turns-on-the-worker-admission-policy-and-a-sandbox-team-names-its-runtime-class-there.md), [2026-10-24-sandbox-runtimes-and-encryption](../../../../../docs/research/2026-10-24-sandbox-runtimes-and-encryption.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| gVisor on nodes without nested virtualization | self-hosting docs / Run sandbox | System ADR-0045 makes gVisor (RuntimeClass gvisor, handler runsc) the sandbox on Hetzner Cloud VMs and similar nodes. | S | Self-hosters on cloud VMs get a real sandbox instead of runc. |
| Light pods under gVisor on bare metal | Ploeg workers / Unfold verifier | Reading Runs and verifier checks are short-lived; system ADR-0045 chooses gVisor for them to save VM overhead. | S | Lower memory per pod on full worker nodes. |
| Bench real repositories before moving a Team | sandbox-runtimes kit | gVisor's slower file I/O shows up as agent failures; run the kit's bench on Agency repositories first, as system ADR-0045 says. | M | Avoids misreading runtime failures as repository problems. |
| Amend Ploeg ADR-0106 to choose by fit | Ploeg isolation classes | System ADR-0045 asks Ploeg ADR-0106 to treat hardened and isolated as alternatives; land that in Ploeg. | S | A Team can pick gVisor on a node that also offers Kata. |
| Runtime monitoring for gVisor pods (proposed) | Run tracing | gVisor pods stay visible to Falco through gVisor Runtime Monitoring, where Kata pods are invisible; use it for reading Runs. | M | Detection coverage for sandboxed pods. |

**Shipped adoption:** Talos core extension gvisor at 20261026.0, a week behind upstream (GVISOR_VERSION, https://github.com/siderolabs/extensions/blob/main/container-runtime/vars.yaml, read 2026-11-04); agent-sandbox names it as a runtime: https://github.com/kubernetes-sigs/agent-sandbox

**Open problems:** Talos extension lags weekly upstream releases: https://github.com/siderolabs/extensions; GPU/CUDA support under gVisor (nvproxy) not verified this pass

**Watched:** rss `https://github.com/google/gvisor/releases.atom`

## Inference Perf { #inference-perf }

Not to be confused with: kubernetes-sigs model-server-agnostic GenAI benchmark (TTFT, TPOT, ITL, goodput) from wg-serving

| | |
| --- | --- |
| Steward | Kubernetes (repo tagged k8s-sig-scalability; origin wg-serving) (foundation) |
| Status | stabilising |
| Latest | [v0.7.0 2026-09-17](https://github.com/kubernetes-sigs/inference-perf/releases/tag/v0.7.0) |
| Radar | **assess**: Fit decided it: pre-1.0 but works against any OpenAI-compatible endpoint, which matches the LiteLLM path. |
| Moves when | Trial when ADR-0177's spike starts or when Run volume approaches the HA record's first ceiling. |
| Competes with | — |
| Complements | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension), [llm-d (Kubernetes-native distributed LLM inference)](inference-infra.md#llm-d), [LiteLLM Proxy (AI Gateway)](inference-infra.md#litellm) |
| Builds on | [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions) |
| Superseded by | — |
| Decisions | [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks](../../../../../apps/ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [2026-10-20-high-availability-and-scaling](../../../../../docs/research/2026-10-20-high-availability-and-scaling.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Baseline TTFT through LiteLLM to Fireworks (proposed) | LiteLLM gateway | Run Inference Perf against the staging LiteLLM endpoint to record time to first token and per-token latency per model. | S | A number to compare gateway kinds against. |
| Compare LiteLLM and Agent Router overhead (proposed) | Ploeg pkg/gateway | During ADR-0177's spike, drive both gateways with the same load profile. | S | Shows whether the second gateway adds latency. |
| Load test the gateway before Run volume grows (proposed) | LiteLLM gateway | The 2026-10-20 HA record has no load test; Inference Perf can supply the model-path half of one. | M | Replaces estimates with measurements. |
| Measure a self-hosted decider (proposed) | Unfold tripwire | Measure Strands Decider latency on CPU versus GPU before choosing inline screening. | S | Evidence for system ADR-0042's later stop. |
| Goodput in bake-offs | Ploeg bake-offs | Goodput per model can sit beside cost per merged Work Item in a bake-off (Ploeg ADR-0135). | S | Speed and cost in one comparison. |

**Shipped adoption:** Verified for vLLM, SGLang, TGI; any OpenAI-compatible endpoint: https://github.com/kubernetes-sigs/inference-perf

**Open problems:** Pre-1.0: https://github.com/kubernetes-sigs/inference-perf

**Watched:** github-releases `kubernetes-sigs/inference-perf` at v0.7.0

## kagent { #kagent }

Not to be confused with: Kubernetes-native agent framework (CRDs Agent, ModelConfig, RemoteMCPServer, SandboxTemplate/SandboxConfig); not a gateway

| | |
| --- | --- |
| Steward | kagent project, CNCF Sandbox (accepted 2025-05-22 per https://github.com/kagent-dev/community/issues/7; CNCF blog https://www.cncf.io/blog/2025/08/19/celebrating-100-days-of-kagent/) (foundation) |
| Status | stabilising |
| Latest | [v1.0.0-rc1 (stable line v0.10.4, 2026-10-21) 2026-10-30](https://github.com/kagent-dev/kagent/releases/tag/v1.0.0-rc1) |
| Radar | **hold**: Fit decided it: kagent overlaps Ploeg's dispatch plane and is CRD-first, which Ploeg ADR-0071 rules out, and its 1.0 is still a release candidate. |
| Moves when | kagent adds a tracker or forge trigger or an enforced budget (the trigger named in ecosystem-fit.md), or an Agency asks to drive Ploeg from kagent. |
| Competes with | — |
| Complements | [kmcp](inference-infra.md#kmcp), [agentgateway](inference-infra.md#agentgateway), [Kubernetes Agent Sandbox (Sandbox CRD)](inference-infra.md#k8s-agent-sandbox) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0005-build-a-dedicated-dispatch-plane](../../../../../apps/ploeg/docs/adrs/0005-build-a-dedicated-dispatch-plane.md), [0032-keep-the-dispatch-plane-and-compete-on-authorized-spend](../../../../../apps/ploeg/docs/adrs/0032-keep-the-dispatch-plane-and-compete-on-authorized-spend.md), [0033-board-control-planes-are-mined-for-design-never-depended-on](../../../../../apps/ploeg/docs/adrs/0033-board-control-planes-are-mined-for-design-never-depended-on.md), [0071-ploeg-keeps-its-state-in-postgresql-and-is-not-a-kubernetes-operator](../../../../../apps/ploeg/docs/adrs/0071-ploeg-keeps-its-state-in-postgresql-and-is-not-a-kubernetes-operator.md), [0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills](../../../../../apps/ploeg/docs/adrs/0110-a-team-is-ploegs-own-manifest-of-charter-crew-permissions-intake-and-skills.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Mine kagent's CRD shapes for Team manifests | Ploeg Team manifest | Ploeg ADR-0110 makes a Team Ploeg's own manifest; kagent's Agent, ModelConfig and RemoteMCPServer CRDs are a reference for field names, without depending on them (Ploeg ADR-0033's mine-never-depend stance). | S | Cheaper Team-manifest design by copying names people already know. |
| Compare launch paths for the CNCF fit page | Ploeg CNCF docs | apps/ploeg/docs/cncf/ecosystem-fit.md already lists kagent as an adjacent control plane; keep its row current at v1.0.0 to explain why Ploeg keeps budgets, leases and trackers that kagent does not have. | S | Answers the first question a self-hoster on kagent asks. |
| kagent as an operator consumer of Ploeg (proposed) | Ploeg operator API | A kagent Agent could call ploeg-mcp (Ploeg ADR-0081) to admit Work Items, which keeps Ploeg the execution authority per Ploeg ADR-0024. | M | Lets a cluster already on kagent hand coding work to Ploeg instead of running it unbudgeted. |
| Watch kagent SandboxTemplate alignment with agent-sandbox | Run sandbox | If kagent's SandboxTemplate turns out to be the kubernetes-sigs CRD, the same warm pools Unfold ADR 0013 uses could serve both; record the answer in the sandbox landscape note. | S | Avoids two warm-pool systems on one cluster. |
| Reject kagent as Ploeg's engine | Ploeg dispatch plane | Ploeg ADR-0005 and ADR-0032 keep a dedicated dispatch plane and ADR-0071 rules out a Kubernetes operator; kagent would move state from PostgreSQL into CRDs. | S | Keeps the authorize-then-settle accounting that kagent lacks. |

**Shipped adoption:** v1.0.0-rc1 notes: pre-RC API breaks, cross-namespace ModelConfig/RemoteMCPServer via allowedNamespaces: https://github.com/kagent-dev/kagent/releases/tag/v1.0.0-rc1

**Open problems:** API version and whether SandboxTemplate is the k8s-sigs CRD are not stated in the RC notes: https://github.com/kagent-dev/kagent/releases/tag/v1.0.0-rc1

**Watched:** github-releases `kagent-dev/kagent` at v1.0.0-rc1

## Kata Containers { #kata-containers }

Not to be confused with: lightweight-VM OCI runtime (RuntimeClass handler, e.g. kata); not a sandbox API

| | |
| --- | --- |
| Steward | Kata Containers project (OpenInfra; governance body not re-verified this pass) (foundation) |
| Status | stable |
| Latest | [4.3.1 2026-10-21](https://github.com/kata-containers/kata-containers/releases/tag/4.3.1) |
| Radar | **adopt**: Both decided it: accepted in system ADR-0045, running in staging and production, stable upstream. |
| Moves when | A new Kata escape advisory without a Talos extension fix within a week, or production loses its bare-metal worker. |
| Competes with | [gVisor (runsc)](inference-infra.md#gvisor) |
| Complements | [Kubernetes Agent Sandbox (Sandbox CRD)](inference-infra.md#k8s-agent-sandbox), [OpenSandbox](inference-infra.md#aaif-opensandbox) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need](../../../../../docs/adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md), [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [adr-0009-one-tenant-per-agency](../../../../../docs/adr/adr-0009-one-tenant-per-agency.md), [0013-sandbox-crd-placement-with-warm-kata-pools](../../../../../apps/unfold/docs/adrs/0013-sandbox-crd-placement-with-warm-kata-pools.md), [0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour](../../../../../apps/ploeg/docs/adrs/0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour.md), [0168-profile-p1-turns-on-the-worker-admission-policy-and-a-sandbox-team-names-its-runtime-class-there](../../../../../apps/ploeg/docs/adrs/0168-profile-p1-turns-on-the-worker-admission-policy-and-a-sandbox-team-names-its-runtime-class-there.md), [2026-10-24-sandbox-runtimes-and-encryption](../../../../../docs/research/2026-10-24-sandbox-runtimes-and-encryption.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Kata for writing Runs and workspaces | Run sandbox / Ploeg workers | System ADR-0045 (accepted) runs Kata with Cloud Hypervisor (RuntimeClass kata) on nodes with hardware virtualization; production's bare-metal worker per system ADR-0040. | S | A hardware boundary around the least trusted code. |
| Keep the annotation admission policy in place | sandbox-runtimes kit | System ADR-0045 refuses io.katacontainers. annotations because Kata before 4.3.0 let a pod reach node root (GHSA-37rf-pj8c-g5g3); keep it even on 4.3.x as defence in depth. | S | Closes a known escape class. |
| Profile P1 names the sandbox RuntimeClass | Ploeg chart | Ploeg ADR-0168 turns on worker admission under profile P1 and has a sandbox Team name its RuntimeClass. | S | A posture that cannot fall back to runc silently. |
| VM snapshots as Run evidence (proposed) | Run evidence | The 2026-09-10 shortlist proposed hypervisor snapshots at candidate time; Kata 4 with Cloud Hypervisor's snapshot support is the route. | L | Forensic state for a hostile Run. |
| Per-Agency Kata nodes (proposed) | hosted Tenant cluster | System ADR-0009 gives each Agency a sandboxed runtime; bare-metal Kata workers per Tenant or shared with strict namespaces. | L | Isolation between Agencies at the hardware boundary. |

**Shipped adoption:** Talos ships a kata-containers system extension at 4.3.1, level with upstream (KATA_CONTAINERS_VERSION, https://github.com/siderolabs/extensions/blob/main/container-runtime/vars.yaml, read 2026-11-04); Named runtime for agent-sandbox: https://github.com/kubernetes-sigs/agent-sandbox; OpenSandbox SandboxSnapshot supports a qemu-v1 VM-state format: https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture/control-plane/operator.md

**Open problems:** The Talos extension tracks upstream (4.3.1 on 2026-11-04); verify per Talos release: https://github.com/siderolabs/extensions; GPU passthrough into Kata VMs on a GPU node

**Watched:** github-releases `kata-containers/kata-containers` at 4.3.1, github-releases `siderolabs/extensions` at v1.14.5

## kmcp { #kmcp }

Not to be confused with: CLI + Kubernetes controller to build/deploy MCP servers as CRs (api/v1alpha1 dir; kind not stated on README)

| | |
| --- | --- |
| Steward | kagent maintainers (kagent-dev); CNCF status not found (community) |
| Status | draft |
| Latest | [v0.4.0 2026-09-17](https://github.com/kagent-dev/kmcp/releases/tag/v0.4.0) |
| Radar | **hold**: Maturity decided it: draft-status v0.4.0 with a slowing cadence and no stated support for the current MCP revision. |
| Moves when | kmcp states support for MCP 2026-07-28 and reaches 1.0, or Ploeg Teams add more than three in-cluster MCP servers. |
| Competes with | [Vendor MCP gateways (Kong AI MCP Proxy/OAuth2, Docker MCP Gateway, Microsoft MCP Gateway)](inference-infra.md#vendor-mcp-gateways) |
| Complements | [kagent](inference-infra.md#kagent), [agentgateway](inference-infra.md#agentgateway) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp](../../../../../apps/ploeg/docs/adrs/0081-ploeg-serves-its-operator-reads-as-mcp-tools-through-ploeg-mcp.md), [adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp](../../../../../docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md), [2026-10-14-litellm-and-fireworks-update](../../../../../docs/research/2026-10-14-litellm-and-fireworks-update.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Deploy read-only MCP servers for Runs as CRs (proposed) | LiteLLM gateway MCP backends | The read-only servers that Ploeg ADR-0078 lets Runs reach behind the gateway could be deployed by kmcp instead of hand-written Deployments. | M | Less YAML per MCP server a Team adds. |
| Package unfold-mcp for in-cluster use (proposed) | self-hosting docs | System ADR-0032 has Unfold serve its own read-only MCP tools; a kmcp CR example could be one install path for self-hosters already on kagent. | S | One more familiar install path. |
| Move stdio MCP servers to HTTP | LiteLLM gateway | LiteLLM 1.104 turned stdio MCP off by default (2026-10-14 record); kmcp's HTTP transport wrapping is one way to move existing stdio servers. | S | Closes the stdio command path behind the critical LiteLLM advisory. |
| Track MCP 2026-07-28 support | MCP standards watch | kmcp states no support for the stateless 2026-07-28 revision that ploeg-mcp implements; check each release. | S | Avoids deploying servers clients cannot speak to. |
| Compare with Ploeg's own ploeg-mcp packaging | Ploeg chart | Ploeg ADR-0081 serves operator reads as MCP tools from its own chart; kmcp offers nothing it lacks today. | S | Confirms no dependency is needed. |

**Shipped adoption:** Repo and docs: https://github.com/kagent-dev/kmcp (kagent.dev/docs/kmcp)

**Open problems:** Release cadence slowed (v0.3.0 2026-05-05 → v0.4.0 2026-09-17); transports listed HTTP/WebSocket/SSE, no stated MCP 2026-07-28 support: https://github.com/kagent-dev/kmcp

**Watched:** github-releases `kagent-dev/kmcp` at v0.4.0

## Kubernetes Agent Sandbox (Sandbox CRD) { #k8s-agent-sandbox }

Not to be confused with: kubernetes-sigs/agent-sandbox; CRDs Sandbox (agents.x-k8s.io/v1beta1) and SandboxTemplate/SandboxClaim/SandboxWarmPool (extensions.agents.x-k8s.io); isolation delegated to RuntimeClass (gVisor/Kata)

| | |
| --- | --- |
| Steward | Kubernetes SIG Apps (foundation) |
| Status | stabilising |
| Latest | [v1.0.9 2026-10-29](https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.9) |
| Radar | **trial**: Maturity decided it: the API is v1beta1 under a SIG and both products have an accepted or experimental path, but neither is qualified on a live cluster. |
| Moves when | Adopt when Unfold ADR 0013's warm path and Ploeg's executor both pass qualification on one cluster, or the project serves v1. |
| Competes with | [OpenSandbox](inference-infra.md#aaif-opensandbox) |
| Complements | [Kata Containers](inference-infra.md#kata-containers), [gVisor (runsc)](inference-infra.md#gvisor), [Certified Kubernetes AI Conformance Program (Certified Kubernetes AI Platform)](inference-infra.md#cncf-k8s-ai-conformance) |
| Builds on | [Kata Containers](inference-infra.md#kata-containers), [gVisor (runsc)](inference-infra.md#gvisor) |
| Superseded by | — |
| Decisions | [0013-sandbox-crd-placement-with-warm-kata-pools](../../../../../apps/unfold/docs/adrs/0013-sandbox-crd-placement-with-warm-kata-pools.md), [0011-sandboxes-dial-out-through-a-relay](../../../../../apps/unfold/docs/adrs/0011-sandboxes-dial-out-through-a-relay.md), [2026-09-10-kubernetes-and-sandbox-crds](../../../../../apps/unfold/docs/research/2026-09-10-kubernetes-and-sandbox-crds.md), [2026-09-10-sandbox-landscape](../../../../../apps/unfold/docs/research/2026-09-10-sandbox-landscape.md), [0099-each-allowed-harness-runs-in-its-own-workload-and-the-claim-selects-on-it](../../../../../apps/ploeg/docs/adrs/0099-each-allowed-harness-runs-in-its-own-workload-and-the-claim-selects-on-it.md), [0101-a-paused-run-keeps-its-pod-and-session-for-a-bounded-time-and-is-never-retried-automatically](../../../../../apps/ploeg/docs/adrs/0101-a-paused-run-keeps-its-pod-and-session-for-a-bounded-time-and-is-never-retried-automatically.md), [0137-the-chart-renders-a-default-deny-networkpolicy-for-every-pod-with-an-allowlist-derived-from-its-urls](../../../../../apps/ploeg/docs/adrs/0137-the-chart-renders-a-default-deny-networkpolicy-for-every-pod-with-an-allowlist-derived-from-its-urls.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Qualify warm Kata pools for Unfold sessions | Unfold sandbox provisioner | Unfold ADR 0013 accepted a sandbox provisioner on SandboxClaim and SandboxWarmPool, unqualified on the cluster; qualify it on v1.0.9 with the relay token by TokenReview. | M | Sessions start in clone time rather than VM-boot time. |
| Ploeg's agent-sandbox executor on a second cluster | Ploeg workers | ecosystem-fit.md lists the executor as experimental under Kata; qualify it on gVisor too per system ADR-0045 and Ploeg ADR-0099. | M | A second launcher beside KEDA with the same executor contract. |
| NetworkPolicy for sandboxd | Run sandbox | sandboxd binds 0.0.0.0 by default; Ploeg ADR-0137's default-deny policy must cover any template that enables it. | S | Closes an unauthenticated in-pod API. |
| CRD upgrade order in the chart docs | self-hosting docs | Helm users must apply CRDs before helm upgrade and cannot jump from below v0.5.0; write that into the sandbox runtime how-to. | S | Avoids a broken upgrade for self-hosters. |
| Suspended sandboxes for paused Runs (proposed) | Ploeg paused Runs | Ploeg ADR-0101 keeps a paused Run's pod for a bounded time; operatingMode Suspended could free resources while keeping the volume. | M | Pauses cost less on a full worker node. |

**Shipped adoption:** v1.0.0 (2026-08-28) serves only v1beta1, removes v1alpha1, adds sandboxd (REST fs :8080, gRPC ProcessService :9090), Go router, NeMo Gym/Gymnasium integrations, MCP get_sandbox_status tool: https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.0; Python SDK k8s-agent-sandbox==1.0.0: https://github.com/kubernetes-sigs/agent-sandbox; Kubernetes blog launch 2026-03-20: https://kubernetes.io/blog/2026/03/20/running-agents-on-kubernetes-with-agent-sandbox; kagent v1.0.0-rc1 has SandboxTemplates/SandboxConfig (relationship to this CRD not verified): https://github.com/kagent-dev/kagent/releases/tag/v1.0.0-rc1

**Open problems:** Release 1.0 still serves v1beta1, not v1; no GA claim: https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.0; No upgrade from <v0.5.0 without storage migration; Helm users must apply CRDs before helm upgrade: https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.0; sandboxd binds 0.0.0.0 by default, so a NetworkPolicy is needed: https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.0

**Watched:** github-releases `kubernetes-sigs/agent-sandbox` at v1.0.9

## Kubernetes Dynamic Resource Allocation (DRA, structured parameters) { #k8s-dra }

Not to be confused with: resource.k8s.io/v1 ResourceClaim/ResourceClaimTemplate/DeviceClass/ResourceSlice; core k8s, not a vendor driver

| | |
| --- | --- |
| Steward | Kubernetes SIG Node / WG Device Management (foundation) |
| Status | stable |
| Latest | [GA in Kubernetes v1.34 (resource.k8s.io/v1) 2025-09-01](https://kubernetes.io/blog/2025/09/01/kubernetes-v1-34-dra-updates/) |
| Radar | **hold**: Fit decided it: DRA is GA and stable, but Unfold runs no GPU workloads. |
| Moves when | Unfold, the owner or an Agency adds a GPU node for Runs or a decider. |
| Competes with | — |
| Complements | [NVIDIA GPU Operator](inference-infra.md#nvidia-gpu-operator), [Container Device Interface (CDI)](inference-infra.md#cdi), [Certified Kubernetes AI Conformance Program (Certified Kubernetes AI Platform)](inference-infra.md#cncf-k8s-ai-conformance) |
| Builds on | [Container Device Interface (CDI)](inference-infra.md#cdi) |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need](../../../../../docs/adr/adr-0045-agent-code-runs-under-kata-or-gvisor-chosen-by-what-the-node-and-the-work-need.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| GPU claims for a future decider or model pod (proposed) | self-hoster GPU cluster | If system ADR-0042's decider moves to a GPU, a ResourceClaimTemplate would request it instead of a device-plugin resource. | M | Standard GPU requests across distributions. |
| GPU access for gpu-class Runs (proposed) | Ploeg workers | A Team whose Runs need a GPU (ML repositories) could get one through DRA claims on its worker template. | M | Lets Agencies with ML work use Ploeg. |
| Document Talos DRA setup | self-hosting docs | Talos's guide disables operator driver and toolkit and uses the NVIDIA DRA driver; link it if GPU support is added. | S | Fewer setup failures. |
| Sandbox plus GPU is unsolved | Run sandbox | GPU passthrough into Kata or gVisor nvproxy is unverified; any GPU Run design must start there. | M | Avoids a GPU path that bypasses the sandbox. |
| Nothing needed today | Unfold clusters | Neither staging nor production has a GPU. | S | No wasted work. |

**Shipped adoption:** NVIDIA DRA driver v0.5.1 (2026-10-12), now kubernetes-sigs/dra-driver-nvidia-gpu; GPU allocation 'not yet officially supported', ComputeDomains supported: https://github.com/kubernetes-sigs/dra-driver-nvidia-gpu; Talos DRA guide: GPU Operator with driver/toolkit/device-plugin disabled + nvidia-dra-driver-gpu with nvidiaDriverRoot=/usr/local: https://docs.siderolabs.com/kubernetes-guides/advanced-guides/dynamic-resource-allocation; KServe v0.21 validates DRA annotations on LLMInferenceService: https://github.com/kserve/kserve/releases/tag/v0.21.0

**Open problems:** NVIDIA GPU kubelet plugin disabled by default; sharing features (ConsumableShares etc.) alpha in v0.5.0: https://github.com/kubernetes-sigs/dra-driver-nvidia-gpu/releases/tag/v0.5.0; Talos DRA page still calls DRA beta, contradicting GA: https://docs.siderolabs.com/kubernetes-guides/advanced-guides/dynamic-resource-allocation

**Watched:** changelog-page `https://kubernetes.io/blog/`, github-releases `kubernetes-sigs/dra-driver-nvidia-gpu` at v25.12.0

## Kubernetes Gateway API Inference Extension (GAIE/GIE) { #gateway-api-inference-extension }

Not to be confused with: InferencePool CRD plus an ext-proc Endpoint Picker protocol for model-aware routing behind Gateway API; since v1.6 a spec/CRD/conformance-only project (EPP and InferenceObjective moved to llm-d)

| | |
| --- | --- |
| Steward | Kubernetes SIG Network (kubernetes-sigs/gateway-api-inference-extension) (foundation) |
| Status | stabilising |
| Latest | [v1.6.2 2026-09-17](https://github.com/kubernetes-sigs/gateway-api-inference-extension/releases/tag/v1.6.2) |
| Radar | **hold**: Fit decided it: Unfold calls a hosted provider through LiteLLM and runs no self-hosted model servers that need endpoint picking. |
| Moves when | Unfold or a self-hoster serves an open-weight model on in-cluster GPUs for Runs. |
| Competes with | [vLLM production-stack](inference-infra.md#vllm-production-stack) |
| Complements | [llm-d (Kubernetes-native distributed LLM inference)](inference-infra.md#llm-d), [Agent Router (formerly Envoy AI Gateway)](inference-infra.md#agent-router), [agentgateway](inference-infra.md#agentgateway), [Kubernetes WG AI Gateway](inference-infra.md#k8s-wg-ai-gateway), [Certified Kubernetes AI Conformance Program (Certified Kubernetes AI Platform)](inference-infra.md#cncf-k8s-ai-conformance) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Model-aware routing for a self-hoster's own GPUs (proposed) | self-hosting docs / self-hoster GPU cluster | A self-hoster serving open-weight models with vLLM could put an InferencePool behind a GIE-conformant gateway and register it as one LiteLLM deployment. | M | Prefix-cache-aware routing lowers cost for input-heavy agent Runs. |
| Hosted EU GPU pool for client code (proposed) | hosted Tenant cluster | If the hosted phase serves models in-cluster for EU residency, GIE is the standard routing layer under LiteLLM; system ADR-0040 has no GPU today. | L | Keeps Client code on EU hardware the operator controls. |
| Decider pool routing (proposed) | Unfold tripwire | If system ADR-0042's decider grows beyond one pod, an InferencePool could balance replicas. | M | Screens keep up as Runs grow. |
| Check Agent Router's GIE support in the ADR-0177 spike | Ploeg pkg/gateway | Agent Router supports GIE v1.6 without a conformance report; record whether it matters before relying on it. | S | Avoids building on an unverified claim. |
| Point to GIE in the CNCF AI conformance self-check | self-hosting docs | GIE is the SHOULD-level advanced_inference_ingress requirement; note it as optional for Unfold self-hosters. | S | Clear expectations for self-hosters. |

**Shipped adoption:** Gateway-profile conformance reports, v1.6.0: agentgateway, NGINX Gateway Fabric; v1.5.0: Alibaba ACK Gateway, Istio, NGF; v1.4.0: agentgateway, Higress, NGF; v1.0.2: ACK, kgateway, NGF: https://github.com/kubernetes-sigs/gateway-api-inference-extension/tree/main/conformance/reports; Implementations page lists ACK, Istio (>=1.28.0), Agentgateway, Higress, NGINX Gateway Fabric. Envoy Gateway and Agent Router are absent: https://gateway-api-inference-extension.sigs.k8s.io/implementations/gateways/; Agent Router v1.2.0 supports GIE v1.6 InferencePool, but there is no conformance report: https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0; llm-d v1.0.0 pins GIE CRDs v1.6.2: https://github.com/llm-d/llm-d/releases/tag/v1.0.0

**Open problems:** v1.6.0 removed InferenceObjective, InferenceModelRewrite and EndpointPickerConfig (to llm-d), so priority/objective semantics are no longer in the k8s-sigs spec: https://github.com/kubernetes-sigs/gateway-api-inference-extension/releases/tag/v1.6.0; endpointPickerRef became optional; Agent Router marks pools without it Accepted=False (EndpointPickerRefMissing): https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0; Reports older than the current or two previous minors may be delisted (deprecation policy): https://gateway-api-inference-extension.sigs.k8s.io/implementations/gateways/; lwepp is for conformance only, so production still needs a third-party EPP: https://gateway-api-inference-extension.sigs.k8s.io/

**Watched:** github-releases `kubernetes-sigs/gateway-api-inference-extension` at v1.6.2

## Kubernetes WG AI Gateway { #k8s-wg-ai-gateway }

Not to be confused with: Kubernetes working group staging Gateway API proposals for AI traffic (payload processing, egress gateways, multi-stage routing); owns no code

| | |
| --- | --- |
| Steward | Kubernetes community WG (charter in kubernetes/community) (foundation) |
| Status | draft |
| Latest | [proposals 7, 10, 62 (no releases) 2026-09-07](https://github.com/kubernetes-sigs/wg-ai-gateway/tree/main/proposals) |
| Radar | **hold**: Maturity decided it: proposals only, no code for production. |
| Moves when | A WG proposal graduates into a Gateway API GEP with an implementation in Agent Router or agentgateway. |
| Competes with | — |
| Complements | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension), [Agent Router (formerly Envoy AI Gateway)](inference-infra.md#agent-router), [agentgateway](inference-infra.md#agentgateway) |
| Builds on | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Superseded by | — |
| Decisions | [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy](../../../../../apps/ploeg/docs/adrs/0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Watch the egress gateway proposal for Run egress | Run sandbox egress | Ploeg ADR-0037 routes registry egress through a logged allowlist proxy; a standard Gateway API egress gateway could later replace it. | S | Option to drop a custom proxy. |
| Watch payload processing for the gateway contract | Ploeg pkg/gateway | Payload processing proposals could standardise what ADR-0177 asks of a gateway, such as cost metadata. | S | Earlier warning of a standard shape. |
| Comment with the per-Run budget case (proposed) | standards participation | The owner could file Ploeg's per-Run credential and settlement need as a use case in the WG. | S | A standard that fits Ploeg's model. |
| No implementation work | Ploeg / Unfold | Prototypes are marked not for production; nothing to build. | S | No wasted effort. |
| Re-check at each Gateway API release | inference-infra watch | Check whether a proposal graduates into a GEP. | S | Timely adoption. |

**Shipped adoption:** none: prototypes marked 'NOT suitable for anything resembling production': https://github.com/kubernetes-sigs/wg-ai-gateway

**Open problems:** No proposal has graduated into a Gateway API GEP or subproject yet (inferred from repo state): https://github.com/kubernetes-sigs/wg-ai-gateway

**Watched:** rss `https://github.com/kubernetes-sigs/wg-ai-gateway/commits/HEAD.atom`, changelog-page `https://github.com/kubernetes-sigs/wg-ai-gateway/commits/main`

## LeaderWorkerSet (LWS) { #leaderworkerset }

Not to be confused with: kubernetes-sigs multi-pod group workload API (leader + workers), DisaggregatedSet for P/D roles

| | |
| --- | --- |
| Steward | Kubernetes SIG Apps (kubernetes-sigs/lws; SIG not re-verified) (foundation) |
| Status | stable |
| Latest | [v1.0.0 2026-10-16](https://github.com/kubernetes-sigs/lws/releases/tag/v1.0.0) |
| Radar | **hold**: Fit decided it: stable at 1.0 but only useful for multi-node model serving, which Unfold does not do. |
| Moves when | A self-hoster or Unfold serves a model across more than one node. |
| Competes with | — |
| Complements | [llm-d (Kubernetes-native distributed LLM inference)](inference-infra.md#llm-d) |
| Builds on | — |
| Superseded by | — |
| Decisions | — |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Only as an llm-d dependency | self-hoster GPU cluster | LWS matters only if a self-hoster installs llm-d for multi-node models. | S | Clear scope. |
| Not for Ploeg Runs | Ploeg workers | A Run is one pod with sidecars (Ploeg ADR-0138), not a leader and workers. | S | Avoids misusing a group API. |
| Gang scheduling note | self-hosting docs | Native gang scheduling is still alpha; note it if multi-node serving is documented. | S | Sets expectations. |
| Multi-role Teams are sequential | Ploeg Teams | Roles run in sequence, so no group workload is needed. | S | No extra machinery. |
| Nothing needed today | Unfold clusters | No multi-node inference. | S | No wasted work. |

**Shipped adoption:** llm-d v1.0.0 depends on LWS v1.0.0: https://github.com/llm-d/llm-d/releases/tag/v1.0.0

**Open problems:** Native gang scheduling still alpha; DisaggregatedSet rollout defaults changed: https://github.com/kubernetes-sigs/lws/releases/tag/v1.0.0

**Watched:** github-releases `kubernetes-sigs/lws` at v1.0.0

## LiteLLM Proxy (AI Gateway) { #litellm }

Not to be confused with: BerriAI OpenAI-compatible LLM proxy with virtual keys, budgets, spend ledger, MCP gateway, A2A agent registry; a de facto gateway, not a spec

| | |
| --- | --- |
| Steward | BerriAI (single-vendor) |
| Status | stable |
| Latest | [v1.108.0 2026-11-04](https://github.com/BerriAI/litellm/releases/tag/v1.108.0) |
| Radar | **adopt**: Fit decided it: it is the credential and metering seam today, though the single-vendor supply chain is why ADR-0177 adds a second gateway. |
| Moves when | Hold if another critical advisory lands without a fix on a stable line within a week, or ADR-0177's second implementation passes and the owner chooses to switch. |
| Competes with | [Agent Router (formerly Envoy AI Gateway)](inference-infra.md#agent-router), [agentgateway](inference-infra.md#agentgateway), [Vendor MCP gateways (Kong AI MCP Proxy/OAuth2, Docker MCP Gateway, Microsoft MCP Gateway)](inference-infra.md#vendor-mcp-gateways) |
| Complements | [Open Responses](inference-infra.md#open-responses), [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions), [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Builds on | [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions) |
| Superseded by | — |
| Decisions | [0008-litellm-is-the-credential-and-metering-seam](../../../../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [0111-a-spent-litellm-budget-wider-than-the-runs-key-parks-the-work-item](../../../../../apps/ploeg/docs/adrs/0111-a-spent-litellm-budget-wider-than-the-runs-key-parks-the-work-item.md), [0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering](../../../../../apps/ploeg/docs/adrs/0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering.md), [adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach](../../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md), [2026-10-14-litellm-and-fireworks-update](../../../../../docs/research/2026-10-14-litellm-and-fireworks-update.md), [2026-10-20-high-availability-and-scaling](../../../../../docs/research/2026-10-20-high-availability-and-scaling.md) |
| Watchlist | T19, T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Per-Run keys, budgets and settlement | LiteLLM gateway / Ploeg settlement | Ploeg ADR-0008 mints one key per Run with max_budget, model list and disable_fallbacks, and settles from spend logs (ADR-0012, ADR-0155). | S | Spend metered where the agent cannot bypass it. |
| Look keys up by alias and delete after settlement | Ploeg LiteLLM client | The 2026-10-20 HA record names ListKeys paging through every key as the first ceiling; fix it before Run volume grows. | M | Removes the first scaling limit at about 10^3 Runs a day. |
| Per-Run cache affinity on Fireworks (proposed) | LiteLLM gateway | Forward the key's user as the Fireworks user field (fireworks_forward_user_id) so each Run hits the same replica, as the 2026-10-14 record proposes. | S | Cached input costs a fiftieth of uncached on the builder model. |
| Shared budgets on model access groups for Tenants (proposed) | hosted Tenant cluster | v1.108.0's shared budgets and budget rollover could back a Tenant's model budget (system ADR-0017) at the gateway as well as in Ploeg. | M | A second line of defence on a Tenant's spend. |
| Track the release floor in the chart support matrix | self-hosting docs / Ploeg chart | ADR-0177 sets a health floor at 1.103.0; with several tags a day, pin a tested line by digest and review advisories weekly. | S | Avoids the 1.102.x privilege escalation class. |

**Shipped adoption:** v1.108.0: MCP RS256 session tokens, RFC 7662 introspection, team/org MCP toolset enforcement; A2A agent search; /v1/responses/input_tokens; shared budgets on model access groups, budget rollover, LiteLLM_BudgetWindowSpend table: https://github.com/BerriAI/litellm/releases/tag/v1.108.0

**Open problems:** Not listed in Open Responses community; no published compliance result found: https://www.openresponses.org/; No GIE/InferencePool support found in visible v1.108.0 notes (page truncated at 100k chars): https://github.com/BerriAI/litellm/releases/tag/v1.108.0; Very high release cadence (three tags on 2026-11-04: v1.108.0, v1.106.7, v1.109.0-rc.1): https://github.com/BerriAI/litellm/releases

**Watched:** github-releases `BerriAI/litellm` at v1.108.0

## llm-d (Kubernetes-native distributed LLM inference) { #llm-d }

Not to be confused with: reference stack (EPP/router, P/D disaggregation sidecar, prefix-cache-aware routing) on vLLM + GIE + LWS; now also owns InferenceObjective (llm-d.ai/v1)

| | |
| --- | --- |
| Steward | llm-d project, CNCF Sandbox (accepted 2026-03-24 per CNCF blog https://www.cncf.io/blog/2026/03/24/welcome-llm-d-to-the-cncf-evolving-kubernetes-into-sota-ai-infrastructure/) (foundation) |
| Status | stabilising |
| Latest | [v1.0.0 2026-10-20](https://github.com/llm-d/llm-d/releases/tag/v1.0.0) |
| Radar | **hold**: Fit decided it: there is no GPU in Unfold's clusters and Fireworks serverless is far cheaper at today's volume. |
| Moves when | Unfold or an Agency commits to in-cluster GPU inference for Runs. |
| Competes with | [vLLM production-stack](inference-infra.md#vllm-production-stack) |
| Complements | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension), [LeaderWorkerSet (LWS)](inference-infra.md#leaderworkerset), [Kubernetes Dynamic Resource Allocation (DRA, structured parameters)](inference-infra.md#k8s-dra) |
| Builds on | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension), [LeaderWorkerSet (LWS)](inference-infra.md#leaderworkerset) |
| Superseded by | — |
| Decisions | [adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging](../../../../../docs/adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [2026-10-14-litellm-and-fireworks-update](../../../../../docs/research/2026-10-14-litellm-and-fireworks-update.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Reference stack for a self-hoster's GPU inference (proposed) | self-hosting docs | Name llm-d v1.0 as the recommended path for a self-hoster who wants open-weight builders on their own GPUs, behind LiteLLM. | S | One recommendation instead of a survey. |
| EU in-cluster serving for the hosted offering (proposed) | hosted Tenant cluster | If Fireworks cannot meet residency for Client code, llm-d with P/D disaggregation could serve DeepSeek or GLM Flash in-cluster; system ADR-0040's cluster has no GPU today. | L | Removes a third-party provider from the Client-code path. |
| Compare cost against Fireworks serverless | Run economics | The 2026-10-14 record puts an H100 at US$ 8 per hour on Fireworks on-demand; that is the bar a self-hosted llm-d deployment must beat at Ploeg's volume. | S | Stops a GPU purchase that the volume cannot pay for. |
| Prefix-cache routing for input-heavy Runs (proposed) | self-hoster GPU cluster | Agent Runs are input-heavy (174:1 per the 2026-10-14 record), which is the case prefix-cache-aware routing helps. | M | Higher cache hits per Run. |
| Keep out of Ploeg | Ploeg | Ploeg never runs a model (Ploeg ADR-0082); llm-d stays an upstream behind the gateway. | S | Clear ownership. |

**Shipped adoption:** KServe v0.21.0 LLMInferenceService bumps images to llm-d 0.10 with default EPP scheduler presets: https://github.com/kserve/kserve/releases/tag/v0.21.0; Supported gateways per v1.0.0: Istio 1.29.4, AgentGateway v1.5.0, Envoy Gateway v1.8.1 + Envoy AI Gateway v0.7.0, NGINX Gateway Fabric: https://github.com/llm-d/llm-d/releases/tag/v1.0.0

**Open problems:** Guides break without LWS >= v0.11.1 with the DisaggregatedSet API: https://github.com/llm-d/llm-d/releases/tag/v1.0.0; Documented Envoy AI Gateway version (v0.7.0) lags Agent Router v1.2.0, which requires Envoy Gateway v1.9.2: https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0

**Watched:** github-releases `llm-d/llm-d` at v1.0.0

## NVIDIA GPU Operator { #nvidia-gpu-operator }

Not to be confused with: NVIDIA operator managing driver, container toolkit, device plugin, DCGM, and since 26.7.0 a GPUCluster CR that deploys the DRA driver

| | |
| --- | --- |
| Steward | NVIDIA (single-vendor) |
| Status | stable |
| Latest | [v26.7.2 2026-10-14](https://github.com/NVIDIA/gpu-operator/releases/tag/v26.7.2) |
| Radar | **hold**: Fit decided it: stable, but Unfold has no GPUs and Talos replaces most of the operator. |
| Moves when | A GPU node joins an Unfold cluster on a distribution other than Talos. |
| Competes with | — |
| Complements | [Kubernetes Dynamic Resource Allocation (DRA, structured parameters)](inference-infra.md#k8s-dra), [Container Device Interface (CDI)](inference-infra.md#cdi) |
| Builds on | [Container Device Interface (CDI)](inference-infra.md#cdi) |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Avoid on Talos | self-hosting docs | On Talos the immutable OS extensions own driver and toolkit, so only the DRA or device-plugin parts would run. | S | Prevents a conflicting install. |
| Managed-cluster GPU path for self-hosters (proposed) | self-hosting docs | A self-hoster on a managed cluster with GPUs would use the operator's GPUCluster CR for the DRA driver. | S | A documented GPU path off Talos. |
| DCGM metrics if GPUs arrive (proposed) | Run tracing / metrics | DCGM exporter gives accelerator metrics for a self-hosted model pod. | S | Cost visibility for self-hosted inference. |
| Sandboxed GPU pods are untested | Run sandbox | Kata or gVisor with GPUs needs its own qualification before any Run gets one. | M | Keeps isolation intact. |
| Nothing needed today | Unfold clusters | No GPU in staging or production. | S | No wasted work. |

**Shipped adoption:** 26.7.0 GPUCluster CR (mutually exclusive with ClusterPolicy; needs k8s >= v1.34.2), DRA driver v0.5.0 → v0.5.1 in 26.7.2, Container Toolkit v1.20.0/1.20.1: https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/release-notes.html; Talos NVIDIA guide uses system extensions + device plugin, not the operator: https://docs.siderolabs.com/talos/v1.11/configure-your-talos-cluster/hardware-and-drivers/nvidia-gpu-proprietary

**Open problems:** On Talos, driver/toolkit must be disabled (immutable OS extensions own them): https://docs.siderolabs.com/kubernetes-guides/advanced-guides/dynamic-resource-allocation; CDI default-on since 25.10.0 per release notes; Talos toolkit-extension CDI behaviour not verified

**Watched:** github-releases `NVIDIA/gpu-operator` at v26.7.2

## Open Inference Protocol (KServe V2 inference protocol) { #kserve-open-inference-protocol }

Not to be confused with: REST/gRPC tensor inference API (/v2/models/{m}/infer, /v2/health/*); not the OpenAI API, not the KServe V1 protocol, not the KServe project itself

| | |
| --- | --- |
| Steward | KServe project (CNCF incubating; accepted 2025-09-29, announced 2025-11-11 https://www.cncf.io/blog/2025/11/11/kserve-becomes-a-cncf-incubating-project/) (foundation) |
| Status | dormant |
| Latest | [unversioned spec repo; last spec change 'Text Generate REST API schema' (#18) 2024-07-21](https://github.com/kserve/open-inference-protocol) |
| Radar | **hold**: Both decided it: the spec repo is dormant and Unfold uses no tensor inference. |
| Moves when | The spec gets a tagged release with token-usage fields, or a self-hoster asks to run a KServe V2 classifier. |
| Competes with | [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions), [Open Responses](inference-infra.md#open-responses) |
| Complements | [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Do not use for the self-hosted decider | Unfold tripwire / LiteLLM | System ADR-0042 (proposed) puts Strands Decider behind LiteLLM's systemone endpoint; OIP's tensor API adds nothing there. | S | No second inference protocol. |
| Note in self-hosting docs as unsupported | self-hosting docs | A self-hoster with Triton or KServe V2 models must put them behind an OpenAI-compatible server before LiteLLM sees them. | S | Saves a self-hoster a failed integration. |
| Classifier models on KServe (proposed) | self-hoster GPU cluster | If an Agency hosts a small classifier on KServe, LiteLLM's custom provider could call /v2/models/{m}/infer for premise checks. | M | Reuses an Agency's existing serving stack. |
| Watch KServe's LLM path instead | inference-infra watch | KServe's own LLMInferenceService is OpenAI-shaped and llm-d based, so that is the KServe path that could matter. | S | Focuses attention on the live part of KServe. |
| Keep out of the gateway contract | Ploeg pkg/gateway | ADR-0177 meters chat-shaped traffic per Run; OIP has no token usage fields to settle on. | S | Avoids an unmeterable path. |

**Shipped adoption:** KServe v0.21.0 (release page 2026-09-25; feed edit 2026-10-12) documents V2 as a data-plane protocol: https://kserve.github.io/website/docs/concepts/architecture/data-plane/v2-protocol; Not verified in this pass: Triton, MLServer, OpenVINO implementer list (the KServe page names no servers)

**Open problems:** Spec repo's last commit is 2025-05-12 (CoC only) and it has no tagged versions: https://github.com/kserve/open-inference-protocol/commits/main; V2 drops the explain endpoint that V1 has: https://kserve.github.io/website/docs/concepts/architecture/data-plane/v2-protocol; KServe's own LLM path (LLMInferenceService v1alpha2, llm-d) is OpenAI-shaped, not OIP: https://github.com/kserve/kserve/releases/tag/v0.21.0

**Watched:** rss `https://github.com/kserve/open-inference-protocol/commits/HEAD.atom`, github-releases `kserve/kserve` at v0.21.0

## Open Responses { #open-responses }

Not to be confused with: open multi-provider LLM API spec derived from the OpenAI Responses API (/v1/responses, semantic streaming events, WebSocket transport, /v1/responses/compact) with acceptance tests; not Chat Completions

| | |
| --- | --- |
| Steward | Agentic AI Foundation (contributed by OpenAI, 2026-10-22); LF Projects technical charter adopted 2026-10-29 (commit (foundation) |
| Status | stabilising |
| Latest | [2026-04-24 2026-04-24](https://www.openresponses.org/specification/2026-04-24) |
| Radar | **assess**: Fit decided it: the spec is foundation-hosted and has a tester, but Ploeg's harnesses and Fireworks speak Chat Completions today. |
| Moves when | A harness on Ploeg's allowlist requires /v1/responses, or LiteLLM or Fireworks publish a passing compliance result. |
| Competes with | [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions), [Open Inference Protocol (KServe V2 inference protocol)](inference-infra.md#kserve-open-inference-protocol) |
| Complements | [LiteLLM Proxy (AI Gateway)](inference-infra.md#litellm), [agentgateway](inference-infra.md#agentgateway), [Agent Router (formerly Envoy AI Gateway)](inference-infra.md#agent-router) |
| Builds on | [OpenAI Chat Completions API (de facto /v1/chat/completions)](inference-infra.md#openai-chat-completions) |
| Superseded by | — |
| Decisions | [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0041-the-openai-agents-api-stays-outside-the-run-until-it-takes-an-authorized-budget](../../../../../apps/ploeg/docs/adrs/0041-the-openai-agents-api-stays-outside-the-run-until-it-takes-an-authorized-budget.md), [2026-10-14-litellm-and-fireworks-update](../../../../../docs/research/2026-10-14-litellm-and-fireworks-update.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Run the compliance tester against LiteLLM's /v1/responses (proposed) | LiteLLM gateway | Point Open Responses' CLI compliance test at the staging LiteLLM to see whether its Responses bridge (to Chat Completions on Fireworks) holds the spec. | S | Tells Ploeg whether a Responses-only harness would work through today's gateway. |
| Add a Responses requirement to the gateway contract (proposed) | Ploeg pkg/gateway contract suite | ADR-0177's contract suite could assert that both implementations serve /v1/responses for harnesses that need it. | M | Keeps harness choice independent of the gateway kind. |
| Prepare for harnesses that drop Chat Completions | Ploeg workers / harness adapters | OpenAI recommends Responses for new projects; watch which harnesses Ploeg runs (Ploeg ADR-0098 allowlist) move to Responses-only. | S | Avoids a surprise outage when a harness upgrade changes wire format. |
| Compact endpoint for long Runs (proposed) | Run sandbox / harness | /v1/responses/compact could shrink context in long writing Runs; only if Fireworks or LiteLLM implement it. | M | Lower input tokens per Run. |
| Keep the OpenAI Agents API out of the Run | Ploeg policy | Ploeg ADR-0041 keeps the OpenAI Agents API outside the Run until it takes an authorized budget; Open Responses is the wire format, not that hosted agent, so it does not reopen that ADR. | S | Avoids confusing the spec with the hosted service. |

**Shipped adoption:** Community logos: NVIDIA, Vercel AI SDK, OpenRouter, Hugging Face, LM Studio, Databricks, Red Hat, AWS, Ollama, OpenAI, vLLM, Llama Stack: https://www.openresponses.org/; Compliance tester (web + CLI bin/compliance-test.ts): https://www.openresponses.org/compliance; agentgateway lists Responses API type: https://agentgateway.dev/docs/kubernetes/latest/; Agent Router serves /v1/responses via AWSOpenAI backend: https://github.com/theagentrouter/agent-router/releases/tag/v1.2.0

**Open problems:** Client-side compliance suite missing [secondary]: https://www.infoq.com/news/2026/02/openai-open-responses; Implementer logos are not compliance claims: https://www.openresponses.org/

**Watched:** changelog-page `https://raw.githubusercontent.com/openresponses/openresponses/main/CHANGELOG.md`, rss `https://github.com/openresponses/openresponses/commits/HEAD.atom`

## OpenAI Chat Completions API (de facto /v1/chat/completions) { #openai-chat-completions }

| | |
| --- | --- |
| Steward | OpenAI (single-vendor) |
| Status | stable |
| Latest | [no spec version; OpenAI says 'Chat Completions remains supported, Responses is recommended for all new projects'; the API changelog is its changelog 2026-11-04](https://developers.openai.com/api/docs/guides/migrate-to-responses) |
| Radar | **adopt**: Fit and maturity both decided it: it is the de facto format every component in Unfold's model path speaks today. |
| Moves when | Fireworks or a harness on Ploeg's allowlist deprecates Chat Completions in favour of Responses. |
| Competes with | [Open Responses](inference-infra.md#open-responses), [Anthropic Messages API compatibility (/v1/messages)](inference-infra.md#anthropic-messages-api), [Google Gemini Interactions API](inference-infra.md#gemini-interactions-api) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering](../../../../../apps/ploeg/docs/adrs/0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering.md), [0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations](../../../../../apps/ploeg/docs/adrs/0177-ploeg-reaches-models-through-a-gateway-contract-with-litellm-and-envoy-ai-gateway-as-implementations.md), [0123-dispatch-waits-for-tracker-dependencies-and-an-opt-in-free-premise-check](../../../../../apps/ploeg/docs/adrs/0123-dispatch-waits-for-tracker-dependencies-and-an-opt-in-free-premise-check.md), [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) |
| Watchlist | T19 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Keep Chat Completions as the Run's model wire format | Ploeg workers / LiteLLM gateway | Workers and the acp/opencode and openhands harnesses call LiteLLM's OpenAI-compatible endpoint with the per-Run key (Ploeg ADR-0039). | S | The one format every configured Fireworks model and harness supports. |
| Contract-test the model allowlist on this endpoint (proposed) | Ploeg pkg/gateway contract suite | ADR-0177's suite should call /v1/chat/completions with a model outside the Run's list and expect a refusal with no fallback. | S | Proves ADR-0039's no-fallback rule for every gateway kind. |
| Premise check and decider on the same shape | Ploeg premise check / Unfold tripwire | Ploeg ADR-0123's premise check and system ADR-0042's interim decider use OpenAI-format calls through LiteLLM. | S | No new client code for cheap classifier calls. |
| Document deviations for self-hosters' local models | self-hosting docs | Ollama lacks tool_choice and n; a self-hoster pointing LiteLLM at a local model needs a known-limits table in self-host-the-whole-stack.md. | S | Fewer agent failures that look like repository problems. |
| Benchmark gateway latency on this endpoint (proposed) | LiteLLM gateway | Inference Perf can drive any OpenAI-compatible endpoint, so the LiteLLM-to-Fireworks path can be measured for TTFT. | S | A baseline before swapping gateways. |

**Shipped adoption:** Anthropic compat layer, labelled 'not considered a long-term or production-ready solution'; strict ignored, n must be 1, no prompt caching (https://platform.claude.com/docs/en/api/openai-sdk); Gemini OpenAI compat, beta, base https://generativelanguage.googleapis.com/v1beta/openai/; no Responses endpoint (https://aistudio.google.com/docs/openai); Ollama /v1/chat/completions; no tool_choice, logprobs or n (https://docs.ollama.com/api/openai-compatibility); vLLM /v1/chat/completions (https://docs.vllm.ai/en/latest/serving/online_serving/); LiteLLM proxy (estate) bridges /v1/responses to chat completions (https://docs.litellm.ai/docs/response_api); Open WebUI consumes it; v0.13.0 converts upstream Responses streams back into the Chat Completions format (https://github.com/open-webui/open-webui/releases); Assistants API sunset 2026-08-26 (https://developers.openai.com/api/docs/guides/migrate-to-responses)

**Open problems:** No neutral spec or conformance suite; each provider documents its own deviations (see the Anthropic and Gemini pages above)

**Watched:** changelog-page `https://developers.openai.com/api/docs/changelog.md`

## OpenEnv { #aaif-openenv }

Not to be confused with: AAIF project (contributed by Hugging Face) for containerised RL/agent environments with reset/step/state over WebSocket plus /mcp; not a serving or sandbox runtime

| | |
| --- | --- |
| Steward | Agentic AI Foundation; technical committee incl. Meta-PyTorch, Hugging Face, NVIDIA, Microsoft, Nebius (foundation) |
| Status | draft |
| Latest | [v0.11.0 2026-10-29](https://github.com/openenv/OpenEnv/releases/tag/v0.11.0) |
| Radar | **hold**: Maturity decided it: draft with changing APIs and no Kubernetes deployment, and Unfold does no RL. |
| Moves when | OpenEnv documents a Kubernetes deployment and Ploeg starts a reviewer or builder bench that needs repeatable environments. |
| Competes with | — |
| Complements | [OpenSandbox](inference-infra.md#aaif-opensandbox), [Kubernetes Agent Sandbox (Sandbox CRD)](inference-infra.md#k8s-agent-sandbox) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks](../../../../../apps/ploeg/docs/adrs/0135-a-bake-off-runs-one-work-item-on-several-configurations-and-a-shadow-judge-recommends-while-a-person-picks.md), [2026-10-11-agentic-models-and-topology](../../../../../docs/research/2026-10-11-agentic-models-and-topology.md), [2026-10-14-litellm-and-fireworks-update](../../../../../docs/research/2026-10-14-litellm-and-fireworks-update.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Bake-off tasks as environments (proposed) | Ploeg bake-offs | Ploeg ADR-0135 runs one Work Item on several configurations; OpenEnv's reset/step/state could package planted-defect benches for repeatable runs. | M | Repeatable model comparisons. |
| Training data for fine-tuning later (proposed) | Run economics | The 2026-10-14 record says fine-tuning needs a few hundred judged Runs first; OpenEnv is a format for that later RL step. | L | Option to train a cheaper builder. |
| Not a Run sandbox | Run sandbox | OpenEnv has no Kubernetes deployment and is not a sandbox runtime; Runs stay on Kata or gVisor. | S | Avoids category confusion. |
| Reviewer bench environments (proposed) | Ploeg reviewer Role | A reviewer bench of planted defects could be exposed through OpenEnv's /mcp for any harness. | M | Measures reviewer precision outside live work. |
| Watch for a Kubernetes integration | inference-infra watch | agent-sandbox added Gymnasium and NeMo Gym integrations; an OpenEnv one would make it usable on Unfold's clusters. | S | Know when it becomes practical. |

**Shipped adoption:** AAIF announcement 2026-10-22: https://aaif.io/news/agentic-ai-foundation-announces-four-new-projects; agent-sandbox v1.0.0 added NeMo Gym/Gymnasium integrations (adjacent, not OpenEnv): https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.0

**Open problems:** README: 'in early development, so APIs may still change'; no Kubernetes deployment documented: https://github.com/openenv/OpenEnv

**Watched:** github-releases `openenv/OpenEnv` at v0.11.0

## OpenSandbox { #aaif-opensandbox }

Not to be confused with: AAIF project (contributed by Alibaba); sandbox protocol (lifecycle + execution APIs in specs/) + server + K8s operator with CRDs BatchSandbox, Pool, SandboxSnapshot

| | |
| --- | --- |
| Steward | Agentic AI Foundation (Linux Foundation); joined 2026-10-22 (foundation) |
| Status | stabilising |
| Latest | [1.2.0 (1.2.1-rc.1 on 2026-11-04) 2026-10-27](https://github.com/opensandbox-group/OpenSandbox/releases/tag/release-1.2.0) |
| Radar | **hold**: Fit decided it: it competes with the agent-sandbox CRDs Unfold already chose and cannot take per-Run network policy from a pool. |
| Moves when | OpenSandbox and agent-sandbox announce alignment, or its pools accept per-request network policy. |
| Competes with | [Kubernetes Agent Sandbox (Sandbox CRD)](inference-infra.md#k8s-agent-sandbox) |
| Complements | [Kata Containers](inference-infra.md#kata-containers), [OpenEnv](inference-infra.md#aaif-openenv) |
| Builds on | — |
| Superseded by | — |
| Decisions | [0013-sandbox-crd-placement-with-warm-kata-pools](../../../../../apps/unfold/docs/adrs/0013-sandbox-crd-placement-with-warm-kata-pools.md), [0009-workspace-placement-is-a-session-choice](../../../../../apps/unfold/docs/adrs/0009-workspace-placement-is-a-session-choice.md), [0075-a-stopped-writing-run-leaves-a-checkpoint-its-retry-starts-from](../../../../../apps/ploeg/docs/adrs/0075-a-stopped-writing-run-leaves-a-checkpoint-its-retry-starts-from.md), [0101-a-paused-run-keeps-its-pod-and-session-for-a-bounded-time-and-is-never-retried-automatically](../../../../../apps/ploeg/docs/adrs/0101-a-paused-run-keeps-its-pod-and-session-for-a-bounded-time-and-is-never-retried-automatically.md), [0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy](../../../../../apps/ploeg/docs/adrs/0037-teams-opt-into-registry-egress-through-a-logged-allowlist-proxy.md), [2026-09-10-sandbox-landscape](../../../../../apps/unfold/docs/research/2026-09-10-sandbox-landscape.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Mine snapshot semantics for Run checkpoints | Ploeg stopped Runs | Ploeg ADR-0075 leaves a checkpoint a retry starts from; OpenSandbox's SandboxSnapshot with qemu VM state is a design reference. | S | Informs a later VM-level checkpoint without a dependency. |
| Compare pause and resume with Ploeg ADR-0101 | Ploeg paused Runs | OpenSandbox pause needs a registry push of the rootfs and single replicas; compare with keeping the pod for a bounded time. | S | Confirms the current design is cheaper. |
| Stay on agent-sandbox for placement | Run sandbox | Unfold ADR 0013 chose the kubernetes-sigs CRDs; OpenSandbox overlaps with no stated alignment. | S | One sandbox controller per cluster. |
| Watch its sandbox protocol as a placement API | Unfold workspace placement | If OpenSandbox's lifecycle and execution API becomes a cross-vendor standard, it could be one more placement in Unfold ADR 0009. | S | Option value for local placements. |
| Note the per-request limits | Run sandbox | Pool templates cannot take per-request volumes or networkPolicy, which per-Run egress (Ploeg ADR-0037) needs. | S | Clear reason to keep it out. |

**Shipped adoption:** AAIF announcement: https://aaif.io/news/agentic-ai-foundation-announces-four-new-projects; Operator CRDs and pooled delivery: https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture/control-plane/operator.md

**Open problems:** Overlaps kubernetes-sigs/agent-sandbox (warm pools, claims) with no stated alignment: https://github.com/opensandbox-group/OpenSandbox; Pause/resume needs a registry push of rootfs and only single-replica sandboxes: https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture/control-plane/operator.md; Pool templates cannot take per-request volumes/networkPolicy: same URL

**Watched:** rss `https://github.com/opensandbox-group/OpenSandbox/releases.atom`

## Vendor MCP gateways (Kong AI MCP Proxy/OAuth2, Docker MCP Gateway, Microsoft MCP Gateway) { #vendor-mcp-gateways }

Not to be confused with: product implementations, not standards; none is standardising

| | |
| --- | --- |
| Steward | Kong Inc.; Docker Inc.; Microsoft (single-vendor) |
| Status | stabilising |
| Latest | [Microsoft mcp-gateway v1.0.0 (2026-10-16); Docker mcp-gateway v0.44.3 (2026-10-26); Kong AI MCP OAuth2 plugin requires Gateway 3.12+, claim mapping 3.14.0.0 (2026-04-07) 2026-10-26](https://github.com/docker/mcp-gateway/releases/tag/v0.44.3) |
| Radar | **hold**: Fit decided it: products, not standards, and Unfold's MCP traffic already has a gateway boundary. |
| Moves when | An MCP gateway SEP appears, or an Agency requires Unfold behind its existing vendor gateway. |
| Competes with | [LiteLLM Proxy (AI Gateway)](inference-infra.md#litellm), [agentgateway](inference-infra.md#agentgateway), [Agent Router (formerly Envoy AI Gateway)](inference-infra.md#agent-router) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team](../../../../../apps/ploeg/docs/adrs/0078-runs-reach-read-only-mcp-tools-only-through-the-gateway-bounded-by-a-litellm-team.md), [adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server](../../../../../docs/adr/adr-0011-unfold-is-reachable-over-mcp-through-a-read-first-server.md), [adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp](../../../../../docs/adr/adr-0035-interactive-sessions-reach-tenant-knowledge-only-through-unfold-mcp.md), [0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in](../../../../../apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md), [2026-10-30-mcp-extensions-fit](../../../../../apps/unfold/docs/research/2026-10-30-mcp-extensions-fit.md) |
| Watchlist | T31, T34 |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Do not adopt a vendor MCP gateway for Runs | Ploeg workers | Ploeg ADR-0078 keeps Run tools behind the model gateway bounded by a gateway team; a vendor gateway would be a second credential boundary. | S | One boundary to audit. |
| Document how an Agency's gateway can front unfold-mcp | self-hosting docs / unfold-mcp | An Agency on Kong or Microsoft's gateway could front Unfold's MCP server; unfold-mcp accepts any client with a token for its resource (Ploeg ADR-0182 for ploeg-mcp). | S | Fits Agencies that already run one. |
| Microsoft gateway for Entra-based Agencies (proposed) | hosted Tenant cluster | Microsoft mcp-gateway requires MCP 2026-07-28 clients and Entra ID, matching an Agency on Microsoft identity (T31's IdP case). | M | A ready front for that Agency segment. |
| Docker MCP Gateway for local developers | Unfold docs | People linking their own agent sessions (Unfold ADR 0047) may run Docker's gateway locally; nothing to integrate. | S | No support burden. |
| Watch for an MCP gateway SEP | MCP standards watch | No gateway behaviour is standardised; re-check at MCP roadmap updates. | S | Adopt only a standard shape. |

**Shipped adoption:** Microsoft: StatefulSets + headless services, Entra ID auth, tool registry via /tools, requires MCP 2026-07-28 clients (MIT): https://github.com/microsoft/mcp-gateway; Docker: containers per server, OCI catalogs/profiles, no K8s mention (MIT): https://github.com/docker/mcp-gateway; Kong AI MCP Proxy (proxy, OpenAPI→MCP, aggregate) + AI MCP OAuth2 (Tech Preview, Enterprise only): https://developer.konghq.com/plugins/ai-mcp-oauth2/

**Open problems:** Absence: no MCP gateway SEP/WG; roadmap only names 'gateway behavior' under enterprise readiness: https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/

**Watched:** github-tags `microsoft/mcp-gateway` at v1.0.0, github-tags `docker/mcp-gateway` at v0.44.3, changelog-page `https://developer.konghq.com/plugins/ai-mcp-oauth2/changelog/`

## vLLM production-stack { #vllm-production-stack }

Not to be confused with: Helm stack (vLLM engines + own router + LMCache + Grafana) from the vLLM project; not GIE/llm-d

| | |
| --- | --- |
| Steward | vLLM project (PyTorch Foundation; governance not re-verified) (community) |
| Status | stabilising |
| Latest | [vllm-stack-0.1.13 2026-09-30](https://github.com/vllm-project/production-stack/releases/tag/vllm-stack-0.1.13) |
| Radar | **hold**: Fit decided it: no self-hosted inference, and pre-1.0 routing. |
| Moves when | A self-hoster or the owner runs an open-weight model on one GPU for Runs or the decider. |
| Competes with | [llm-d (Kubernetes-native distributed LLM inference)](inference-infra.md#llm-d), [Kubernetes Gateway API Inference Extension (GAIE/GIE)](inference-infra.md#gateway-api-inference-extension) |
| Complements | — |
| Builds on | — |
| Superseded by | — |
| Decisions | [adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire](../../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) |
| Watchlist | — |
| Reviewed | 2026-11-04 |

| Use case | Where | How | Effort | Value |
| --- | --- | --- | --- | --- |
| Simplest self-hosted model stack for a small Agency (proposed) | self-hosting docs | A one-chart vLLM stack behind LiteLLM is lighter than llm-d for a single GPU box. | M | A low-effort path for self-hosters with one GPU. |
| Serve the decider on vLLM (proposed) | Unfold tripwire | If system ADR-0042's decider needs faster answers, vLLM on a GPU is the fast inline option the ADR rejected for cost. | M | Inline screening becomes possible. |
| Prefer llm-d where routing matters | self-hosting docs | The stack's prefix-aware routing is WIP and has no GIE support. | S | Steers multi-GPU self-hosters to the standard path. |
| Grafana dashboards reuse (proposed) | Run tracing | Its Grafana boards could be a starting point for model-serving panels. | S | Faster observability for self-hosted models. |
| Nothing needed today | Unfold clusters | No GPU. | S | No wasted work. |

**Shipped adoption:** Repo active, 2026 roadmap: https://github.com/vllm-project/production-stack

**Open problems:** Router prefix-aware routing marked WIP; no GIE mention: https://github.com/vllm-project/production-stack

**Watched:** rss `https://github.com/vllm-project/production-stack/releases.atom`
