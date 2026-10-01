# Fireworks AI: serverless pricing, deployments, training and data handling (October 2026)

Research method note (2026-10-01): Fireworks documentation was read in full as Markdown (`docs.fireworks.ai/<page>.md`), the pricing page and model pages were fetched as HTML, and the Data Processing Addendum was read as the PDF that `fireworks.ai/dpa` redirects to. "Primary" means a Fireworks-owned page. "Secondary" means a third-party tracker or aggregator. The Trust Center (`trust.fireworks.ai`) renders client-side and returned no readable content. Calculations are marked as estimates. All prices are US$.

## Takeaway

Fireworks bills serverless inference per token in three modes. Standard is the default. Priority costs 1.2x to 1.5x Standard and is less likely to be load-shed. Fast costs 1.5x and exists only for Kimi K3 and GLM 5.3/5.2. Prompt caching is automatic, scoped to one replica and to one account, with no fixed TTL ("several minutes" up to "several hours"). For DeepSeek V4.1 Flash, cached input costs 2% of the uncached rate. Batch is 50% off. At Glide's volume (50-500 Shifts a month), every listed model costs between about $2 and $1,200 a month on Standard serverless (estimate). One on-demand H100 left running costs about $5,840 a month at $8.00/hour, so dedicated GPUs do not pay off at this volume. The constraints that matter for Glide are on the data side. Zero data retention is the default, and the DPA forbids training on customer data and includes EU SCCs (Module 2, Irish law). However, there is no self-serve EU-only serverless inference: the only residency option is US, and EU-only serverless means contacting sales. Default serverless traffic runs on a global fleet whose sub-processors are mostly US-based. Dedicated deployments can run in Frankfurt or Iceland, but EU quota starts at zero and region-pinned deployments cost 1.5x. Prices also moved a lot in August and September 2026, with no advance notice for the DeepSeek V4 Flash change.

## 1. Serverless modes and per-model prices

### How the modes differ (primary)

