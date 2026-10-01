# Frontier coding models: prices, EU residency, benchmarks and cost per Run (as of 1 October 2026)

Method note: unlike the 29 September cost-base file, the primary vendor pages could be fetched this time. Every figure has a source link. **[P]** marks a primary vendor page (Anthropic, AWS, Google, OpenAI, Microsoft). **[S]** marks a secondary source (aggregator, benchmark site, press). Prices are in USD per million tokens (MTok) unless stated otherwise. Money uses the nl-NL format with a decimal comma. No USD to EUR conversion is applied. The LiteLLM price map was read on 1 October 2026 at commit `2b19ddb7a3` (04:59 UTC).

## Takeaway

For Glide's Run shape (0.5M input tokens, 80% of them cached, plus 20K output tokens), the cost per Run at global prices runs from $0,03 (GPT-6 Luna) to $2,35 (Claude Fable 5.1). The two $2/$10 mid-tier models cost about the same: Claude Sonnet 5.5 at $0,53 and GPT-6.1 Sol at $0,49. Sonnet 5.5 scores higher on agentic coding benchmarks (Terminal-Bench 4.0: 64,1% against 55,1% on the independent Vals run). GPT-6.1 Sol is cheaper per solved task on that same run ($3,13 against $25,74), because it used far fewer tokens per task. EU residency costs 10% extra on Bedrock EU, Vertex AI EU and OpenAI's EU endpoint. It costs 20% extra on the Azure EU Data Zone. The direct Anthropic API still has no EU option: its only geographies are `us` and `global`. Claude Fable 5.1 has no EU inference profile on Bedrock, so its only EU route is Vertex AI. The newest Google model is **Gemini 4 Argon**, announced 30 September 2026. It has no public API model ID yet and is limited to Google's Fairwind cyber-defender program. The newest Google model you can actually call is **Gemini 3.8 Flash** (`gemini-3.8-flash`, GA 2 September 2026). Its promotional price ends 31 December 2026, and the price doubles on 1 January 2027.

## 1. Price table (global endpoints, per MTok, standard tier)

| Model | Released | Input | Cache write (5 min) | Cache read | Output | Long context | Batch | Source |
|---|---|---|---|---|---|---|---|---|
| Claude Sonnet 5.5 | 28 Sep 2026 | $2,00 | $2,50 (1 h: $4,00) | $0,20 | $10,00 | Standard rate across the full 1M window | 50% off ($1,00 / $5,00) | [P][a-price], date [P][aws-sonnet] |
| Claude Opus 5.5 | 22 Sep 2026 | $4,00 | $5,00 (1 h: $8,00) | $0,20 (0,05x) | $20,00 | Standard rate across the full 1M window | 50% off ($2,00 / $10,00) | [P][a-price], date [P][a-opus] |
| Claude Fable 5.1 | 1 Sep 2026 | $10,00 | $12,50 (1 h: $20,00) | $0,25 (0,025x) | $50,00 | Standard rate across the full 1M window | 50% off ($5,00 / $25,00) | [P][a-price], date [P][aws-fable] |
| Claude Haiku 4.5 | 15 Oct 2025 | $1,00 | $1,25 (1 h: $2,00) | $0,10 | $5,00 | 200K window | 50% off ($0,50 / $2,50) | [P][a-price], retirement [P][a-depr] |
| GPT-6.1 Sol | 29 Sep 2026 | $2,00 | $2,50 | $0,10 | $10,00 | >272K input: 2x input and cache, 1,5x output for the whole request | Batch and Flex 50% off | [P][o-price], [P][o-61sol], date [P][ms-61sol] |
| GPT-6 Sol | 22 Sep 2026 | $2,00 | $2,50 | $0,20 | $10,00 | Same 272K rule | Batch and Flex 50% off | [P][o-6sol], date [P][ms-6] |
| GPT-6 Luna | 22 Sep 2026 | $0,10 | $0,125 | $0,01 | $0,50 | Same 272K rule | Batch and Flex 50% off | [P][o-price], [P][o-luna] |
| Gemini 3.8 Flash, promo until 31 Dec 2026 | 2 Sep 2026 | $0,75 | none (implicit caching); explicit cache storage $0,50 per MTok-hour | $0,075 | $3,75 | Same rate above 200K | 50% off ($0,375 / $1,875) | [P][g-price], [P][g-38blog] |
| Gemini 3.8 Flash, from 1 Jan 2027 | | $1,50 | storage $1,00 per MTok-hour | $0,15 | $7,50 | Same rate above 200K | 50% off | [P][g-price] |
| Gemini 4 Argon, introductory (not callable) | announced 30 Sep 2026 | $2,00 | not published | 95% off input ($0,10) | $10,00 | not published | not published | [P][g-argon] |
| Gemini 4 Argon, after the introductory period | no date given | $4,00 | not published | $0,20 (derived from "95% off") | $20,00 | not published | not published | [P][g-argon] |

