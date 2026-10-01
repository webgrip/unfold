# Open-weight model inference providers for EU coding agents (2026-10-01)

Method note: four research passes on 2026-10-01 read vendor pricing pages, docs, legal pages and public pricing feeds (OpenRouter `/api/v1/models`, the AWS Bedrock pricing feed, the Azure Retail Prices API, the Nebius and Berget model catalogues). Most pages were read through a summarising fetch tool. Some were downloaded raw and parsed, and a few were only visible as search snippets. Every figure carries its URL. **[P]** marks the vendor's own page, docs or pricing feed; **[S]** marks news, an aggregator or a blog. Prices are per million tokens in US$ unless marked **€** (the vendor prices in euro, normally excluding VAT) or **CHF**. Model names are copied from the vendor pages, which list DeepSeek V4.x, GLM 5.x, Kimi K3 and Qwen 3.8 as current. Prices change often, so re-read the vendor page before any figure goes into a contract or price sheet.

## Takeaway

For one Run of the Glide shape (0.5M input tokens of which 80% are cached, plus 20K output), the cheapest options anywhere are DeepInfra's DeepSeek V4 Flash variants at about **$0.02 per Run**. DeepInfra runs only in the US and Canada. The cheapest option that keeps inference in the EU is DeepSeek V4 Flash 0731 through OpenRouter's EU endpoint, served by Inceptron in Sweden/Finland, at about **$0.03 per Run** including OpenRouter's 8% Business fee. That chain has two weak links: OpenRouter is a US company and the Business plan is required, and Inceptron's location and DPA are confirmed only by a secondary source. With an EU-owned vendor contracting directly, a Run costs about €0.04–0.09:
- T-Systems: GLM-5.3-Flash or gpt-oss-120b at €0.044, but with a €1,000/month minimum.
- OVHcloud: gpt-oss-120b at €0.048, with no cache discount.
- Scaleway: DeepSeek V4 Flash 0731 at €0.088, zero retention by default.

A frontier-class coding model in the EU costs about **$0.28 per Run**: GLM 5.3 hosted by Mistral in France, which has a DPA and ISO 27001/SOC 2, with zero retention on request. Prompt caching matters a lot for this shape. A provider that bills cached tokens at the full input rate (IONOS, OVHcloud, Bedrock and Nebius for most models) costs 3–5× more per Run than its list price suggests. Do not send client code to China-hosted APIs, chiefly DeepSeek's own API. The Singapore-contracted Chinese vendor APIs (Moonshot, MiniMax, Z.ai) are not much better. Several US serverless providers, Fireworks among them, cannot promise EU processing without an enterprise contract.

## Workload and cost formula

- One Run = 100K uncached input + 400K cached input + 20K output tokens. One Shift ≈ 4 Runs = 2M input + 80K output.
- Cost per Run = 0.1 × input price + 0.4 × cached price + 0.02 × output price, using per-million prices. Where a provider gives no cache discount, cached tokens are billed at the input price.
- Cache writes are assumed free. That holds for most providers here. It does not hold for Moonshot's Kimi K3 or for Alibaba's explicit cache, so those figures are a floor.
- 50–500 Shifts/month = 200–2,000 Runs/month.

## Cost per Run, top options

Cost columns are in the provider's currency. "EU" means inference runs in an EU member state under the provider's documented terms.

| Option | Model | EU? | Per Run | Per Shift | 50 Shifts/mo | 500 Shifts/mo |
|---|---|---|---|---|---|---|
| OpenRouter EU → Inceptron (+8% fee) | DeepSeek V4 Flash 0731 | Yes (routed; US intermediary) | $0.031 | $0.12 | $6.22 | $62.21 |
| T-Systems LLM Hub (€1,000/mo minimum) | GLM-5.3-Flash | Yes (DE) | €0.044 | €0.18 | €8.80 | €88.00 |
| Azure Foundry, Data Zone EU | DeepSeek-V4-Flash | Yes (US-owned) | $0.045 | $0.18 | $8.92 | $89.20 |
| T-Systems LLM Hub | gpt-oss-120b | Yes (DE) | €0.045 | €0.18 | €9.00 | €90.00 |
| OVHcloud AI Endpoints | gpt-oss-120b | Yes (FR) | €0.048 | €0.19 | €9.60 | €96.00 |
| Mistral La Plateforme | Codestral 2508 | Yes (FR) | $0.060 | $0.24 | $12.00 | $120.00 |
| Bedrock Stockholm | gpt-oss-120b | Yes (US-owned) | $0.087 | $0.35 | $17.40 | $174.00 |
| Scaleway Generative APIs | deepseek-v4-flash-0731 | Yes (FR) | €0.088 | €0.35 | €17.60 | €176.00 |
| IONOS AI Model Hub | Qwen3-Coder-Next | Yes (DE) | €0.091 | €0.36 | €18.20 | €182.00 |
| OpenRouter EU → Inceptron (+8%) | Kimi K2.6 | Yes (routed) | $0.151 | $0.60 | $30.24 | $302.40 |
| Scaleway | qwen3.8-27b | Yes (FR) | €0.174 | €0.70 | €34.80 | €348.00 |
| OpenRouter EU → Inceptron (+8%) | GLM 5.3 (fp4) | Yes (routed) | $0.216 | $0.86 | $43.16 | $431.57 |
| OpenRouter EU → Inceptron (+8%) | Kimi K2.7 Code | Yes (routed) | $0.222 | $0.89 | $44.50 | $444.96 |
| Bedrock Stockholm | Qwen3 Coder 480B | Yes (US-owned) | $0.261 | $1.04 | $52.20 | $522.00 |
| Mistral La Plateforme | GLM 5.3 | Yes (FR) | $0.284 | $1.14 | $56.80 | $568.00 |
| Bedrock Frankfurt | Devstral 2 123B | Yes (US-owned) | $0.288 | $1.15 | $57.60 | $576.00 |
| Mistral La Plateforme | Mistral Medium 3.5 (assumes −90% cache) | Yes (FR) | $0.360 | $1.44 | $72.00 | $720.00 |
| Nebius (eu-west2) / Berget AI | Kimi K3, no cache discount | Nebius: no guarantee; Berget: Yes (SE, € pricing) | 1.80 | 7.20 | 360.00 | 3,600.00 |
| DeepInfra | DeepSeek-V4-Flash-0731 | No (US/CA) | $0.016 | $0.06 | $3.12 | $31.20 |
| DeepInfra | GLM-5.3-Flash (promo) | No | $0.019 | $0.07 | $3.70 | $37.00 |
| DeepInfra | gpt-oss-120b | No | $0.022 | $0.09 | $4.38 | $43.80 |
| DeepSeek API, off-peak | V4.1 Flash | No (China) | $0.028 | $0.11 | $5.64 | $56.40 |
| Fireworks | gpt-oss-120b | No | $0.033 | $0.13 | $6.60 | $66.00 |
| Fireworks / Together / Baseten | DeepSeek V4.1 Flash | No | $0.056 | $0.23 | $11.28 | $112.80 |
| DeepInfra | DeepSeek-V4-Pro | No | $0.222 | $0.89 | $44.40 | $444.00 |
| Fireworks | GLM 5.3 | No | $0.332 | $1.33 | $66.40 | $664.00 |
| Fireworks / Together / Moonshot | Kimi K3 | No | $0.720 | $2.88 | $144.00 | $1,440.00 |

