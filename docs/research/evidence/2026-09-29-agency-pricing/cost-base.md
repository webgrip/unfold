# Cost base inputs for an EU AI coding-agent service (as of 29 September 2026)

Method note: every WebFetch to primary pricing pages (docs.anthropic.com, openai.com, developers.openai.com, ai.google.dev, api-docs.deepseek.com, benchlm.ai) was blocked by the session's egress proxy. All figures below come from web-search result snippets. Most of those snippets are from secondary aggregators or blogs, not the vendor's own page. Treat every price as "reported as of Sep 2026, verify on the vendor page before you commit to it". Prices are in USD unless marked EUR. I found no sourced USD to EUR rate, so no conversion is applied.

## 1. Model API prices per million tokens (input / output / cache)

### Takeaway
In September 2026 frontier coding models cost about $2-4 per million input tokens and $10-20 per million output tokens. Cached input costs about 0.1x the input rate. Chinese and open-weight models cost 10-50x less. EU data residency adds about 10% on frontier models (20% on Azure EU Data Zone for GPT-6). The direct Anthropic API offers no EU residency.

### Cited Findings
**Anthropic**
- Claude Opus 5.5: $4 input / $20 output per MTok. It was released 22 Sep 2026 and replaced Opus 5, which cost $5 / $25. Claude Sonnet 5 costs $2 / $10 and Claude Haiku 4.5 costs $1 / $5. Prompt caching reads cost 0.1x the base input rate, the Batch API halves both directions, and the 1M-token context is billed at standard rates — [BenchLM.ai, Sep 2026](https://benchlm.ai/anthropic/api-pricing); corroborating title: [Sentra, "Opus 5.5, Sonnet 5 and Haiku rates"](https://www.sentra.app/articles/claude-api-pricing). The cache write multiplier was not in the snippet. Historically it has been 1.25x for a 5-minute TTL; that figure is unverified for 2026.
- Claude on the direct Anthropic API has no EU data storage. On AWS Bedrock EU regions or the Google Cloud EU multi-region it carries a 10% premium. Anthropic documents that "regional and multi-region endpoints include a 10% premium over global endpoints" for Sonnet 4.5, Haiku 4.5, Opus 4.5 and later — [aliteq.com, EU data residency cost 2026](https://aliteq.com/eu-data-residency-ai-api-cost-2026); [Eden AI](https://www.edenai.co/post/how-to-use-openai-claude-gemini-in-europe-without-gdpr-risk)

**OpenAI**
- GPT-6 Sol costs $2 input / $10 output per MTok. GPT-6 Luna costs $0.10 / $0.50. Both were released 22 Sep 2026, and OpenAI calls these permanent prices, not introductory ones. Cache writes cost $2.50 (Sol) and $0.125 (Luna). Cached input costs 10% of the input rate: $0.20 for Sol and $0.01 for Luna — [Requesty](https://www.requesty.ai/blog/gpt-6-sol-luna-pricing-release-api); [VentureBeat](https://venturebeat.com/technology/openai-releases-gpt-6-sol-and-luna-models-slashing-api-costs-50-or-more); [OpenAI announcement (not fetched)](https://openai.com/index/introducing-gpt-6-sol-and-luna/). A "GPT-6 Astra" tier also appears in one aggregator's title, with no price captured — [aipricing.guru](https://www.aipricing.guru/openai-pricing/).
- Older codex models: GPT-5.2/5.3 Codex cost $1.75 / $14. GPT-5/5.1 Codex cost $1.25 / $10. These prices apply to prompts of 200K tokens or less — [pricepertoken.com](https://pricepertoken.com/pricing-page/model/openai-gpt-5.3-codex).
- OpenAI regional processing (data residency) endpoints add 10% for eligible models released on or after 5 Mar 2026. For GPT-6 Sol and Luna, EU residency is available only on Standard processing. GPT-6 on the Azure EU Data Zone costs 20% more — [OpenAI pricing page via search snippet](https://developers.openai.com/api/docs/pricing); [aliteq.com](https://aliteq.com/eu-data-residency-ai-api-cost-2026)

**Google Gemini**
- Gemini 3.8 Flash was released 2 Sep 2026 at an introductory $0.75 input / $3.75 output. 3.7 and 3.6 Flash carry the same promotional rates, and the prices double on 1 Jan 2027. Gemini 3.5 Flash has no promotion and costs $1.50 / $9.00 — [Puter / CostGoat / TokenCost search snippets](https://developer.puter.com/tutorials/gemini-api-pricing/); [TokenCost](https://tokencost.app/models/gemini-3-flash)
- Non-global (regional) Gemini endpoints carry roughly a 10% premium — [aliteq.com](https://aliteq.com/eu-data-residency-ai-api-cost-2026)

**DeepSeek, Qwen, Kimi, Mistral**
- DeepSeek-V4-Flash costs $0.14 input / $0.28 output. DeepSeek-V4-Pro costs $0.435 / $0.87 (July 2026). Cache hits cut input cost by roughly 50-100x — [Coworker AI / morphllm snippets](https://coworker.ai/blog/deepseek-api-pricing)
- Qwen3.7 Flash costs $0.03 / $0.13 (27 Sep 2026) — [BenchLM LLM pricing snippet](https://benchlm.ai/llm-pricing)
- Kimi K2.6 costs $1.20 / $4.50 and Kimi K3 costs $3 / $15 — [same search set](https://www.layer3labs.io/ai-model-pricing)
- Mistral Small 4 costs $0.15 / $0.60. Devstral Medium costs $0.40 / $2.00 — [search snippets](https://www.cloudzero.com/blog/mistral-api-pricing/); [Artificial Analysis, Devstral Medium](https://artificialanalysis.ai/models/devstral-medium). Mistral is an EU (French) provider.

**Aggregators**
- OpenRouter charges a 5.5% fee on credit purchases. With bring-your-own-key (BYOK), pay-as-you-go accounts get a fee-free allowance of $25,000 per month of list-price inference, then pay a 5% BYOK fee. An older version of the policy was 1M free BYOK requests per month, then 5% — [TrueFoundry](https://www.truefoundry.com/blog/openrouter-pricing); [aireiter](https://aireiter.com/blog/openrouter-byok-fees-fallback-guide)

### Inferences
- A sensible default for writer and reviewer Runs is Sonnet 5 or GPT-6 Sol at $2 / $10. Opus 5.5 at $4 / $20 costs 2x as much. DeepSeek V4 Pro costs about 1/5 to 1/10 of that. Gemini Flash is cheap until 1 Jan 2027, when its price doubles; plan with the doubled price.
- EU residency is a flat multiplier of about 1.10 on frontier-model spend. That is small next to the choice of model tier.
- Through OpenRouter credits, add 5.5% to list price. With BYOK, add 0% below $25k per month of inference.

### Gaps
- None of these prices was confirmed on a primary vendor page, because the fetches were blocked. The Opus 5.5 price comes from one aggregator.
- Not found: Gemini Pro-tier prices for September 2026, Anthropic cache write multipliers for 2026, Fireworks and Together per-model prices, Mistral Large and Codestral prices, and Qwen Max and Coder prices.

## 2. Tokens consumed and cost per coding-agent task

### Takeaway
One agent coding task pushes about 0.4-2M cumulative input tokens through the API, mostly cache reads. At Sonnet-class prices that is about $0.5-2.5 per task. That matches Glide's internal figure of EUR 1-3 per frontier Run. On SWE-bench Verified, cost per resolved task is about $0.5-0.75.

### Cited Findings
- "One task pushes 400K to 2M cumulative input tokens through the API." A bug fix computes to $0.54 on Sonnet 4.6, and a feature-sized task to $2.28 — [Morph, Claude Code API cost](https://www.morphllm.com/claude-code-api-cost); [kunalganglani.com](https://www.kunalganglani.com/blog/ai-agent-cost-per-task-2026)
- Claude Code costs about $6 per developer per day on average, and under $12 per day for 90% of users. Other sources report $13 per developer per active day, or $100-200 per month with Sonnet — [Anthropic Claude Code costs doc via snippet](https://docs.anthropic.com/en/docs/claude-code/costs); [Finout](https://www.finout.io/blog/claude-code-pricing-2026)
- On SWE-bench Verified, Claude Opus 4.6 costs $0.55 per task and Haiku 4.5 costs $0.33. Per resolved task the figures are $0.73 and $0.50 — [morphllm SWE-bench Pro page / search snippet](https://www.morphllm.com/swe-bench-pro)
- tbench.ai (Terminal-Bench) publishes total tokens and dollar cost per agent, so cost per solved task can be compared — [Altimate AI](https://altimate.ai/blog/cost-per-task-vs-dollars-per-million-tokens)

### Inferences
- These are illustrative estimates, not measured data. A writer Run plus a reviewer Run plus up to one fix round is roughly 2-3x one task's tokens. Using Sonnet 5 or GPT-6 Sol at $2 / $10 and 0.1x cache reads:
  - S ticket (about 0.5M input, 80% cached, about 20K output, per Run): about $0.4 per Run, $1-1.5 per Shift.
  - M ticket (about 1.5M input, about 60K output): about $1.1 per Run, $3-4 per Shift.
  - L ticket (about 4M+ input, about 150K output): about $3 per Run, $8-12 per Shift.
  - Opus 5.5 roughly doubles these figures. DeepSeek V4 Pro divides them by about 5-10, which is consistent with the internal EUR 0.01-0.05 per Run.
- Cache hit rate is the biggest driver of cost. Price the model at about 70-90% cache reads.

### Gaps
- Not found: Aider leaderboard cost columns, Devin ACU pricing for 2026, and OpenHands cost per issue (the fetches were blocked).
- The S/M/L token budgets are my extrapolation, not a published figure.

## 3. Success rates on realistic tasks

### Takeaway
Top models score about 80% on SWE-bench Pro in September 2026. SWE-bench Verified is saturated at 78%+. METR found that maintainers merge about 24 percentage points fewer PRs than the automated grader accepts. So expect a realistic mergeable-PR rate of about 50-65% for well-scoped tickets, and less for large ones.

### Cited Findings
- SWE-bench Pro, September 2026: Claude Fable 5.1 scores 81.2%, Fable 5 and Mythos 5 score 80.3%, and Opus 5 scores 79.2%. The top open-weight models are Qwen3.8-Flash-Next at 62.5%, GLM-5.2 at 62.1% and Kimi K2.6 at 58.6% (vendor aggregate, 14 Sep 2026) — [morphllm SWE-bench Pro](https://www.morphllm.com/swe-bench-pro)
- SWE-bench Verified rose from 1.96% (Aug 2024) to 78.4% (Apr 2026) — [arXiv 2608.13884 snippet](https://arxiv.org/pdf/2608.13884)
- METR had 4 maintainers from 3 SWE-bench Verified repositories review 296 AI PRs. Their merge decisions were about 24 percentage points lower than the automated grader's pass rate — [METR, 10 Mar 2026](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/)
- A study of 8,106 fix-related PRs from five AI coding agents found that the main reasons PRs stayed unmerged were test failures and the issue already being fixed by another PR — [awesomepapers / arXiv 2602.00164](https://awesomepapers.io/ai-agents/papers/2602.00164); see also [arXiv 2605.22534](https://arxiv.org/html/2605.22534)

### Inferences
- Delivery rate ≈ benchmark score − about 24 points ≈ 55% for frontier models and about 35-40% for open-weight models. Each resolved ticket therefore costs about 1.8x (frontier) to 2.7x (open-weight) the per-Shift cost, unless failed Shifts are free to the customer.

### Gaps
- Not fetched: merge rates from the vendor-reported studies (arXiv 2605.22534, 2607.04697). Not found: Devin or Copilot agent vendor-reported merge rates for 2026.

## 4. EU cloud prices

### Takeaway
Hetzner is still by far the cheapest option, even after three price rises in 2026. The rises came from DRAM costs, which have multiplied. Its dedicated-vCPU plans rose 113-175% on 15 June 2026. OVHcloud raised prices by up to 87% (April 2026). Hyperscaler managed-Kubernetes control planes cost $0.10 per hour.

### Cited Findings
- Hetzner price adjustment of 15 June 2026: CX23 costs EUR 5.49/mo, CPX12 (1 vCPU, 2 GB, 0.5 TB traffic) EUR 11.99/mo and CPX22 EUR 19.49/mo. Dedicated-vCPU plans rose 113-175% — CCX13 went from EUR 15.99 to EUR 42.99. Shared lines rose about 30-43% — [Hetzner Docs, price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/); [Northflank](https://northflank.com/blog/hetzner-cloud-server-price-increases); [bex.co, 16 Sep 2026](https://bex.co/blog/2026/09/16/rampocalypse-own-hardware-thesis-ovhcloud-hetzner)
- Hetzner EU cloud servers include at least 20 TB of traffic. Overage costs EUR 1/TB. Object Storage costs EUR 6.49/mo including 1 TB of storage and 1 TB of egress, with extra storage at about $0.006/GB-mo — [search snippet, Hetzner / Better Stack](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)
- OVHcloud's 1 April 2026 update moved VPS-1 from about EUR 3.50 to EUR 7.60. Mid-tier and bare-metal plans rose 10-20%, and some cloud bills rose up to 87%. OVHcloud projects RAM costs up 250-300% by the end of 2026 versus Sep 2025 — [Safi blog](https://abdulkadersafi.com/blog/vps-prices-are-rising-everywhere-in-2026-hetzner-ovhcloud-hostinger); [bex.co](https://bex.co/blog/2026/09/16/rampocalypse-own-hardware-thesis-ovhcloud-hetzner)
- Scaleway raised prices in tiers, with memory-heavy instances hit harder. Scaleway reportedly charges no egress fees, while typical hyperscaler egress is $0.05-0.09/GB — [Gart Solutions](https://gartsolutions.com/scaleway-vs-hetzner/). The Scaleway egress claim is unverified; its public pricing has historically included a free egress allowance, then per-GB fees.
- The EKS control plane costs $0.10 per cluster-hour (about $72/mo), rising to $0.60/hr on extended support. The GKE control plane costs $0.10/hr, and a $74.40/mo credit per billing account covers one zonal or Autopilot cluster — [Google Cloud GKE pricing](https://cloud.google.com/kubernetes-engine/pricing); [CloudBurn](https://cloudburn.io/blog/amazon-eks-pricing)

### Inferences
- Hetzner CPX12 works out to about EUR 0.016/hr for 1 vCPU and 2 GB (EUR 11.99 / 730 h). Blended, that is roughly EUR 0.01 per shared vCPU-hour and EUR 0.004-0.005 per GB-RAM-hour. That is a derived figure, not a published one. An agent Run pod (2 vCPU, 4 GB, 15 min) then costs less than EUR 0.01 of compute, which is negligible next to tokens.
- Preview environments dominate infrastructure cost. For metering, price preview hours at a multiple of about EUR 0.02-0.05 per small-environment-hour on Hetzner, and 5-10x that on AWS or GCP.

### Gaps
- Not obtained: per-vCPU-hour and per-GB-hour prices for AWS eu-central-1 (m7i, Fargate) and GCP europe-west4 (e2, n2); S3 and GCS per-GB-month and egress prices for 2026; list prices for Scaleway Kapsule, OVH MKS and Hetzner (Hetzner has no managed Kubernetes); post-increase prices for OVH and Scaleway object storage. The pricing pages could not be fetched. Historical figures (S3 Frankfurt about $0.0245/GB-mo, AWS egress about $0.09/GB) are unverified for 2026.

## 5. Payment processing fees in the Netherlands

### Takeaway
iDEAL and SEPA are cheap flat fees of about EUR 0.25-0.35. EU cards cost about 1.5-1.8% + EUR 0.25. The sources conflict on Stripe's and Mollie's iDEAL rates, so check the vendor pages directly.

### Cited Findings
- Stripe cards cost 1.5% + EUR 0.25 for European cards. Mollie cards cost 1.8% + EUR 0.25 — [comparecardfees / Solvimon snippets](https://www.solvimon.com/pricing-guides/payment-fees-stripe-mollie)
- SEPA Direct Debit costs EUR 0.35 per collection at both Stripe and Mollie, and EUR 0.20 at Solvimon. Another source quotes Stripe SEPA at 0.8% capped at EUR 5, against EUR 0.25 flat elsewhere — [Solvimon](https://www.solvimon.com/pricing-guides/payment-fees-stripe-mollie); [MG Software](https://www.mgsoftware.nl/en/vergelijking/stripe-vs-mollie)
- The iDEAL figures conflict. Mollie is quoted at EUR 0.32 flat per transaction, and also at EUR 0.29 flat via PayRequest. One snippet gave "Stripe 2.9% + 30c, Mollie 1.8% + 25c", which looks like card rates wrongly attributed to iDEAL. A cost example gives 10,000 iDEAL payments a month as EUR 2,900 at Stripe (about EUR 0.29 each), EUR 3,200 at Mollie (about EUR 0.32) and EUR 2,000 at Solvimon — [Solvimon](https://www.solvimon.com/pricing-guides/payment-fees-stripe-mollie); [PayRequest](https://payrequest.io/payment-providers/mollie)

### Inferences
- For B2B invoices of more than EUR 100, iDEAL or SEPA at about EUR 0.3 costs less than 0.3%, so payment fees are immaterial. Card payments cost about 1.5-1.8%.

### Gaps
- Not found: invoicing-product fees (Stripe Invoicing's per-invoice fee, Mollie invoicing) and Stripe Tax fees for 2026.

## 6. Billing and metering tools

### Takeaway
Stripe Billing charges a percentage of revenue (0.5-0.8%). Lago is free if self-hosted or about $400/mo managed. Orb and Metronome are enterprise, custom-priced, and now owned by Adyen and Stripe respectively.

### Cited Findings
- Stripe completed its acquisition of Metronome on 14 Jan 2026. Adyen closed its $335M acquisition of Orb on 1 Jul 2026 — [Lago blog](https://getlago.com/blog/metronome-alternatives); [Solvimon](https://www.solvimon.com/blog/best-billing-systems-in-2026)
- Stripe Billing has no platform fee but charges 0.5-0.8% of recurring revenue. Lago is free self-hosted (open source) or about $400/mo on managed cloud. Orb and Metronome are custom-priced and sales-led — [Kanopy Labs](https://kanopylabs.com/blog/stripe-billing-v2-vs-lago-vs-orb); [Landbase](https://www.landbase.com/blog/usage-based-billing-software)

### Inferences
- At early-stage revenue, Stripe Billing at about 0.7%, or self-hosted Lago on the existing cluster, is the cheapest choice. Lago self-hosted suits Glide's Kubernetes setup and EU data control.

### Gaps
- Exact Stripe Billing 2026 tiers (the 0.5% vs 0.8% split) were not verified on stripe.com.