- **Standard** is the default and needs no `service_tier` parameter. **Priority** is selected with `service_tier: "priority"`, is "prioritized above Standard traffic and is less likely to be load shed (503 server overloaded)", and is available only on some models. **Fast** is selected by changing the model ID to a router such as `accounts/fireworks/routers/kimi-k3-fast`. Fast aims for "100+ tokens per second" and "is not a different model". Source: [Serverless Modes](https://docs.fireworks.ai/serverless/serverless-modes) (primary).
- Fast exists only for Kimi K3, GLM 5.3, GLM 5.2 and GLM 5.2 (US). None of Glide's Flash-class models has a Fast variant. Source: [Serverless Modes](https://docs.fireworks.ai/serverless/serverless-modes) (primary).
- Priority and regular requests share the same rate limit. Fast and regular variants have separate limits. Source: [Serverless Rate Limits](https://docs.fireworks.ai/serverless/rate-limits) (primary).
- Mode does not change latency guarantees beyond the above. No latency SLA is published for any serverless mode. The SLA-backed option is Reserved Throughput (section 5).

### Prices for Glide's models, per 1M tokens: input / cached input / output (primary)

Source for every row: [Serverless Pricing](https://docs.fireworks.ai/serverless/pricing) (primary). The page says "This pricing table is the source of truth".

| Model (Fireworks ID) | Standard | Priority | Priority vs Standard | Fast |
| - | - | - | - | - |
| DeepSeek V4.1 Flash (`deepseek-v4p1-flash`) | $0.30 / $0.006 / $1.20 | $0.375 / $0.0075 / $1.50 | 1.25x | none |
| GLM 5.3 Flash (`glm-5p3-flash`) | $0.15 / $0.03 / $0.50 | $0.1875 / $0.0375 / $0.625 | 1.25x | none |
| Kimi K3 (`kimi-k3`) | $3.00 / $0.30 / $15.00 | $3.75 / $0.375 / $18.75 | 1.25x | $4.50 / $0.45 / $22.50 (Priority not available) |
| MiniMax M3 (`minimax-m3`) | $0.30 / $0.06 / $1.20 | $0.45 / $0.09 / $1.80 | 1.5x | none |
| Qwen 3.8 Max (`qwen3p8-max`) | $2.00 / $0.25 / $6.00 | $3.00 / $0.375 / $9.00 | 1.5x | none |
| gpt-oss-120b (`gpt-oss-120b`) | $0.15 / $0.015 / $0.60 | $0.18 / $0.018 / $0.72 | 1.2x | none |
| Nemotron 3.5 Lightning 30B A3B (`nemotron-lightning-3p5-30b-a3b`) | $0.05 / $0.01 / $0.20 | $0.0625 / $0.0125 / $0.25 | 1.25x | none |

For context, GLM 5.3 (non-Flash) is $1.40 / $0.26 / $4.40 Standard, and GLM 5.3 Fast is $2.10 / $0.39 / $6.60 ([Serverless Pricing](https://docs.fireworks.ai/serverless/pricing), primary).

US-only variants cost 1.5x the base price, effective September 1, 2026. Examples: DeepSeek V4.1 Flash (US) $0.45 / $0.009 / $1.80, GLM 5.3 Flash (US) $0.225 / $0.045 / $0.75, Kimi K3 (US) $4.50 / $0.45 / $22.50. Sources: [Serverless Pricing](https://docs.fireworks.ai/serverless/pricing) and [US-only Serverless](https://docs.fireworks.ai/serverless/us-only-serverless) (both primary).

### Conflicting figures

- The DeepSeek V4.1 Flash model page says "$0.22, $0.007, and $0.66 per 1M tokens" ([model page](https://fireworks.ai/models/deepseek-ai/deepseek-v4p1-flash), primary). These are the post-2026-08-25 prices for DeepSeek V4 Flash (0731), not V4.1. The docs table, which calls itself the source of truth, says $0.30 / $0.006 / $1.20. A secondary tracker records V4.1 Flash as added on 2026-09-20 at $0.30 / $0.006 / $1.20 ([UsagePricing, Fireworks](https://www.usagepricing.com/blueprint/fireworks-ai), secondary). Treat $0.30 / $0.006 / $1.20 as current and the model page as stale.
- The MiniMax M3 model page gives cached input as $0.059 ([model page](https://fireworks.ai/models/fireworks/minimax-m3), primary). The docs table gives $0.06. The Kimi K3 model page matches the docs at $3.00 / $0.30 / $15.00 ([model page](https://fireworks.ai/models/fireworks/kimi-k3), primary).
- The DeepSeek V4.1 Flash model page also says "Fine-tuning is not supported". It gives a context of 1,040k tokens and "552B backbone parameters" with 8B active during prefill and 16B during decode, and a release date of September 10, 2026 ([model page](https://fireworks.ai/models/deepseek-ai/deepseek-v4p1-flash), primary, read through a summarizing fetch).

### Cost per Run and per Shift (estimate)

Assumptions: one Run uses 500K input tokens with a 90% cache hit rate (50K uncached plus 450K cached) and 20K output tokens. One Shift is 4 Runs. Standard prices from the table above.

| Model | $/Run | $/Shift | 50 Shifts/month | 500 Shifts/month |
| - | -: | -: | -: | -: |
| Nemotron 3.5 Lightning | 0.0110 | 0.04 | 2.20 | 22.00 |
| gpt-oss-120b | 0.0263 | 0.11 | 5.25 | 52.50 |
| GLM 5.3 Flash | 0.0310 | 0.12 | 6.20 | 62.00 |
| DeepSeek V4.1 Flash | 0.0417 | 0.17 | 8.34 | 83.40 |
| MiniMax M3 | 0.0660 | 0.26 | 13.20 | 132.00 |
| Qwen 3.8 Max | 0.3325 | 1.33 | 66.50 | 665.00 |
| Kimi K3 | 0.5850 | 2.34 | 117.00 | 1,170.00 |

Output dominates cost for most models. For DeepSeek V4.1 Flash, output is $0.024 of the $0.0417 per Run. The cache hit rate matters most for Kimi K3 and Qwen 3.8 Max: a cached token costs 10% and 12.5% of the uncached rate on those models, against 2% on V4.1 Flash.

## 2. Batch, prompt caching, on-demand GPUs, and when dedicated pays off

### Batch (primary)

- The Batch API costs "50% off Serverless per-token prices" on input and output. Batch jobs also use prompt caching automatically ([Batch API](https://docs.fireworks.ai/guides/batch-inference), primary; also stated on [Serverless Pricing](https://docs.fireworks.ai/serverless/pricing)).
- You choose a completion window of 12, 24, 48 or 72 hours. Jobs wait as "pending" until scheduled, and a job that runs out of time ends as EXPIRED with completed rows saved ([Batch API](https://docs.fireworks.ai/guides/batch-inference), primary).
- Batch supports "any model that supports On-Demand Deployments". An unsupported model "can remain in a pending state and never schedule" rather than fail ([Batch API](https://docs.fireworks.ai/guides/batch-inference), primary).
- Batch does not fit Glide's interactive Shifts. A Run is a multi-turn tool loop, and each turn depends on the previous response. Batch could fit offline evaluation or bulk classification.

### Prompt caching (primary)

- Caching is "enabled by default for all Fireworks models and deployments". It matches exact prefixes only, and tool definitions count as part of the prompt ([Prompt caching](https://docs.fireworks.ai/guides/prompt-caching), primary).
- There is no fixed TTL. Cached prompts "usually stay in the cache for at least several minutes. Depending on the model, load level, and deployment configuration, it can be up to several hours". The oldest entries are evicted first ([Prompt caching](https://docs.fireworks.ai/guides/prompt-caching), primary).
- The cache is replica-local. To keep a session on one replica, send a stable `x-session-affinity` header or the OpenAI `user` field per session ([Prompt caching](https://docs.fireworks.ai/guides/prompt-caching); [Serverless overview](https://docs.fireworks.ai/serverless/overview), both primary). For Glide, the Shift or Run ID is the obvious key.
- No cache-write surcharge is listed. The default cached discount is 50% of input unless the model has its own rate. Every Glide model has its own rate (see the table in section 1) ([Serverless overview](https://docs.fireworks.ai/serverless/overview), primary).
- Serverless keeps a separate cache per Fireworks account. Dedicated deployments share one cache unless you pass `prompt_cache_isolation_key` ([Prompt caching](https://docs.fireworks.ai/guides/prompt-caching), primary).
- Cached tokens still count toward "Total Prompt TPM" but not toward "Uncached Prompt TPM" ([Serverless Rate Limits](https://docs.fireworks.ai/serverless/rate-limits), primary).

### On-demand (dedicated) GPU prices (primary)

Per-second billing, "with no extra charges for start-up times". Source: [fireworks.ai/pricing](https://fireworks.ai/pricing) (primary). The same values appear in the [training cost estimator](https://docs.fireworks.ai/fine-tuning/cost-estimator) source (primary).

| GPU | $/minute | $/hour |
| - | -: | -: |
| H100 80 GB | 0.134 | 8.00 |
| H200 141 GB | 0.134 | 8.00 |
| B200 180 GB | 0.217 | 13.00 |
| B300 288 GB | 0.250 | 15.00 |
| GB300 288 GB | 0.334 | 20.00 |

- "Region-restricted deployments are priced at a 1.5x premium" ([fireworks.ai/pricing](https://fireworks.ai/pricing), primary). An H100 pinned to `EU_FRANKFURT_1` would therefore cost about $12.00/hour (estimate).
- Deployments scale to zero after 1 hour unused by default. Deployments with min replicas 0 are deleted after 7 days without traffic ([Deployments](https://docs.fireworks.ai/guides/ondemand-deployments), primary).
- Default GPU quota is 16 each of H100, H200, B200 and B300, in the GLOBAL multi-region only ([Account quotas](https://docs.fireworks.ai/guides/quotas_usage/account-quotas), primary).
- Enterprise accounts can buy reserved capacity, "typically with 1 year commitments", at "lower GPU-hour prices". Reserved capacity is billed whether used or not, and the discount is not published ([Reserved capacity](https://docs.fireworks.ai/deployments/reservations), primary).
- A trained LoRA adapter can only be served on an on-demand deployment ([Serverless overview](https://docs.fireworks.ai/serverless/overview); [Serverless Training](https://docs.fireworks.ai/fine-tuning/training-api/serverless), both primary).

### When dedicated beats serverless (estimate)

- One H100 running all month (730 hours) costs $5,840.00. A model of Kimi K3's size needs a multi-GPU node, for example 8x H200 at $64.00/hour, which is $46,720.00 a month.
- At 500 Shifts a month, the most expensive serverless option (Kimi K3, about $1,170.00) costs about one fifth of a single always-on H100. The Flash-class models cost $22.00 to $132.00 a month.
- Volume check: 500 Shifts × 4 Runs × 520K tokens is about 1.04B tokens a month, or roughly 24K tokens per minute on average. That is far below the serverless ceilings in section 5.
- Dedicated starts to make sense only when one of these applies: Glide serves its own fine-tuned LoRA (that requires on-demand), it needs EU-pinned inference (dedicated in `EU_FRANKFURT_1` or `EU_ICELAND_*` is the only documented EU placement), or it needs pinned model versions. Serverless models can be removed with "at least 2 weeks advance notice" ([Serverless overview](https://docs.fireworks.ai/serverless/overview), primary). Scale-to-zero after one idle hour makes a business-hours-only deployment possible. For example, 8 hours × 22 days × $8.00 = $1,408.00 a month per GPU (estimate). That is still more than serverless at 500 Shifts.

## 3. Fine-tuning and reinforcement fine-tuning

### Managed SFT and DPO, $ per 1M training tokens (primary)

Source: [fireworks.ai/pricing](https://fireworks.ai/pricing) (primary).

| Base model size | LoRA SFT | LoRA DPO | Full-param SFT | Full-param DPO |
| - | -: | -: | -: | -: |
| up to 16B | 0.50 | 1.00 | 1.00 | 2.00 |
| 16.1B-80B | 3.00 | 6.00 | 6.00 | 12.00 |
| 80B-300B (e.g. gpt-oss-120b) | 6.00 | 12.00 | 12.00 | 24.00 |
| >300B (e.g. DeepSeek V3, Kimi K2) | 10.00 | 20.00 | 20.00 | 40.00 |

Training tokens equal dataset tokens × epochs. With reasoning traces, multiply that by (average turns / 2) ([fireworks.ai/pricing](https://fireworks.ai/pricing), primary).

### Serverless Training API (LoRA SFT, DPO and RL on a shared trainer pool), $ per 1M tokens (primary)

There is no provisioning and no idle cost. Source: [fireworks.ai/pricing](https://fireworks.ai/pricing) (primary). The page says checkpoint storage is included "during private preview".

| Base model | Context | Prefill | Cached prefill | Sample | Train |
| - | - | -: | -: | -: | -: |
| GLM 5.3 Flash | 200K | 2.96 | 0.593 | 7.41 | 8.89 |
| GLM 5.3 | 262K | 4.86 | 0.972 | 12.15 | 14.58 |
| Qwen 3.8 27B | 128K | 1.86 | 0.372 | 5.595 | 4.103 |
| Kimi K3 | 192K | 10.87 | 2.17 | 27.11 | 32.55 |
| DeepSeek V4 Flash 0731 | 262K | 1.74 | 0.35 | 4.33 | 5.20 |

- RL is "the primary serverless use case": a GRPO-style loop with your own reward function. Cached prefill is an 80% discount. The default limit is 8 concurrent runs ([Serverless Training](https://docs.fireworks.ai/fine-tuning/training-api/serverless), primary).
- The Dedicated Training API is billed per GPU-hour at the on-demand rates above ([fireworks.ai/pricing](https://fireworks.ai/pricing), primary). For RL cost the estimator says to contact the training team ([Training cost estimator](https://docs.fireworks.ai/fine-tuning/cost-estimator), primary).
- Fireworks documents a "secure RFT" setup: reward functions and rollout servers stay under customer control, bring-your-own-bucket is supported for datasets, and customer-managed keys are supported for LoRA SFT, DPO and RFT ([Data Security](https://docs.fireworks.ai/guides/security_compliance/data_security), primary).
- Two contradictions to resolve before planning a tuned model. First, the pricing page says "Serve fine-tuned models for the same price as base models", but the docs say a trained LoRA requires an on-demand deployment and that "serverless per-token serving of your own trained LoRA is not available" ([Serverless Training](https://docs.fireworks.ai/fine-tuning/training-api/serverless), primary). Second, DeepSeek V4.1 Flash is not fine-tunable per its model page; the trainable sibling is V4 Flash 0731.
- Training is blocked on accounts with data residency enabled ([Data residency](https://docs.fireworks.ai/accounts/data-residency), primary) and on BYOC during preview ([BYOC](https://docs.fireworks.ai/ecosystem/integrations/byoc/overview), primary).

## 4. Data handling, compliance and residency

### Retention and training (primary)

- Zero data retention is the default. Fireworks "does not log or store prompt or generation data for any open models, without explicit user opt-in". Prompt data lives in volatile memory for the request and, with caching, "for several minutes". Metadata such as token counts is logged ([Zero Data Retention](https://docs.fireworks.ai/guides/security_compliance/data_handling), primary).
- Exception: the Responses API stores conversations for 30 days when `store=True`, which is the default. Set `store=False`, or delete records by `response_id` ([Zero Data Retention](https://docs.fireworks.ai/guides/security_compliance/data_handling), primary). Glide should not use the Responses API, or should send `store=False`.
- The DPA forbids "using Covered Data to train, fine-tune, or otherwise improve any shared or foundational model" (clause 4.3(f)) ([DPA PDF](https://fireworks.ai/dpa), primary).

### DPA (primary)

The DPA PDF is reached via [fireworks.ai/dpa](https://fireworks.ai/dpa), which redirects to [cdn.sanity.io/…/40dec0da….pdf](https://cdn.sanity.io/files/pv37i0yn/production/40dec0daee7ad0e8894fcfb872bfcd8cc5ec4839.pdf).

- It "forms part of and is incorporated into" the agreement with any business customer bound by the terms of service. No separate signature appears to be required.
- EU SCCs Module Two (controller to processor) apply to transfers, under Irish governing law and Irish courts. A UK Addendum is included.
- Sub-processor changes come with 30 days' prior notice. You have 10 days to object, with a termination right if the objection is not resolved within 30 days.
- Security incidents are notified "without undue delay, and in any event within forty-eight (48) hours" of confirmation.
- Data is deleted at the end of the retention period, or returned on request within 30 days of expiry.
- The PDF shows no effective date. The contracting entity is Fireworks.ai, Inc., a US company.

### Sub-processors (DPA Schedule 4, primary)

| Sub-processor | Location(s) | Purpose |
| - | - | - |
| Amazon Web Services | United States, Japan | Cloud infrastructure |
| Google Cloud Platform | United States | Cloud infrastructure |
| Oracle Cloud Infrastructure | United States, Japan, United Kingdom, Germany | Cloud infrastructure |
| Cloudflare | Closest data center to end user (global) | CDN |
| Lambda Labs, Voltage Park, Vultr, CoreWeave | United States | Infrastructure |
| Crusoe | United States, Iceland | Infrastructure |
| Anthropic | United States | AI services |
| Vercel, Pylon, Linear, Discord, Slack | United States | Frontend hosting, support, collaboration |

A search-result summary of the Trust Center says Fireworks has a zero-retention agreement with Anthropic, which powers "select AI services" ([Trust Center](https://trust.fireworks.ai/), via search snippet, not read directly). The data residency page indicates this concerns FireRouter model routers that pass requests to third-party providers ([Data residency](https://docs.fireworks.ai/accounts/data-residency), primary). Calling open models by ID directly avoids those routers.

### Certifications (primary)

- Fireworks reports ISO 27001, ISO 27701 and ISO 42001 as achieved, SOC 2 Type II as certified, and HIPAA support. It says controls are "mapped to GDPR, CCPA". Reports are in the Trust Center ([Data Security](https://docs.fireworks.ai/guides/security_compliance/data_security), primary).
- Encryption uses TLS 1.2+ in transit and AES-256 at rest ([Data Security](https://docs.fireworks.ai/guides/security_compliance/data_security), primary).

### Data residency and datacenter locations (primary)

- Account-level data residency is an Enterprise feature. The only regions listed are None (default, `api.fireworks.ai`, any region) and US (`us.api.fireworks.ai`). "For a region that is not listed, contact sales" ([Data residency](https://docs.fireworks.ai/accounts/data-residency), primary).
- "For EU-only Serverless, contact sales" ([US-only Serverless](https://docs.fireworks.ai/serverless/us-only-serverless), primary). No EU serverless endpoint or EU model IDs are published.
- Serverless on the default endpoint has no documented location. The existence of 1.5x-priced US-only variants implies that default traffic can be served outside the US. The sub-processor list suggests the US, Japan, the UK, Germany and Iceland as possible locations (inference).
- Dedicated deployments can use the multi-regions GLOBAL, US, CANADA, EUROPE and APAC. Listed EU single regions are `EU_FRANKFURT_1` (H100), `EU_ICELAND_1` (H200) and `EU_ICELAND_2` (B200, H200). New accounts get quota only in GLOBAL. EUROPE and all single regions start at zero and must be granted by Fireworks ([Regions](https://docs.fireworks.ai/deployments/regions), primary). Other single regions are in the US, Canada, Tokyo, Malaysia and New South Wales.
- `inference_geo` and the `Fireworks-Inference-Geo` header are deprecated in favour of account data residency ([Data residency](https://docs.fireworks.ai/accounts/data-residency), primary).
- Microsoft Foundry integration lets you deploy Fireworks models "inside your Azure subscription, billed through Azure" ([docs index](https://docs.fireworks.ai/llms.txt), primary, page not read). This may be a route to EU-region hosting; not verified.

## 5. Rate limits, spend limits, account tiers, enterprise terms, BYOC

### Serverless rate limits (primary)

Limits are adaptive, per account and per model, and grow and shrink with usage. Ramping too fast causes 429s. Staying under the limit does not prevent 503 load-shedding. Ceilings depend on model size ([Serverless Rate Limits](https://docs.fireworks.ai/serverless/rate-limits), primary):

| Size tier | Total params | Total prompt TPM | Uncached prompt TPM | Generated TPM |
| - | - | -: | -: | -: |
| Small | < 400B | 64.8M | 16.2M | 648K |
| Medium | 400B to < 1.6T | 43.2M | 10.8M | 432K |
| Large | ≥ 1.6T, or unknown | 21.6M | 5.4M | 216K |

Current limits come back in `X-Ratelimit-Limit-Tokens-*` response headers, expressed per second. Higher spending tiers raise the upper bound, and Enterprise raises it automatically.

There is also a fixed account-wide cap of 6,000 RPM with a payment method and credits, or 10 RPM without ([Account quotas](https://docs.fireworks.ai/guides/quotas_usage/account-quotas), primary).

### Spending tiers and spend limits (primary)

Source: [Account quotas](https://docs.fireworks.ai/guides/quotas_usage/account-quotas) (primary).

| Tier | How to reach it | Legacy postpaid max monthly spend |
| - | - | -: |
| Tier 1 | Valid payment method | $50 |
| Tier 2 | Spend or add $50 | $500 |
| Tier 3 | Spend or add $500 | $5,000 |
| Tier 4 | Spend or add $5,000 | $50,000 |
| Unlimited | Contact sales | Unlimited |

- Billing is prepaid credits. Contracted customers may get postpaid billing. The pricing page still says "postpaid billing" and "$1 in free credits" ([fireworks.ai/pricing](https://fireworks.ai/pricing), primary).
- The monthly spend limit is set with `firectl quota update monthly-spend-usd`. A warning goes out at 80%. At 100%, "all API requests pause automatically across serverless inference, deployments, and training". This is a hard stop that Glide's budgeting can rely on as a backstop. Enterprise spend alerts do not pause service.
- Nexus offers per-user and per-group spend caps for supported serverless models ([docs index, Spend Limits](https://docs.fireworks.ai/llms.txt), primary, page not read).

### Enterprise and BYOC (primary)

- Enterprise features: model access policy, data residency, custom SSO (OIDC/SAML), and audit and access logs ([Enterprise features](https://docs.fireworks.ai/accounts/enterprise-features), primary). No Enterprise price or minimum is published.
- Reserved Throughput is a pre-purchased dollar-per-minute amount for serverless, backed by a throughput SLA. It is use-it-or-lose-it per minute, overage is billed at list price, and it can be moved between models through the account team ([Reserved Throughput](https://docs.fireworks.ai/serverless/reserved-throughput), primary). A secondary tracker lists its launch as 2026-09-07 ([UsagePricing activity, search result title only](https://www.usagepricing.com/blueprint/activity/fireworks-ai-2026-09-07-reserved-throughput-launch), secondary, not opened).
- BYOC (Bring Your Own Cluster) is in Private Preview for Enterprise. Fireworks operates its serving stack in the customer's Kubernetes cluster with NVIDIA GPUs and outbound management access. Training is not supported, and hybrid overflow to Fireworks capacity is optional ([BYOC overview](https://docs.fireworks.ai/ecosystem/integrations/byoc/overview), primary). Data residency cannot be enforced for BYOC, because Fireworks does not control where it runs ([Data residency](https://docs.fireworks.ai/accounts/data-residency), primary).
- Fire Pass offers model routers "for personal, non-production agentic coding" ([docs index](https://docs.fireworks.ai/llms.txt), primary). It is not usable for Glide's production traffic.

## 6. Price changes in 2026

| Date | Change | Source |
| - | - | - |
| 2026-08-12 (announced), effective 2026-09-01 | On-demand GPUs: H100/H200 $7.00 → $8.00/h, B200 $10.00 → $13.00, B300 $12.00 → $15.00, GB300 $18.00 → $20.00. The tracker calls this the first repricing of a published on-demand SKU since launch in 2024-01. | [UsagePricing, Fireworks](https://www.usagepricing.com/blueprint/fireworks-ai) (secondary). Current values confirmed on [fireworks.ai/pricing](https://fireworks.ai/pricing) (primary). |
| 2026-08-25 | DeepSeek V4 Flash (0731) Standard: input $0.14 → $0.22 (+57%), cached $0.028 → $0.007 (−75%), output $0.28 → $0.66 (+136%). Priority $0.21 / $0.042 / $0.42 → $0.275 / $0.00875 / $0.825. No effective-date notice. | [UsagePricing activity](https://www.usagepricing.com/blueprint/activity/fireworks-ai-2026-08-25-deepseek-flash-repriced) (secondary). New values match the [V4 Flash 0731 model page](https://fireworks.ai/models/deepseek-ai/deepseek-v4-flash-0731) per search snippet (primary, not opened). |
| 2026-09-01 | US-only serverless models priced at 1.5x base. | [US-only Serverless](https://docs.fireworks.ai/serverless/us-only-serverless) (primary) |
| 2026-09-20 | DeepSeek V4.1 Flash added at $0.30 / $0.006 / $1.20. Kimi K3 (US) repriced from $3.30 / $0.33 / $16.50 to $4.50 / $0.45 / $22.50 (+36%) to match the 1.5x rule. | [UsagePricing, Fireworks](https://www.usagepricing.com/blueprint/fireworks-ai) (secondary). Current values confirmed on [Serverless Pricing](https://docs.fireworks.ai/serverless/pricing) (primary). |

Note: the 2026-08-25 change cut the cached-input price of DeepSeek V4 Flash and raised its uncached-input and output prices. For a cache-heavy agent workload, the cheaper cached input offsets most of the increase. Under the section 1 Run shape, V4 Flash 0731 went from about $0.0252 to about $0.0274 per Run, up about 9% (estimate). A workload with a low cache hit rate would see a much larger increase.

## Gaps

- **EU serverless.** No price, model list or endpoint exists for EU-only serverless; it requires contacting sales. Whether default-endpoint traffic ever lands in the EU, or which countries serve it, is undocumented.
- **Trust Center.** Its content (SOC 2 report, ISO certificates, live sub-processor list, any TIA) could not be read because the page renders client-side. Certification claims come from Fireworks' own docs page.
- **DPA date.** The DPA PDF has no visible effective or version date. Whether Schedule 4 matches the live Trust Center list is unverified.
- **Batch coverage.** It is unverified whether Kimi K3, DeepSeek V4.1 Flash, GLM 5.3 Flash, MiniMax M3, Qwen 3.8 Max or Nemotron Lightning support the Batch API. The docs tie batch to on-demand deployability.
- **Cache TTL.** No guaranteed minimum cache TTL is published. Glide's real hit rate across tool-call gaps must be measured from `fireworks-cached-prompt-tokens`.
- **Prices for Enterprise, reserved capacity and Reserved Throughput** are not published.
- **Fine-tuned serving.** The pricing page ("same price as base models") contradicts the docs (LoRA requires on-demand). This needs confirmation with Fireworks.
- **Latency.** No latency or throughput SLA is published for Standard or Priority. Fast's "100+ tokens per second" is a stated aim, not a guarantee.
- **Model pages vs docs.** The DeepSeek V4.1 Flash model page shows stale prices. Model pages for GLM 5.3 Flash, Qwen 3.8 Max, gpt-oss-120b and Nemotron Lightning did not expose a price sentence; the docs table was used instead.
- **Nemotron model ID.** "Nemotron Lightning" was matched to `nemotron-lightning-3p5-30b-a3b`. Glide's configured ID was not checked.
- **Microsoft Foundry route** for EU-region hosting was not investigated.