Even the most expensive EU option at 500 Shifts/month (Kimi K3 without caching, about 3,600 in dollars or euros) is far below the cost of the human review time the Shifts replace. Model choice should therefore follow quality first. Price matters most when picking between providers for the same model.

## Comparison tables per model

Columns: input / cached input / output per million tokens. "–" means no cache price published (billed as input). "EU" codes:
- **EU**: runs in an EU member state, EU-owned vendor.
- **EU-US**: runs in an EU region of a US-owned vendor.
- **EU-routed**: OpenRouter's EU endpoint.
- **no-guar**: an EU region exists, but the shared endpoint does not guarantee it.
- **UK** or **CH**: an adequacy country outside the EU.
- **No**: no EU processing.

### DeepSeek V4 Flash family (V4 Flash, V4 Flash 0731, V4.1 Flash)

| Provider | Model name | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|---|
| OpenRouter EU → Inceptron | deepseek-v4-flash-0731 (fp4) | 0.05 | 0.027 | 0.65 | EU-routed | [P] https://eu.openrouter.ai/api/v1/models |
| Scaleway | deepseek-v4-flash-0731 | €0.40 | €0.08 | €0.80 | EU (Paris) | [P] https://www.scaleway.com/en/pricing/model-as-a-service/ |
| Azure Foundry (Data Zone EU) | DeepSeek-V4-Flash | 0.21 | 0.031 | 0.56 | EU-US | [P] https://prices.azure.com/api/retail/prices (swedencentral); [P] https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability |
| Cortecs (EU router) | DeepSeek V4.1 Flash | €0.18 | ? | €0.539 | depends on upstream | [P] https://cortecs.ai/ |
| DeepInfra | DeepSeek-V4-Flash-0731 | 0.06 | 0.015 | 0.18 | No | [P] https://deepinfra.com/pricing |
| DeepInfra | DeepSeek-V4-Flash | 0.09 | 0.018 | 0.18 | No | [P] https://deepinfra.com/pricing |
| Together AI | DeepSeek V4 Flash 0731 | 0.14 | 0.03 | 0.28 | No | [P] https://www.together.ai/pricing |
| Baseten | DeepSeek-V4-Flash-0731 | 0.13 | 0.028 | 0.26 | No | [P] https://www.baseten.co/pricing |
| Nebius Token Factory | DeepSeek-V4-Flash-0731 | 0.14 | – | 0.28 | No (us-central1) | [P] https://tokenfactory.nebius.com/api/public/models_info |
| Cloudflare Workers AI | deepseek-v4-flash-0731 | 0.44 | 0.014 | 1.32 | No | [P] https://developers.cloudflare.com/workers-ai/platform/pricing/ |
| DeepSeek API | deepseek-flash (V4.1-Flash) | 0.30 (0.15 off-peak) | 0.006 (0.003) | 1.20 (0.60) | No (China) | [P] https://api-docs.deepseek.com/quick_start/pricing |
| Fireworks | DeepSeek V4.1 Flash | 0.30 | 0.006 | 1.20 | No | [P] https://docs.fireworks.ai/serverless/pricing |
| Together AI | DeepSeek V4.1 Flash | 0.30 | 0.006 | 1.20 | No | [P] https://www.together.ai/pricing |
| Baseten | DeepSeek V4.1 Flash | 0.30 | 0.007 | 1.20 | No | [P] https://www.baseten.co/pricing |
| Nebius Token Factory | DeepSeek-V4.1-Flash | 0.30 | – | 1.20 | No (us-north1) | [P] https://tokenfactory.nebius.com/api/public/models_info |

### DeepSeek V4 Pro

| Provider | Model name | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|---|
| Azure Foundry (Global only) | DeepSeek-V4-Pro | 1.74 | 0.145 | 3.48 | No (Data Zone US only) | [P] https://prices.azure.com/api/retail/prices; [P] region table above |
| Nebius Token Factory | DeepSeek-V4-Pro | 1.75 | – | 3.50 | UK (uk-south1) | [P] https://tokenfactory.nebius.com/api/public/models_info |
| DeepInfra | DeepSeek-V4-Pro | 1.30 | 0.10 | 2.60 | No | [P] https://deepinfra.com/pricing |
| DeepSeek API | deepseek-v4-pro (V4-Pro-0813) | 1.32 (0.66 off-peak) | 0.044 (0.022) | 3.96 (1.98) | No (China) | [P] https://api-docs.deepseek.com/quick_start/pricing |
| Together AI | DeepSeek V4 Pro 0813 | 1.32 | 0.13 | 3.96 | No | [P] https://www.together.ai/pricing |
| Baseten | DeepSeek V4 Pro 0813 | 1.32 | 0.132 | 3.96 | No | [P] https://www.baseten.co/pricing |
| Cloudflare Workers AI | deepseek-v4-pro-0813 | 1.32 | 0.044 | 3.96 | No | [P] https://developers.cloudflare.com/workers-ai/platform/pricing/ |
| Bedrock Stockholm (older gen) | DeepSeek V3.2 | 0.74 | – | 2.22 | EU-US | [P] https://aws.amazon.com/bedrock/pricing/ |

No EU-resident shared endpoint for DeepSeek V4 Pro was found. OpenRouter's EU catalogue does not list it [P] https://eu.openrouter.ai/api/v1/models.

### GLM 5.x (Zhipu / Z.ai)