Notes:
- Claude 4.7 and later models use a new tokenizer that produces about 30% more tokens for the same text. The same repository therefore costs more tokens on Claude than these per-token prices suggest [P][a-price].
- Anthropic also offers a fast mode for Opus 5.5 at $8 / $40, on the first-party API only [P][a-price].
- On OpenAI, "Priority processing was renamed Fast mode on July 30, 2026". Fast mode for GPT-6.1 Sol costs $4 / $20 [P][o-price].
- GPT-6.1 Sol supports tool calling only through the Responses API ("Chat Completions is supported without tool calling") [P][o-61sol]. GPT-6 Sol and Luna allow function calling on Chat Completions only with `reasoning_effort: none` [P][o-6sol], [P][o-luna].
- Gemini 4 Argon is "rolling out to a set of trusted cyber defenders through our Fairwind Program". Paid API customers come next, with no date given [P][g-argon]. Secondary reports confirm there is no published model ID or Vertex AI row as of 1 October 2026 [S][tokencost-argon].
- Haiku 4.5 is near retirement. The Claude API lists it as "Not sooner than October 15, 2026" [P][a-depr]. Bedrock lists "EOL no sooner than: Oct 16, 2026" [P][aws-haiku], and Vertex AI lists "Retirement date not sooner than: October 15, 2026" [P][v-haiku].

## 2. EU residency

| Model | Direct vendor API | AWS Bedrock EU | Google Vertex AI EU | Azure / Microsoft Foundry EU | Premium |
|---|---|---|---|---|---|
| Claude Sonnet 5.5 | No. `inference_geo` accepts only `us` and `global`; workspace geo is `us` only [P][a-resid] | Yes, `eu.anthropic.claude-sonnet-5-5` ("Keeps data within EU regions") [P][aws-sonnet] | Yes, `eu` multi-region [P][v-sonnet] | No. Foundry offers Global Standard and US Data Zone only, and Sonnet 5.5 is Global only [P][a-foundry] | +10% (Bedrock regional/geo, Vertex multi-region) [P][a-price], [P][a-bedrock], [P][v-claude] |
| Claude Opus 5.5 | No [P][a-resid] | Yes, `eu.anthropic.claude-opus-5-5` [P][aws-opus] | Yes, `eu` multi-region [P][v-opus] | No EU data zone [P][a-foundry] | +10% |
| Claude Fable 5.1 | No [P][a-resid] | **No.** The model card lists only `us.` and `global.` profiles, and Anthropic says "For Claude Fable 5.1, regional endpoints are currently available in `us-east-1` only" [P][aws-fable], [P][a-bedrock] | Yes, `eu` multi-region [P][v-fable] | No (Foundry hosts it on Anthropic infrastructure, Global only) [P][a-foundry] | +10% on Vertex |
| Claude Haiku 4.5 | No (`inference_geo` returns a 400 error on Haiku 4.5) [P][a-resid] | Yes, `eu.anthropic.claude-haiku-4-5-20251001-v1:0` [P][aws-haiku] | Yes, regional `europe-west1` [P][v-haiku] | No EU data zone [P][a-foundry] | +10% |
| GPT-6.1 Sol | Yes. Create a Europe-region project and call `eu.api.openai.com`. EU covers the EEA and Switzerland, with Standard, Flex and Batch processing. Requires approved abuse-monitoring controls and a Modified Retention amendment [P][o-data] | n/a | n/a | Yes, Data Zone Standard (EU): $2,40 / cached $0,12 / write $3,00 / output $12,00 [P][ms-61sol] | OpenAI +10% [P][o-price]; Azure EU +20% [P][ms-61sol] |
| GPT-6 Sol | Yes, same conditions [P][o-data] | n/a | n/a | Yes, Data Zone Standard (EU): $2,40 / $0,24 / $12,00 [P][ms-6] | OpenAI +10%; Azure EU +20% |
| GPT-6 Luna | Yes, same conditions [P][o-data] | n/a | n/a | Yes, Data Zone Standard (EU): $0,12 / $0,012 / $0,60 [P][ms-6] | OpenAI +10%; Azure EU +20% |
| Gemini 3.8 Flash | Gemini Developer API: no region pinning (secondary sources only) [S][requesty-gemini] | n/a | Yes, `eu` multi-region for PayGo and Provisioned Throughput [P][v-g38] | n/a | +10% ("Non-global" $0,825 / $0,0825 / $4,125) [P][v-price] |
| Gemini 4 Argon | Not available | n/a | Not available | n/a | n/a |