| Provider | Model name | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|---|
| Mistral La Plateforme | GLM 5.3 (hosted by Mistral) | 1.40 | 0.14 | 4.40 | EU (FR) | [P] https://mistral.ai/pricing/api/; cached price from [P] OpenRouter endpoints |
| OpenRouter EU → Inceptron | z-ai/glm-5.3 (fp4) | 0.60 | 0.18 | 3.39 | EU-routed | [P] https://eu.openrouter.ai/api/v1/models |
| OpenRouter EU → Mistral | z-ai/glm-5.3 (nvfp4) | 1.54 | 0.154 | 4.84 | EU-routed | [P] same |
| T-Systems LLM Hub | GLM-5.2 | €1.50 | €0.225 | €3.50 | EU (DE) | [P] https://docs.llmhub.t-systems.net/plans/ |
| T-Systems LLM Hub | GLM-5.3-Flash | €0.20 | €0.03 | €0.60 | EU (DE) | [P] same |
| Scaleway | glm-5.2 | €1.80 | – | €5.50 | EU (FR) | [P] https://www.scaleway.com/en/pricing/model-as-a-service/ |
| Regolo.ai | glm5.2 | €2.00 | – | €5.20 | EU (IT) | [P] https://regolo.ai/pricing/ |
| Berget AI | GLM-5.3-Flash | €0.25 | – | €0.50 | EU (SE) | [P] https://api.berget.ai/v1/models |
| Nebius Token Factory | GLM-5.1 | 1.40 | – | 4.40 | no-guar (eu-north1 FI) | [P] https://tokenfactory.nebius.com/api/public/models_info |
| Nebius Token Factory | GLM-5.3 | 1.40 | – | 4.40 | No (us-north1) | [P] same |
| Bedrock Stockholm | GLM 5 | 1.20 | – | 3.84 | EU-US | [P] https://aws.amazon.com/bedrock/pricing/ |
| Vertex AI MaaS | GLM-5.2 | 1.40 | 0.14 | 4.40 | No (global only) | [P] https://cloud.google.com/vertex-ai/generative-ai/pricing |
| Fireworks | GLM 5.3 | 1.40 | 0.26 | 4.40 | No | [P] https://docs.fireworks.ai/serverless/pricing |
| Fireworks | GLM 5.3 Flash | 0.15 | 0.03 | 0.50 | No | [P] same |
| Together AI | GLM-5.3 / GLM-5.3-Flash | 1.40 / 0.15 | 0.26 / 0.03 | 4.40 / 0.50 | No | [P] https://www.together.ai/pricing |
| Baseten | GLM-5.3 / GLM-5.3-Flash | 1.40 / 0.15 | 0.14 / 0.03 | 4.40 / 0.50 | No | [P] https://www.baseten.co/pricing |
| DeepInfra | GLM-5.3-Flash (50% promo) | 0.075 | 0.015 | 0.25 | No | [P] https://deepinfra.com/blog/glm-5-3-flash-pricing-providers-cost |
| DeepInfra | GLM-5.3 (promo; list 0.90/4.00) | 0.5625 | ? | 2.50 | No | [S] https://aicoder.com/news/news-20260829-deepinfra-glm-5-3-blackwell-zdr-pricing |
| Cloudflare Workers AI | glm-5.3 | 1.40 | 0.26 | 4.40 | No | [P] https://developers.cloudflare.com/workers-ai/platform/pricing/ |
| Z.ai (own API) | GLM-5.3 | 1.40 | 0.26 | 4.40 | No (Singapore) | [P] https://docs.z.ai/guides/overview/pricing |

### Kimi (Moonshot): K3, K2.7 Code, K2.6

| Provider | Model name | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|---|
| OpenRouter EU → Inceptron | kimi-k2.7-code (int4) | 0.67 | 0.18 | 3.35 | EU-routed | [P] https://eu.openrouter.ai/api/v1/models |
| OpenRouter EU → Inceptron | kimi-k2.6 (int4) | 0.43 | 0.12 | 2.45 | EU-routed | [P] same |
| Berget AI | Kimi-K3 | €3.00 | – | €15.00 | EU (SE) | [P] https://api.berget.ai/v1/models |
| Nebius Token Factory | Kimi-K3 | 3.00 | – | 15.00 | no-guar (eu-west2 FR) | [P] https://tokenfactory.nebius.com/api/public/models_info |
| Infomaniak | Kimi-K2.6 | CHF 0.60 | – | CHF 3.00 | CH | [P] https://www.infomaniak.com/en/hosting/ai-services/prices |
| Bedrock Stockholm | Kimi K2.5 | 0.72 | – | 3.60 | EU-US | [P] https://aws.amazon.com/bedrock/pricing/ |
| Bedrock (Global CRIS) | Kimi K3 | 3.00 | 0.30 (+3.75 write) | 15.00 | No | [P] https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-moonshot-ai-kimi-k3.html |
| Azure Foundry (Global only) | Kimi-K2.7-Code | 0.95 | 0.19 | 4.00 | No | [P] https://prices.azure.com/api/retail/prices |
| Fireworks | Kimi K3 | 3.00 | 0.30 | 15.00 | No | [P] https://docs.fireworks.ai/serverless/pricing |
| Together AI | Kimi K3 | 3.00 | 0.30 | 15.00 | No | [P] https://www.together.ai/pricing |
| Baseten | Kimi K3 | 3.00 | 0.30 | 15.00 | No | [P] https://www.baseten.co/pricing |
| DeepInfra | Kimi-K3 / Kimi-K2.6 | 2.85 / 0.75 | 0.285 / 0.15 | 14.25 / 3.50 | No | [P] https://deepinfra.com/pricing |
| Cloudflare Workers AI | kimi-k2.7-code | 0.95 | 0.19 | 4.00 | No | [P] https://developers.cloudflare.com/workers-ai/platform/pricing/ |
| Moonshot (own API) | kimi-k3 / kimi-k2.7-code | 3.00 / 0.95 | 0.30 / 0.19 | 15.00 / 4.00 | No (Singapore) | [P] https://platform.kimi.ai/docs/pricing/chat |

Moonshot bills K3 cache writes ($3.00 for a 5-minute cache, $6.00 for 1 hour) [P] same URL.

### Qwen (coder and Max-class)

| Provider | Model name | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|---|
| IONOS | Qwen3-Coder-Next (80B) | €0.15 | – (no discount) | €0.80 | EU (DE) | [P] https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de |
| Scaleway | qwen3-coder-30b-a3b-instruct | €0.20 | – | €0.80 | EU (FR) | [P] https://www.scaleway.com/en/pricing/model-as-a-service/ |
| Scaleway | qwen3.8-27b | €0.60 | €0.12 | €3.30 | EU (FR) | [P] same |
| OVHcloud | Qwen3.8-27B | €0.40 | – | €2.70 | EU (FR) | [P] https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/ |
| T-Systems | Qwen3.8-27B-FP8 | €0.50 | €0.075 | €2.50 | EU (DE) | [P] https://docs.llmhub.t-systems.net/plans/ |
| STACKIT | Qwen3.8 27B (Plus tier) | €0.45 | – | €0.65 | EU (DE) | [P] https://stackit.com/en/products/data-ai/stackit-ai-model-serving |
| Bedrock Stockholm | Qwen3 Coder 480B A35B | 0.45 | – | 1.80 | EU-US | [P] https://aws.amazon.com/bedrock/pricing/ |
| Bedrock Frankfurt etc. | Qwen3 Coder Next | 0.60 | – | 1.44 | EU-US (card lists only London; verify) | [P] https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/bedrock/USD/current/bedrock.json |
| Alibaba Model Studio, Frankfurt "EU" scope | qwen3-coder-next | 0.30 (≤32K) | ~20% of input (implicit) | 1.50 | EU (Chinese parent) | [P] https://www.alibabacloud.com/help/en/model-studio/model-pricing |
| Alibaba Model Studio, Frankfurt "Global" scope | qwen3-coder-plus / qwen3.8-max | 0.574+ / 1.65 | ~20% | 2.294+ / 4.951 | No (Global pool) | [P] same |
| DeepInfra | Qwen3-Coder-480B-A35B-Instruct-Turbo | 0.30 | 0.10 | 1.00 | No | [P] https://deepinfra.com/pricing |
| DeepInfra | Qwen3.8-Max | 1.65 | 0.206 | 4.951 | No | [P] same |
| Fireworks | Qwen 3.8 Max | 2.00 | 0.25 | 6.00 | No | [P] https://docs.fireworks.ai/serverless/pricing |
| Together AI | Qwen3.8-2.4T-A95B / Qwen3.7-Max | 2.00 / 1.50 | 0.25 / 0.30 | 6.00 / 4.50 | No | [P] https://www.together.ai/pricing |
| Vertex AI MaaS | qwen3-coder-480b-a35b-instruct | 0.22 | 0.022 | 1.80 | No (global) | [P] https://cloud.google.com/vertex-ai/generative-ai/pricing |
| OpenRouter (global) | qwen/qwen3-coder-next | 0.12 | 0.07 | 0.80 | No | [P] https://openrouter.ai/api/v1/models |

### gpt-oss-120b

| Provider | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|
| OVHcloud | €0.08 | – | €0.40 | EU (FR) | [P] https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/ |
| T-Systems | €0.20 | €0.03 | €0.65 | EU (DE) | [P] https://docs.llmhub.t-systems.net/plans/ |
| Scaleway | €0.15 | – | €0.60 | EU (FR) | [P] https://www.scaleway.com/en/pricing/model-as-a-service/ |
| IONOS | €0.15 | – (no discount) | €0.65 | EU (DE) | [P] https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de |
| STACKIT | €0.45 | – | €0.65 | EU (DE) | [P] https://stackit.com/en/products/data-ai/stackit-ai-model-serving |
| Regolo.ai | €1.00 | – | €4.20 | EU (IT) | [P] https://regolo.ai/pricing/ |
| Bedrock Stockholm / Ireland / Frankfurt | 0.15 / 0.18 / 0.20 | – | 0.60 / 0.70 / 0.79 | EU-US | [P] https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/bedrock/USD/current/bedrock.json |
| OpenRouter EU → Bedrock eu-west-1 | 0.15 | – | 0.60 | EU-routed | [P] https://eu.openrouter.ai/api/v1/models |
| Nebius Token Factory | 0.15 | – | 0.60 | no-guar (eu-north1 FI) | [P] https://tokenfactory.nebius.com/api/public/models_info |
| Azure Foundry (Preview) | 0.165 (DZ) / 0.15 (Global) | – | 0.66 / 0.60 | unconfirmed | [P] https://prices.azure.com/api/retail/prices |
| DeepInfra | 0.037 | – | 0.17 | No | [P] https://deepinfra.com/openai/gpt-oss-120b |
| Vertex AI MaaS | 0.09 | – | 0.36 | No (global) | [P] https://cloud.google.com/vertex-ai/generative-ai/pricing |
| Baseten | 0.10 | – | 0.50 | No | [P] https://www.baseten.co/pricing |
| Fireworks | 0.15 | 0.015 | 0.60 | No | [P] https://docs.fireworks.ai/serverless/pricing |
| Together AI | 0.15 | – | 0.60 | No | [P] https://www.together.ai/pricing |
| Groq | 0.15 | 0.075 | 0.60 | No | [P] https://console.groq.com/docs/models |
| SambaNova | 0.22 | – | 0.59 | No | [P] https://cloud.sambanova.ai/plans/pricing |
| Cerebras | 0.35 | ? | 0.75 | No | [S] https://www.morphllm.com/cerebras-pricing |
| Cloudflare Workers AI | 0.35 | – | 0.75 | No | [P] https://developers.cloudflare.com/workers-ai/platform/pricing/ |

### MiniMax M3 / M2.x

| Provider | Model name | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|---|
| Bedrock Frankfurt / Stockholm | MiniMax M2.5 | 0.36 | – | 1.44 | EU-US | [P] https://aws.amazon.com/bedrock/pricing/ |
| MiniMax (own API) | MiniMax-M3 (≤512K input) | 0.30 | 0.06 | 1.20 | No (US storage) | [P] https://platform.minimax.io/docs/guides/pricing-paygo.md |
| Fireworks | MiniMax M3 | 0.30 | 0.06 | 1.20 | No | [P] https://docs.fireworks.ai/serverless/pricing |
| Together AI | MiniMax M3 | 0.30 | 0.06 | 1.20 | No | [P] https://www.together.ai/pricing |
| DeepInfra | MiniMax-M3 | 0.28 | ? | 1.10 | No | [S] https://aicoder.com/news/news-20260829-deepinfra-glm-5-3-blackwell-zdr-pricing |
| SambaNova | MiniMax-M3 | 0.60 | 0.06 | 2.40 | No | [P] https://cloud.sambanova.ai/plans/pricing |
| Nebius Token Factory | MiniMax-M3 | 0.30 | – | 1.20 | No (us-central1) | [P] https://tokenfactory.nebius.com/api/public/models_info |