On the ~10% regional premium: Anthropic writes "Regional and multi-region endpoints include a 10% premium over global endpoints" for Sonnet 4.5, Haiku 4.5, Opus 4.5 "and all future models" [P][a-price]. Vertex AI's price page lists Sonnet 5.5 at $2,20 / $11,00 / cache hit $0,22, and Fable 5.1 at $11,00 / $55,00 / $0,275, in its regional table [P][v-price]. The AWS pricing page renders client-side, so its EU rows could not be read. The Bedrock EU prices in the cost table come from Anthropic's 10% statement, and LiteLLM's `eu.*` entries agree with it.

## 3. Coding benchmarks

Vendor numbers use each vendor's own harness and effort setting, so compare them only within a column. The Vals.ai Terminal-Bench 4.0 run is the only independent run covering all of these models with one method. It was last updated 29 September 2026 [S][vals-tb4].

| Model | SWE-bench Pro (vendor) | SWE-bench Verified | Terminal-Bench 4.0 (vendor) | Terminal-Bench 4.0 (Vals, independent) | Vals cost per task | Cost per **resolved** task (derived) | DeepSWE v1.1 (vendor) |
|---|---|---|---|---|---|---|---|
| Claude Sonnet 5.5 | 81,3% [P][a-sc55] | not reported | 70,6% (max effort) [P][a-sc55] | 64,1% | $16,51 | $25,74 | 71,0% [P][a-sc55] |
| Claude Opus 5.5 | 89,9% [P][a-sc55] | not reported | 66,4% (xhigh) [P][a-opus] | 65,2% | $13,20 | $20,26 | not found |
| Claude Fable 5.1 | 81,2% [P][a-sc51] | not reported | 55,8% (max) [P][a-sc51] | 58,1% | $17,18 | $29,57 | 67,4% [P][a-sc51] |
| Claude Haiku 4.5 | not reported | 73,3% (Oct 2025) [P][a-haiku]; Vals 66,6% [S][vals-swev] | Terminal-Bench (v1) 41,75% [P][a-haiku] | not run | n/a | n/a | n/a |
| GPT-6.1 Sol | not reported | not reported | not reported by OpenAI | 55,1% | $1,72 | $3,13 | 75,2% (high) [P][o-community] |
| GPT-6 Sol | not reported | not reported | not reported ("OpenAI has not reported a Terminal-Bench 4.0 score for GPT-6 Sol") [P][a-sc55] | 44,4% | $5,79 | $13,03 | 68,8% (max) [P][o-community] |
| GPT-6 Luna | not reported | not reported | not reported | 13,6% | $0,35 | $2,60 | not found |
| Gemini 3.8 Flash | 61,6% (Google table, via secondary) [S][vellum-g38] | Vals 80,0% [S][vals-swev] | 19,1% (Google table, via secondary) [S][vellum-g38] | 19,2% | $8,77 | $45,72 | 73,7% [S][vellum-g38] |
| Gemini 4 Argon | not published | not published | not published | 57,6% (pre-release access) | $17,64 | $30,64 | 77,9% [P][g-argon] |
| GPT-6 Astra (reference) | n/a | n/a | 57,9% (high) [P][a-sc55] | 59,6% | $9,58 | $16,08 | 74,1% [S][vellum-61] |