No EU-resident shared endpoint for MiniMax M3 was found.

### Mistral coding models (Devstral, Codestral, Medium 3.5)

| Provider | Model name | In | Cached | Out | EU | Source |
|---|---|---|---|---|---|---|
| Mistral La Plateforme | Codestral (codestral-2508) | 0.30 | 0.03 | 0.90 | EU (FR) | [P] https://mistral.ai/pricing/api/ |
| Mistral La Plateforme | Mistral Medium 3.5 (mistral-medium-3504) | 1.50 | not listed | 7.50 | EU (FR) | [P] same |
| Mistral La Plateforme | Devstral 2 (devstral-2512), retired 2026-07-31 | 0.40 | 0.04 | 2.00 | EU (FR) | [P] https://openrouter.ai/api/v1/models/mistralai/devstral-2512/endpoints; retirement [P] https://docs.mistral.ai/getting-started/models/models_overview/ |
| Bedrock Frankfurt etc. | Devstral 2 123B | 0.48 | – | 2.40 | EU-US | [P] https://aws.amazon.com/bedrock/pricing/ |
| Scaleway | devstral-2-123b-instruct-2512 | price not shown | – | – | EU (FR) | [P] https://www.scaleway.com/en/docs/generative-apis/reference-content/supported-models/ |
| Scaleway | mistral-medium-3.5-128b | €1.50 | – | €7.50 | EU (FR) | [P] https://www.scaleway.com/en/pricing/model-as-a-service/ |
| OpenRouter EU → Mistral | mistral-medium-3-5 / codestral-2508 | 1.65 / 0.33 | – / 0.033 | 8.25 / 0.99 | EU-routed | [P] https://eu.openrouter.ai/api/v1/models |

None of the US serverless providers (Fireworks, Together, DeepInfra, Groq, Cerebras, Baseten, SambaNova) lists Devstral.

## Verdict

- **Cheapest EU-resident option for this workload: DeepSeek V4 Flash 0731 through OpenRouter's EU endpoint, served by Inceptron, at about $0.03 per Run** (OpenRouter Business plan required). If the chain must be EU-owned end to end with a direct DPA, the choices are:
  - Scaleway `deepseek-v4-flash-0731` at €0.088 per Run, with zero retention by default and Paris hosting.
  - T-Systems GLM-5.3-Flash or gpt-oss-120b at about €0.045 per Run. This only pays off above the €1,000/month minimum, which Glide will not reach in phase 1.
  - OVHcloud gpt-oss-120b at €0.048 per Run.

  For a stronger coding model, the EU choice is GLM 5.3 from Mistral at $0.28 per Run, or the same model via OpenRouter EU → Inceptron at $0.22.
- **Cheapest overall:** DeepInfra DeepSeek-V4-Flash-0731 at about $0.016 per Run. DeepSeek's own API off-peak ($0.028) and Fireworks gpt-oss-120b ($0.033) follow. None of these can carry an EU-residency promise.
- **Unsafe for client source code:**
  - **DeepSeek API.** Data is stored in the PRC under PRC law, inputs are used for training unless you opt out by email, and there is no DPA [P] https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html, [P] https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html.
  - **bigmodel.cn** (Zhipu, mainland China).
  - **Moonshot / Kimi platform.** Singapore servers, and the policy does not clearly exclude training on API content.
  - **MiniMax API.** US storage, and only a narrow no-training statement.
  - **Z.ai's own API** has better written terms (no storage, Singapore processing), but the parent company is in China and there are no EU servers. Use GLM through Mistral or Inceptron instead.
  - **Alibaba "Global" scope.**
- **Cannot promise EU processing on their shared API:** Fireworks (residency only "None" or "US", Enterprise only), Together (EU only on dedicated endpoints), DeepInfra, Groq, Cerebras, Baseten, SambaNova, Vertex AI MaaS (global endpoint only), Cloudflare Workers AI. They are fine for Glide's own repositories and for clients who accept a transfer under standard contractual clauses (SCCs). They are not fine for an "EU-only" promise.
- **Nebius Token Factory needs care.** It is a Dutch entity, but public endpoints have no region guarantee and the sub-processors include US GPU resellers. Only a dedicated endpoint is EU-bound by contract.

For a GDPR promise to EU agencies, the practical shape is a primary EU provider with a DPA that Glide signs directly (Mistral, Scaleway, IONOS or T-Systems), plus OpenRouter EU as a cheap secondary route. Price that route only after the Inceptron DPA has been read. US-owned EU regions (Bedrock, Azure Data Zone EU) satisfy residency, but they leave US CLOUD Act exposure, which some agencies will ask about.

## Per-provider notes

### US serverless providers

**Fireworks AI (baseline).**
- **Prices:** [P] https://docs.fireworks.ai/serverless/pricing. A Priority tier costs about 25% more, and "(US)" variants about 50% more.
- **Caching:** about 90% off (GLM about 81%).
- **Residency:** only "None" (unrestricted, the default) or "US"; this is Enterprise-only, and other regions go through sales [P] https://docs.fireworks.ai/accounts/data-residency.
- **Retention:** zero retention by default for open models. The Responses API stores data for 30 days when `store=True`, which is the default [P] https://docs.fireworks.ai/guides/security_compliance/data_handling.
- **DPA:** [P] https://fireworks.ai/dpa.
- **Certifications:** SOC 2 Type II and HIPAA [P] https://docs.fireworks.ai/faq/enterprise/compliance/certifications. ISO 27001/27701/42001 appear only in a Trust Center search snippet [S].
- **Rate limits:** 10 RPM without a payment method, up to 6,000 RPM with one [P] https://docs.fireworks.ai/guides/quotas_usage/rate-limits. The token ceiling adapts with use [P] https://docs.fireworks.ai/serverless/rate-limits.

**Together AI.**
- **Prices:** [P] https://www.together.ai/pricing. Caching is 80–98% off.
- **Retention:** prompts and responses are stored by default until an org admin enables zero retention; training is opt-in [P] https://docs.together.ai/docs/privacy-and-security, [P] https://docs.together.ai/docs/zero-data-retention.
- **Residency:** EU data centres are available only for dedicated endpoints on the Scale or Enterprise plans [P] https://support.together.ai/articles/8079447813-eu-data-centers-and-dedicated-model-deployment. A Sweden data centre serves serverless traffic, but you cannot pin to it [P] https://www.prnewswire.com/news-releases/together-ai-continues-european-expansion-infrastructure-now-live-and-operational-in-sweden-302545683.html.
- **Certifications:** SOC 2 Type 2 [P] https://www.together.ai/blog/soc-2-compliance. ISO 27001 and a DPA are listed on https://trust.together.ai (read via snippet).
- **Rate limits:** dynamic, with no fixed published figure [P] https://docs.together.ai/docs/rate-limits.