Notes:
- "Cost per resolved task" is the Vals cost per task divided by the Vals accuracy. It is a derived figure, not one any vendor publishes.
- SWE-bench Verified is close to saturated (Vals' top score is Claude Opus 5 at 97,0%). Vals last updated it 1 September 2026 and did not run the September models [S][vals-swev]. Anthropic's September system cards report SWE-bench Pro, Multilingual and Multimodal instead [P][a-sc55], [P][a-sc51].
- Scale's public SWE-bench Pro leaderboard tops out at 61,5% and has no rows for these models, so it was not used [S][scale-swepro].
- OpenAI did not publish SWE-bench or Terminal-Bench 4.0 figures for GPT-6.1 Sol. Its headline coding figure is DeepSWE v1.1, quoted from OpenAI's developer-community announcement [P][o-community]. The main announcement page returned HTTP 403.
- Anthropic says Sonnet 5.5 "costs up to 30% less per task than its predecessor" [P][a-sonnet]. On Vals' Terminal-Bench 4.0 run at max effort, Sonnet 5.5 cost more per task than Opus 5.5 ($16,51 against $13,20).

## 4. Cost per Run

Workload per Run: 500.000 input tokens, of which 400.000 are cache reads and 100.000 uncached, plus 20.000 output tokens. The main column bills the 100.000 uncached tokens at the 5-minute cache-write price. That is how an agent loop behaves when each new turn is appended to the cache. The "base input" column bills them at the plain input price instead, as a lower bound. Gemini has no cache-write charge, so both columns are equal there. Each request is assumed to stay under the long-context thresholds (272K for OpenAI, 200K for Gemini), so short-context rates apply. All Claude models bill the full 1M window at standard rates. A writer Run plus a reviewer Run is two Runs.

| Model | Global, with cache write | Global, base input | EU-resident | EU route | Shift (writer + reviewer), EU |
|---|---|---|---|---|---|
| Claude Sonnet 5.5 | $0,53 | $0,48 | $0,58 | Bedrock `eu.` or Vertex `eu` (+10%) | $1,17 |
| Claude Opus 5.5 | $0,98 | $0,88 | $1,08 | Bedrock `eu.` or Vertex `eu` (+10%) | $2,16 |
| Claude Fable 5.1 | $2,35 | $2,10 | $2,59 | Vertex `eu` only (+10%) | $5,17 |
| Claude Haiku 4.5 | $0,27 | $0,24 | $0,29 | Bedrock `eu.` or Vertex `europe-west1` (+10%) | $0,58 |
| GPT-6.1 Sol | $0,49 | $0,44 | $0,54 (OpenAI EU) / $0,59 (Azure EU) | `eu.api.openai.com` (+10%) or Azure EU Data Zone (+20%) | $1,08 / $1,18 |
| GPT-6 Sol | $0,53 | $0,48 | $0,58 (OpenAI EU) / $0,64 (Azure EU) | same | $1,17 / $1,27 |
| GPT-6 Luna | $0,03 | $0,02 | $0,03 / $0,03 | same | $0,06 / $0,06 |
| Gemini 3.8 Flash, promo (to 31 Dec 2026) | $0,18 | $0,18 | $0,20 | Vertex `eu` (+10%) | $0,40 |
| Gemini 3.8 Flash, from 1 Jan 2027 | $0,36 | $0,36 | $0,40 | Vertex `eu` (+10%) | $0,79 |
| Gemini 4 Argon, intro (not callable) | $0,44 | $0,44 | unknown | none yet | n/a |
| Gemini 4 Argon, after intro (not callable) | $0,88 | $0,88 | unknown | none yet | n/a |

Breakdown for Sonnet 5.5 at global prices: uncached $0,25, cache reads $0,08, output $0,20. For every Claude model and for GPT-6.1 Sol, the uncached 20% of the input and the output make up over 80% of the cost. The cache-read price matters less than these two. These per-Run figures assume every model uses the same number of tokens. The Vals cost-per-task column in section 3 shows that assumption is false. GPT-6.1 Sol spent about one tenth of what Sonnet 5.5 spent per Terminal-Bench task. Measure Glide's own token counts per Run before choosing on price.

## 5. LiteLLM model strings

LiteLLM price map: [raw JSON][litellm]. "Match" means the map's per-token prices equal the vendor's page.

| Use | LiteLLM model string | Map key present | Prices match vendor? |
|---|---|---|---|
| Sonnet 5.5, Anthropic API (global) | `anthropic/claude-sonnet-5-5` | yes (`claude-sonnet-5-5`) | Yes: $2 / $2,50 / $0,20 / $10 and batch $1 / $5. The map has `provider_specific_entry: {"us": 1.1}` for `inference_geo: us`. |
| Sonnet 5.5, Bedrock EU | `bedrock/eu.anthropic.claude-sonnet-5-5` | yes | Yes, +10% ($2,20 / $2,75 / $0,22 / $11). No batch prices in the map. |
| Sonnet 5.5, Vertex EU | `vertex_ai/claude-sonnet-5-5` with `vertex_location="eu"` | yes | The map holds global prices ($2 / $10) plus `regional_endpoint_uplift_multiplier: 1.1`. Vertex lists $2,20 / $11 for regional endpoints. Not verified: whether LiteLLM applies the multiplier when it computes cost. |
| Sonnet 5.5, Foundry | `azure_ai/claude-sonnet-5-5` | yes | Prices match global. Not EU-resident. |
| Opus 5.5, Anthropic API | `anthropic/claude-opus-5-5` | yes | Yes ($4 / $5 / $0,20 / $20; 1 h write $8). The map has `provider_specific_entry: {"fast": 2.0}`. |
| Opus 5.5, Bedrock EU | `bedrock/eu.anthropic.claude-opus-5-5` | yes | Yes, +10% ($4,40 / $5,50 / $0,22 / $22). |
| Opus 5.5, Vertex EU | `vertex_ai/claude-opus-5-5`, `vertex_location="eu"` | yes | Standard rates match global. **Batch rates differ:** the map has $2,50 / $12,50, Vertex lists $2,00 / $10,00 [P][v-price]. |
| Fable 5.1, Anthropic API | `anthropic/claude-fable-5-1` | yes | Yes ($10 / $12,50 / $0,25 / $50). |
| Fable 5.1, EU | `vertex_ai/claude-fable-5-1`, `vertex_location="eu"` | yes | Global prices plus the 1.1 multiplier field. Vertex regional: $11 / $13,75 / $0,275 / $55. |
| Fable 5.1, Bedrock EU | `bedrock/eu.anthropic.claude-fable-5-1` | **present in map, but AWS publishes no EU profile** | Map shows $11 / $55. Do not use: AWS lists only `us.` and `global.` [P][aws-fable]. |
| Haiku 4.5, Anthropic API | `anthropic/claude-haiku-4-5` (or `claude-haiku-4-5-20251001`) | yes | Yes ($1 / $1,25 / $0,10 / $5). |
| Haiku 4.5, Bedrock EU | `bedrock/eu.anthropic.claude-haiku-4-5-20251001-v1:0` | yes | Yes, +10%. The map's `deprecation_date` is 2026-10-15. |
| Haiku 4.5, Vertex EU | `vertex_ai/claude-haiku-4-5@20251001`, `vertex_location="europe-west1"` | yes | Global prices plus the multiplier field. `deprecation_date` 2026-10-15. |
| GPT-6.1 Sol, OpenAI global | `openai/responses/gpt-6.1-sol` (the `responses/` prefix routes through the Responses API, which tool calling needs) [S][litellm-openai] | yes (`gpt-6.1-sol`) | Yes ($2 / $2,50 / $0,10 / $10; above 272K: $4 / $5 / $0,20 / $15; batch and flex half). |
| GPT-6.1 Sol, OpenAI EU | same string with `api_base="https://eu.api.openai.com/v1"` and a Europe-region project key | yes | The map has `regional_processing_uplift_multiplier_eu: 1.1`. Not verified whether cost tracking applies it. |
| GPT-6.1 Sol, Azure EU | `azure/eu/gpt-6.1-sol` | **missing** | Only `azure/gpt-6.1-sol` (global) and `azure/gpt-6.1-sol-2026-09-29` exist. Microsoft lists EU at $2,40 / $0,12 / $3,00 / $12,00 [P][ms-61sol]. |
| GPT-6 Sol, OpenAI | `openai/gpt-6-sol` | yes | Yes ($2 / $2,50 / $0,20 / $10). |
| GPT-6 Sol, Azure EU | `azure/eu/gpt-6-sol` | yes | Yes ($2,40 / $3,00 / $0,24 / $12) [P][ms-6]. |
| GPT-6 Luna, OpenAI | `openai/gpt-6-luna` | yes | Yes ($0,10 / $0,125 / $0,01 / $0,50). |
| GPT-6 Luna, Azure EU | `azure/eu/gpt-6-luna` | yes | Yes ($0,12 / $0,15 / $0,012 / $0,60). |
| Gemini 3.8 Flash, Gemini API | `gemini/gemini-3.8-flash` | yes | Matches the **promo** price ($0,75 / $0,075 / $3,75; batch half). It will under-count from 1 January 2027 unless the map is updated. No region pinning. |
| Gemini 3.8 Flash, Vertex EU | `vertex_ai/gemini-3.8-flash`, `vertex_location="eu"` | yes | Global promo prices plus `regional_endpoint_uplift_multiplier`. Vertex non-global: $0,825 / $0,0825 / $4,125. |
| Gemini 4 Argon | none | **missing** (no `argon` key at all) | No public model ID exists. |

## Gaps

- **Gemini 4 Argon:** no API model ID, no Vertex AI row, no cache-write or long-context price, and no date when the introductory price ends. Its only independent benchmark is Vals' pre-release run.
- **AWS Bedrock price page:** the EU rows did not render. The Bedrock EU figures rest on Anthropic's "+10%" statement and LiteLLM's map, not on AWS's own table.
- **OpenAI benchmarks:** OpenAI published no SWE-bench Pro, SWE-bench Verified or Terminal-Bench 4.0 figures for GPT-6.1 Sol, GPT-6 Sol or Luna. The announcement page at openai.com returned HTTP 403. Release-date sources disagree by one day: Microsoft's post is dated 29 September, OpenAI's community post 30 September.
- **Gemini 3.8 Flash benchmarks:** Google's evaluation page renders client-side. The SWE-bench Pro (61,6%), Terminal-Bench 4.0 (19,1%) and DeepSWE (73,7%) figures come from secondary write-ups of Google's table.
- **Opus 5.5 DeepSWE** and **Haiku 4.5** current-generation benchmarks were not found. Haiku 4.5's figures are from October 2025, on older benchmark versions.
- **Gemini Developer API residency:** that it has no region pinning is supported only by secondary sources. No Google page was found that says so explicitly.
- **LiteLLM cost tracking:** not verified whether LiteLLM applies `regional_endpoint_uplift_multiplier` (Vertex) or `regional_processing_uplift_multiplier_eu` (OpenAI) when it computes spend. If it does not, EU spend is under-reported by 10%.
- **Token-efficiency differences** between models are not in the per-Run table, because it assumes the same token counts for every model. Glide's own per-Run telemetry is needed.
- **EUR amounts:** no sourced USD to EUR rate was used.

## Sources

Anthropic [P]
- `a-price`: <https://platform.claude.com/docs/en/about-claude/pricing>
- `a-resid`: <https://platform.claude.com/docs/en/manage-claude/data-residency>
- `a-bedrock`: <https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock>
- `a-foundry`: <https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry>
- `a-depr`: <https://platform.claude.com/docs/en/about-claude/model-deprecations>
- `a-sonnet`: <https://www.anthropic.com/claude-sonnet-5-5>
- `a-opus`: <https://www.anthropic.com/claude-opus-5-5>
- `a-sc55`: <https://www-cdn.anthropic.com/870c8f525702625d2c62fc6dd04c857e3250bec1/Claude%20Sonnet%205.5%20System%20Card.pdf>
- `a-sc51`: <https://www-cdn.anthropic.com/0339e6a7c5c7b87f5c07798616dc32c215d14235/Claude%20Fable%205.1%20&%20Claude%20Mythos%205.1%20System%20Card.pdf>
- `a-haiku`: <https://www.anthropic.com/news/claude-haiku-4-5>

AWS [P]
- `aws-sonnet`: <https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html>
- `aws-opus`: <https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html>
- `aws-fable`: <https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5-1.html>
- `aws-haiku`: <https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html>

Google [P]
- `v-claude`: <https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai>
- `v-sonnet`: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/sonnet-5-5>
- `v-opus`: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/opus-5-5>
- `v-fable`: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/fable-5-1>
- `v-haiku`: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/haiku-4-5>
- `v-g38`: <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash>
- `v-price`: <https://cloud.google.com/vertex-ai/generative-ai/pricing>
- `g-price`: <https://ai.google.dev/gemini-api/docs/pricing>
- `g-38blog`: <https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/>
- `g-argon`: <https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/>
- Gemini API changelog (no Argon entry through 1 Oct 2026): https://ai.google.dev/gemini-api/docs/changelog

OpenAI and Microsoft [P]
- `o-price`: <https://developers.openai.com/api/docs/pricing>
- `o-61sol`: <https://developers.openai.com/api/docs/models/gpt-6.1-sol>
- `o-6sol`: <https://developers.openai.com/api/docs/models/gpt-6-sol>
- `o-luna`: <https://developers.openai.com/api/docs/models/gpt-6-luna>
- `o-data`: <https://developers.openai.com/api/docs/guides/your-data>
- `o-community`: <https://community.openai.com/t/gpt-6-1-sol-in-the-api-a-meaningful-step-up-in-cost-performance/1402388>
- `ms-61sol`: <https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-gpt-6-1-sol-in-microsoft-foundry-advanced-intelligence-optimized-for/4560811>
- `ms-6`: <https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/>

Secondary [S]
- `vals-tb4`: <https://www.vals.ai/benchmarks/terminal-bench-4>
- `vals-swev`: <https://www.vals.ai/benchmarks/swebench>
- `scale-swepro`: <https://labs.scale.com/leaderboard/swe_bench_pro_public>
- `vellum-g38`: <https://www.vellum.ai/blog/gemini-3-8-flash-benchmarks-explained>
- `vellum-61`: <https://www.vellum.ai/blog/gpt-6-1-sol-benchmarks-explained>
- `tokencost-argon`: <https://tokencost.app/blog/gemini-4-argon-pricing>
- `requesty-gemini`: <https://www.requesty.ai/eu/gemini>
- `litellm-openai`: <https://docs.litellm.ai/docs/providers/openai>
- `litellm`: <https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json>

[a-price]: https://platform.claude.com/docs/en/about-claude/pricing
[a-resid]: https://platform.claude.com/docs/en/manage-claude/data-residency
[a-bedrock]: https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
[a-foundry]: https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry
[a-depr]: https://platform.claude.com/docs/en/about-claude/model-deprecations
[a-sonnet]: https://www.anthropic.com/claude-sonnet-5-5
[a-opus]: https://www.anthropic.com/claude-opus-5-5
[a-sc55]: https://www-cdn.anthropic.com/870c8f525702625d2c62fc6dd04c857e3250bec1/Claude%20Sonnet%205.5%20System%20Card.pdf
[a-sc51]: https://www-cdn.anthropic.com/0339e6a7c5c7b87f5c07798616dc32c215d14235/Claude%20Fable%205.1%20&%20Claude%20Mythos%205.1%20System%20Card.pdf
[a-haiku]: https://www.anthropic.com/news/claude-haiku-4-5
[aws-sonnet]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
[aws-opus]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html
[aws-fable]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5-1.html
[aws-haiku]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html
[v-claude]: https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai
[v-sonnet]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/sonnet-5-5
[v-opus]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/opus-5-5
[v-fable]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/fable-5-1
[v-haiku]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/haiku-4-5
[v-g38]: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash
[v-price]: https://cloud.google.com/vertex-ai/generative-ai/pricing
[g-price]: https://ai.google.dev/gemini-api/docs/pricing
[g-38blog]: https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/
[g-argon]: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/
[o-price]: https://developers.openai.com/api/docs/pricing
[o-61sol]: https://developers.openai.com/api/docs/models/gpt-6.1-sol
[o-6sol]: https://developers.openai.com/api/docs/models/gpt-6-sol
[o-luna]: https://developers.openai.com/api/docs/models/gpt-6-luna
[o-data]: https://developers.openai.com/api/docs/guides/your-data
[o-community]: https://community.openai.com/t/gpt-6-1-sol-in-the-api-a-meaningful-step-up-in-cost-performance/1402388
[ms-61sol]: https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-gpt-6-1-sol-in-microsoft-foundry-advanced-intelligence-optimized-for/4560811
[ms-6]: https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/
[vals-tb4]: https://www.vals.ai/benchmarks/terminal-bench-4
[vals-swev]: https://www.vals.ai/benchmarks/swebench
[scale-swepro]: https://labs.scale.com/leaderboard/swe_bench_pro_public
[vellum-g38]: https://www.vellum.ai/blog/gemini-3-8-flash-benchmarks-explained
[vellum-61]: https://www.vellum.ai/blog/gpt-6-1-sol-benchmarks-explained
[tokencost-argon]: https://tokencost.app/blog/gemini-4-argon-pricing
[requesty-gemini]: https://www.requesty.ai/eu/gemini
[litellm-openai]: https://docs.litellm.ai/docs/providers/openai
[litellm]: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