**DeepInfra.**
- **Pricing:** the lowest prices on most models [P] https://deepinfra.com/pricing.
- **Caching:** 50–90% off.
- **Location:** eight US data centres plus Toronto, with no EU region [S] https://www.globenewswire.com/news-release/2026/09/29/3370896/0/en/deepinfra-surpasses-100m-arr-triples-token-volume.html.
- **Retention:** inputs are not written to disk and not used for training [P] https://docs.deepinfra.com/account/data-privacy.
- **DPA:** a signed DPA overrides the privacy policy, but there is no self-serve link [P] https://deepinfra.com/terms.
- **Certifications:** SOC 2 and ISO 27001 are claimed [P] https://trust.deepinfra.com/compliance (the fetch was blocked, so this comes from a snippet).
- **Rate limits:** 200 concurrent requests per model [P] https://deepinfra.com/docs/advanced/rate-limits.

**Groq.**
- **Models and caching:** only gpt-oss and small Qwen/MiniMax previews are relevant [P] https://console.groq.com/docs/models. Caching is 50% off and applies to gpt-oss only [P] https://console.groq.com/docs/prompt-caching.
- **Location:** there are Helsinki and UK data centres [P] https://groq.com/newsroom/groq-launches-european-data-center-footprint-in-helsinki-finland, but any data Groq retains sits in US GCP buckets [P] https://console.groq.com/docs/your-data.
- **DPA:** includes SCCs and allows processing in the US [P] https://console.groq.com/docs/legal/customer-data-processing-addendum.
- **Rate limits:** gpt-oss-120b at 30 RPM and 8K TPM on the listed tier [P] https://console.groq.com/docs/rate-limits.

**Cerebras.**
- **Models and prices:** only gpt-oss-120b and qwen-3.8-27b are offered [P] https://inference-docs.cerebras.ai/models/overview. Prices are known only from secondary sources.
- **Location:** US-only today. EU capacity (France, Norway, Finland) is targeted for the end of 2026 [S] https://www.euronews.com/business/2026/07/09/cerebras-targets-europe-with-multibillion-dollar-ai-expansion-challenging-nvidia.
- **Retention:** prompts are not retained [P] https://support.cerebras.net/articles/1811589793-does-cerebras-retain-my-data.
- **DPA:** no public DPA.
- **Rate limits:** [P] https://inference-docs.cerebras.ai/support/rate-limits.

**Baseten.**
- **Prices:** [P] https://www.baseten.co/pricing. Caching is about 90% off.
- **Residency:** "region-locking" exists, but the regions are not named, and other countries go through sales [P] https://www.baseten.co/security-practices/.
- **Retention:** no persistent copies and no training.
- **DPA:** [P] https://www.baseten.co/dpa.
- **Certifications:** SOC 2 Type II and HIPAA.
- **Rate limits:** 120 RPM / 1M TPM on Pro [P] https://docs.baseten.co/development/model-apis/rate-limits-and-budgets.

**SambaNova.**
- **Prices:** [P] https://cloud.sambanova.ai/plans/pricing. Caching applies only to MiniMax.
- **Location:** inference runs in the US. EU service comes only through the separate partner Infercom (Munich) [P] https://sambanova.ai/solutions/infercom.
- **Certifications:** ISO 27001:2022 and SOC 2 per https://trust.sambanova.ai (from a snippet; sources conflict).
- **Rate limits:** Developer tier 60 RPM and 20M tokens/day [P] https://docs.sambanova.ai/docs/en/models/rate-limits.

### EU-owned providers

**Nebius Token Factory (formerly AI Studio; Nebius B.V., Netherlands).**
- **Prices:** in USD [P] https://tokenfactory.nebius.com/api/public/models_info. Most new models run in US regions; Kimi K3 is in France, and GLM-5.1, gpt-oss-120b and Qwen3-235B are in Finland.
- **Residency:** public endpoints have no region guarantee, and their location "can change at any time without prior notice". Dedicated endpoints stay in the chosen region [P] https://docs.tokenfactory.nebius.com/legal/legal-quick-guide.
- **Sub-processors:** US entities and GPU resellers (RunPod, Shadeform, BoostRun, Axe Compute) [P] https://docs.nebius.com/legal/sub-processors_tofa.
- **Retention:** inputs are stored by default for speculative decoding; organisation-wide zero retention is available, and there is never training.
- **DPA:** includes SCCs [P] https://docs.nebius.com/legal/dpa.
- **Certifications:** ISO 27001/27701 and SOC 2 Type II.
- **Caching:** unconfirmed; a feature request is open [P] https://ideas.nebius.com/p/support-impliciteexplicite-prompt-caching.
- **Rate limits:** 60 RPM / 400K TPM base, scaling automatically [P] https://docs.tokenfactory.nebius.com/ai-models-inference/rate-limits.md.

**Scaleway Generative APIs (Paris).**
- **Prices:** € excluding tax; the first 1M tokens are free [P] https://www.scaleway.com/en/pricing/model-as-a-service/.
- **Caching:** automatic and isolated per project; about 80% off, on 2 models only.
- **Retention:** zero by default and no training. Request content may be kept for up to 2 weeks on misuse or HTTP 500 errors. Scaleway says it is not subject to the CLOUD Act [P] https://www.scaleway.com/en/docs/generative-apis/reference-content/data-privacy/.
- **Certifications:** ISO 27001/27017/27018, SOC 2 Type II and HDS (French health-data hosting); SecNumCloud is in progress [S] https://eurocomply.app/vendors/scaleway.
- **Rate limits:** example headers show 600 RPM / 1M TPM [P] https://www.scaleway.com/en/docs/generative-apis/reference-content/rate-limits/.
- **Preview limits:** GLM 5.2 and V4 Flash are capped at 256K context.

**OVHcloud AI Endpoints (Gravelines, France).**
- **Catalogue:** € prices; no DeepSeek, GLM, Kimi or MiniMax; Qwen3-Coder-30B has been removed [P] https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/.
- **Retention:** no storage and no training [P] https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities.
- **Caching:** not documented. Batch is 50% off.
- **Rate limits:** 400 RPM per project per model.
- **DPA:** [P] https://storage.gra.cloud.ovh.net/v1/AUTH_325716a587c64897acbef9a4a4726e38/contracts/12f0d70-OVH_Data_Protection_Agreement-IE-7.0.pdf.
- **Certifications:** ISO 27001, HDS and SOC 2; SecNumCloud does not cover AI Endpoints [S] https://infercheck.eu/en/provider/ovhcloud-ai-endpoints.

**IONOS AI Model Hub (Germany).**
- **Prices:** € net, business customers only [P] https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de.
- **Caching:** applied automatically, but **not discounted** [P] https://docs.ionos.com/cloud/ai/ai-model-hub/faqs.md.
- **Data handling:** the strongest written terms found. Inference runs only in German data centres, nothing is logged, there are no third-party sub-processors, only EU staff have access, and the service is in BSI C5 scope (German government cloud standard) [P] https://docs.ionos.com/cloud/ai/ai-model-hub/governance-and-compliance/data-handling.md.
- **Rate limits:** 5 requests per second, burst 10 [P] https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/rate-limits.md.

**STACKIT AI Model Serving (Germany).**
- **Models and prices:** € price tiers; the only coding-capable models are gpt-oss-120b and Qwen3.8-27B [P] https://stackit.com/en/products/data-ai/stackit-ai-model-serving.
- **Rate limits:** low: gpt-oss-120b at 30 RPM / 200K TPM, with output tokens counted ×5 [P] https://docs.stackit.cloud/products/data-and-ai/ai-model-serving/basics/available-shared-models/.
- **Retention:** no storage and no training.
- **Certifications:** C5 and ISO 27001.

**T-Systems AI Foundation Services / LLM Hub (Germany).**
- **Prices:** € with about 85% off cached input, and the server location "Germany" stated per model [P] https://docs.llmhub.t-systems.net/plans/.
- **Minimum spend:** €1,000/€3,000/€5,000 per month.
- **Watch out:** the hub also resells Azure- and GCP-hosted "External" models. Choose only T-Cloud-hosted ones.

**Regolo.ai (Seeweb, Italy).**
- **Prices:** € excluding VAT, from €39/month plans; per-token prices are high (gpt-oss-120b €1.00/€4.20) [P] https://regolo.ai/pricing/.
- **Retention:** zero by design [P] https://regolo.ai/zero-data-retention-llms-why-it-matters/.
- **Certifications:** ISO 27001/27017/27018 and ACN qualification (Italy's national cybersecurity agency).
- **DPA:** in the terms [P] https://regolo.ai/terms-and-conditions/.

**Berget AI (Sweden).**
- **Prices:** € excluding VAT; plans from €25/month [P] https://berget.ai/pricing, per-model prices [P] https://api.berget.ai/v1/models. No cache pricing.
- **Retention:** no prompt or output storage [P] https://berget.ai/en/terms.
- **Certifications:** not yet ISO 27001 certified.

**Mistral La Plateforme (France).**
- **Models:** all Devstral models are deprecated. Devstral 2 was retired on 2026-07-31, and Mistral points to Medium 3.5 instead [P] https://docs.mistral.ai/getting-started/models/models_overview/. Mistral also hosts GLM 5.3.
- **Caching and batch:** cached input up to 90% off; batch 50% off [P] https://mistral.ai/pricing.
- **Zero retention:** granted on request, at Mistral's discretion [P] https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr.
- **Training:** the training opt-out must be switched off explicitly in the admin console [P] https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training.
- **DPA:** French law, with SCCs [P] https://legal.mistral.ai/terms/data-processing-addendum.
- **Certifications:** SOC 2 Type II and ISO 27001/27701 [P] https://help.mistral.ai/en/articles/347638-do-you-have-soc-2-or-iso-27001-certification.
- **Rate limits:** tiers rise automatically with spend [P] https://docs.mistral.ai/deployment/ai-studio/tier.

**Hetzner.**
- **No managed LLM product.** A free experimental API ran in August 2026 and has since been cut back to small models, with no SLA [P] https://www.hetzner.com/blog/inference-experiment/.
- **GPU servers:** the GEX131 (96 GB RTX PRO 6000) is about €889/month [S] https://bex.co/blog/2026/08/08/hetzner-llm-inference-self-hosted-ai-stack. That is enough for gpt-oss-120b, but not for DeepSeek, Kimi or GLM-5, and it is far above serverless cost at this volume.

**Infomaniak (Switzerland, CHF).**
- **Models and location:** Kimi-K2.6 and Qwen3.5 [P] https://www.infomaniak.com/en/hosting/ai-services/prices. Hosting is Swiss, which is covered by an EU adequacy decision.
- **Retention:** no storage and no training [P] https://www.infomaniak.com/en/hosting/ai-services.

**Cortecs.ai (Vienna).** An EU router with a 5% top-up fee [P] https://cortecs.ai/ and a DPA [P] https://cortecs.ai/dpa. Its upstream providers include US hyperscalers' EU regions.

### Routers and model-maker APIs

**OpenRouter (US, New York).**
- **Fees:** model prices pass through, plus a fee on credit purchases of 5.5% (Standard) or 8% (Business) [P] https://openrouter.ai/pricing.
- **EU in-region routing (`eu.openrouter.ai`):** Business and Enterprise only. The request is decrypted only in the EU and routed only to EU endpoints. It cannot use the Batch API or web tools [P] https://openrouter.ai/docs/guides/features/in-region-routing.
- **Zero retention:** routing can be enforced per account or per request (`"provider": {"zdr": true}`) [P] https://openrouter.ai/docs/guides/features/zdr. The live list of qualifying endpoints is [P] https://openrouter.ai/api/v1/endpoints/zdr.
- **Logging and training:** no prompt logging by default; training is opt-in [P] https://openrouter.ai/docs/guides/privacy/data-collection.
- **DPA:** by reference on Standard, signed on Business [P] https://openrouter.ai/terms.
- **Inceptron AB (Lund):** the main EU backend. Its Finnish hosting, zero retention and DPA are confirmed only by [S] https://opper.ai/provider/inceptron.
- **Watch out:** headline prices on `/api/v1/models` show the cheapest endpoint. Budget from the per-endpoint prices.

**DeepSeek API.** Off-peak half price applies outside 01:00–04:00 and 06:00–10:00 UTC on weekdays [P] https://api-docs.deepseek.com/quick_start/pricing. Data is stored in China, and see the verdict for the training and DPA terms. Italy's Garante (data protection authority) ordered an emergency block in January 2025. In May 2025 the Berlin data protection authority asked DeepSeek to stop transfers to China [S] https://ai-regulation.com/deepseek-one-year-later-regulatory-storm-global-surge/.

**Z.ai.**
- **Prices:** [P] https://docs.z.ai/guides/overview/pricing.
- **Entity and processing:** the contracting entity is in Singapore, processing is "generally" in Singapore, and the policy says content is not stored [P] https://docs.z.ai/legal-agreement/privacy-policy.
- **bigmodel.cn:** the mainland-China service, priced in CNY [P] https://docs.bigmodel.cn/cn/guide/start/pricing.

**Moonshot (platform.kimi.ai).**
- **Prices:** [P] https://platform.kimi.ai/docs/pricing/chat.
- **Entity and terms:** the contracting entity and servers are in Singapore. Retention is "as long as necessary", and the policy says content helps "optimize our models" [P] https://platform.kimi.ai/docs/agreement/userprivacy.

**MiniMax.**
- **Prices:** [P] https://platform.minimax.io/docs/guides/pricing-paygo.md. Priority costs 1.5×.
- **Entity and storage:** the controller is in Singapore and data is stored in the US. The policy has no general no-training commitment [P] https://platform.minimax.io/docs/guides/privacy-policy.md.

**Alibaba Model Studio.**
- **Frankfurt region:** launched March 2026 [P] https://www.alibabacloud.com/en/notice/model_studio_frankfurt_region_now_available_700.
- **Scope:** each workspace picks "EU" or "Global" scope [P] https://www.alibabacloud.com/help/en/model-studio/regions. Only some models, such as qwen3-coder-next and qwen3-max, are offered in EU scope.
- **Cache pricing:** implicit cache hits are billed at about 20% of the input price, explicit hits at 10% plus a 125% creation charge [P] https://www.alibabacloud.com/help/en/model-studio/context-cache.
- **Training:** none [P] https://www.alibabacloud.com/help/en/model-studio/privacy-notice. The parent company is Chinese.

### Hyperscalers

**Amazon Bedrock.**
- **EU models:** the widest EU in-region open-weight catalogue. Frankfurt, Stockholm, Milan and Ireland serve gpt-oss-120b, Devstral 2, MiniMax M2.5 and Qwen3-Coder-30B. Stockholm alone adds DeepSeek V3.2, Qwen3 Coder 480B, Kimi K2.5 and GLM 5. Kimi K3 has no EU path [P] https://aws.amazon.com/bedrock/pricing/, [P] https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html.
- **EU price uplift:** EU prices run 0–33% above US prices.
- **Caching:** no published cache price for any EU open-weight model [P] https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html. This is why Bedrock Runs cost 3–5× DeepInfra's.
- **Data protection:** content is not shared with model makers and not used for training [P] https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html. The standard AWS GDPR DPA applies.
- **Quotas:** documented as 10,000 RPM / 100M TPM per region, though applied defaults for new accounts may be lower [P] https://docs.aws.amazon.com/general/latest/gr/bedrock.html.
- **European Sovereign Cloud:** offers only Gemma 4 [P] https://aws.amazon.com/blogs/security/run-open-weight-models-on-aws-bedrock-in-aws-european-sovereign-cloud/.

**Azure AI Foundry.**
- **EU models:** Data Zone EU covers only DeepSeek-V4-Flash, Mistral-Large-3 and mistral-medium-3-5 [P] https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability.
- **Fireworks on Foundry:** excluded from the EU Data Boundary [P] https://learn.microsoft.com/en-us/azure/foundry/how-to/fireworks/enable-fireworks-models.
- **Quotas:** 400K TPM / 1,000 RPM by default [P] https://learn.microsoft.com/en-us/azure/foundry/foundry-models/quotas-limits.
- **Training:** none [P] https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy.
- **DPA:** [P] https://aka.ms/DPA.

**Google Vertex AI Model Garden (managed API).** None of the open models is available in EU regions. They run on the global endpoint, which "doesn't support data residency requirements" [P] https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations.

**Cloudflare Workers AI.** Not compatible with Regional Services, so inference cannot be pinned to the EU [P] https://developers.cloudflare.com/data-localization/compatibility/.

## Gaps

- **Inceptron** (OpenRouter's EU backend): location, DPA and retention are confirmed only by a secondary source. Read its DPA before relying on the cheapest EU route.
- **OpenRouter:** the Business plan's monthly price, the DPA text and the SCC modules were not found.
- **DPAs not read:**
  - No direct DPA links were fetched for Scaleway, IONOS, Berget, STACKIT or T-Systems.
  - DPA text was read in detail only for Groq, Baseten, Nebius and Mistral.
  - A legal reading of the DPAs and transfer terms is still needed before the GDPR promise is written down.
- **Cache pricing unknown or absent:**
  - Nebius (conflicting sources), OVHcloud, Regolo, Berget, STACKIT, Infomaniak and Bedrock (all models except Kimi K3).
  - Mistral Medium 3.5's cache price is not listed; the cost row assumes −90%.
- **Missing prices:**
  - Scaleway Devstral 2 and Groq MiniMax M2.7.
  - Cerebras prices come only from secondary sources.
  - VAT treatment at OVHcloud and STACKIT is not stated.
- **Conflicting availability:**
  - Bedrock Qwen3 Coder Next: the card lists London only, while the pricing feed prices Frankfurt, Ireland and Milan.
  - Azure gpt-oss-120b and Kimi: EU Data Zone status is unconfirmed.
  - Groq: whether an EU endpoint exists is unclear.
  - Mistral Devstral 2: retired, but still listed on OpenRouter.
- **Certification claims from snippets only:** Fireworks ISO, Together ISO/DPA, DeepInfra trust centre, and SambaNova SOC 2 (sources conflict).
- **No EU-resident shared endpoint found** for DeepSeek V4 Pro, DeepSeek V4.1 Flash, Kimi K3 with caching, MiniMax M3 or Qwen3.8 Max.
- **Model quality is not compared here.** This file covers price and data handling only. Which model succeeds on Glide's Shifts needs Glide's own evaluation.
- **US CLOUD Act exposure** of US-owned EU regions (AWS, Azure, OpenRouter) needs a separate legal assessment.
