# What changed in LiteLLM and Fireworks, and what Ploeg should do about it

Date: 14 October 2026, against `origin/development` at `7575e4d3` and homelab `origin/main`, where LiteLLM runs `ghcr.io/berriai/litellm-database:v1.102.1` ([helmrelease.yaml](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/kubernetes/apps/ai/litellm/app/helmrelease.yaml)). This is a record. It follows the [models and Team shape record](2026-10-11-agentic-models-and-topology.md) of 11 October and answers four questions: which cheaper or better models Fireworks now serves, what LiteLLM and Fireworks offer for routing easy work to cheap models, which "decision" or judge models exist, and which other LiteLLM changes Ploeg must act on. Ploeg's Teams today: bronze builds with DeepSeek V4.1 Flash and reviews with GLM 5.3 Flash, the Ask uses GLM 5.3 Flash, and bronze spent [US$ 1,04 per merged Work Item](2026-10-11-cost-per-merged-work-item.md). Nothing below is decided or built.

> **Method.** Web research on primary sources: LiteLLM's GitHub releases, release notes, docs and security advisories; Fireworks' changelog, serverless pricing, model library and docs. Benchmarks come from Vals' Terminal-Bench 4.0 (TB4) board, updated 2026-10-13; "per solved task" is Vals' cost per task divided by its accuracy, computed here. A read-only look at the homelab LiteLLM config and at Ploeg's LiteLLM client. The pricing check in item 2 was done by reading the running LiteLLM's code, not its spend log. Prices are US$ per million tokens: input / cached input / output. Claims marked *unverified* could not be confirmed on a primary source.

## Verdict: five things worth acting on

1. **Upgrade LiteLLM now. The running v1.102.1 has a critical privilege escalation.** [GHSA-7hp6-4w63-5g45](https://github.com/BerriAI/litellm/security/advisories/GHSA-7hp6-4w63-5g45) (CVSS 9.9, published 2026-09-30) lets any signed-in `internal_user` become `proxy_admin`, and a proxy admin can run commands through stdio MCP servers. It is exploitable in the default configuration on 1.102.0 and 1.102.1, fixed in 1.102.2. On homelab, everyone who signs in through SSO and is not in `homelab-admins` is an `internal_user`, and the config defines six stdio MCP servers. *Cost:* no model spend, an hour or so of review. *Benefit:* closes a remote-code-execution path into the gateway that holds every provider key. *Next step:* a homelab pull request that bumps the image to `v1.102.4` (the latest 1.102.x patch, 2026-10-08, no breaking changes listed); then a separate, planned move to 1.105.x (see [question 4](#4-other-litellm-changes-since-v1102)).
2. **Re-baseline cost per merged Work Item, because DeepSeek V4.1 Flash got more expensive on 1 October.** Fireworks raised it from 0,22 / 0,007 / 0,66 to **0,30 / 0,006 / 1,20** ([changelog, 2026-10-01](https://docs.fireworks.ai/updates/changelog)): input +36 %, output +82 %, cached input −14 %. The US$ 1,04 window (29 September to 11 October) straddles the change. Homelab already pins the new price ([5fcb4d2e](https://forgejo.webgrip.dev/webgrip/homelab-cluster/commit/5fcb4d2e)). v1.102.0's notes say "new model writes no longer accept pricing overrides through `model_info`" ([v1.102.0 notes](https://docs.litellm.ai/release_notes/v1.102.0/v1-102-0)), but that concerns models added through the API: in the running v1.102.1, a config deployment's `model_info` prices are folded into LiteLLM's cost map (`Router._deployment_model_cost_payload`), and a `ModelInfo` built in the running image keeps tiered keys such as `input_cost_per_token_above_100k_tokens` (checked on 2026-10-14 inside the pod). So the pin applies, and output since 1 October is priced at 1,20. LiteLLM's bundled map in 1.102.x still has the old 0,22 / 0,66 price; 1.105.0 corrects it. *Cost:* none. *Benefit:* the cost-per-merged number reflects today's price. *Next step:* re-run the VIK-1617 query for Shifts opened after 1 October only.
3. **Raise the prompt-cache hit rate on Fireworks.** For DeepSeek V4.1 Flash a cached input token costs 1/50 of an uncached one, and agent Runs are input-heavy: Fireworks measured a 174 : 1 input-to-output ratio and 99,6 % cache hits on its own DeepSWE run ([Fireworks blog, 2026-09-14](https://fireworks.ai/blog/DeepSeek-V4.1-Flash-Astra)). Fireworks caches per replica and asks serverless callers to send a stable `user` field or `x-session-affinity` header so related requests reach the same replica ([prompt caching guide](https://docs.fireworks.ai/guides/prompt-caching)). LiteLLM 1.106.0-dev.3 adds a flag `fireworks_forward_user_id` to forward the key's user as `user` ([releases](https://github.com/BerriAI/litellm/releases)). Ploeg mints one key per Run, so that flag would give per-Run affinity for free. *Illustration:* per million input tokens, a hit rate of 80 % costs US$ 0,065 and 95 % costs US$ 0,021, a third. *Next step:* measure the current hit rate per model from the spend log (cached tokens ÷ prompt tokens); if it is well under 95 %, add per-Run affinity, through the flag once it reaches a stable release or by having the harness send `user`.
4. **Bench GLM 5.3 Flash as a builder, not only as a reviewer.** Vals now lists it: **37,4 % on TB4 at US$ 1,22 per task**, against DeepSeek V4.1 Flash's 19,7 % at US$ 0,50 ([TB4, 2026-10-13](https://www.vals.ai/benchmarks/terminal-bench-4)). Per solved task that is US$ 3,26 against US$ 2,54, so on Vals' harness it solves almost twice as much for about 30 % more per solution. MiMo V2.6 Pro (US$ 1,60 per solved task) is on Fireworks only as an on-demand deployment without function calling, so it is no option there. *Cost:* the builder bench already planned under [VIK-1621](https://vikunja.webgrip.dev/tasks/1621) (roughly US$ 25), with GLM 5.3 Flash added as a third builder for about US$ 8 more. A builder and reviewer from the same family break the "reviewer from another family" rule, so a GLM builder needs a DeepSeek or Claude Haiku 5.5 reviewer. *Next step:* add GLM 5.3 Flash to VIK-1621's builder list, and get the owner's OK on the spend before running.
5. **Keep routing in Ploeg, per Work Item; do not put an auto-router in front of Runs.** LiteLLM's Auto Router and Fireworks' FireRouter, `auto` and `auto-instant` pick a model per request or per user turn, from a heuristic or a classifier model ([LiteLLM Auto Router](https://docs.litellm.ai/docs/auto_router/), [FireRouter](https://docs.fireworks.ai/nexus/firerouter)). For Ploeg that would hide which model did the work (the reason for [VIK-2027](https://vikunja.webgrip.dev/tasks/2027)), could put builder and reviewer in the same family, and rests on vendor-only savings claims. The useful part is the decision itself: a cheap classifier answers "is this Work Item small and clear?" before a Run starts, which is the premise check [Ploeg ADR-0036](../../apps/ploeg/docs/adrs/0036-stuck-work-reaches-the-owner-as-a-cited-proposal-not-an-agent-decision.md) decided. *Cost:* fractions of a cent per Work Item on a model like Nemotron 3.5 Lightning (0,05 / 0,01 / 0,20). *Next step:* record this as the routing stance in the model-per-Role decision ([VIK-1678](https://vikunja.webgrip.dev/tasks/1678)); trial FireRouter `auto` only for Open WebUI's `chat-default`, which today points at MiniMax M3 (1,0 % on TB4).

Already done, no action: the earlier plan's step A6 ("turn fallbacks off for Ploeg keys") is built. Ploeg mints every Run key with `metadata.disable_fallbacks: true` ([pkg/llmbroker/litellm.go](../../apps/ploeg/pkg/llmbroker/litellm.go), [Ploeg ADR-0039](../../apps/ploeg/docs/adrs/0039-a-run-calls-only-its-roles-model-and-the-advisor-waits-for-metering.md)), which LiteLLM documents as switching off every fallback for that key, including mid-stream ones ([reliability docs](https://docs.litellm.ai/docs/proxy/reliability)).

## 1. Models on Fireworks

### What is new or changed since mid-August

| Date | Change | Matters for Ploeg? |
| --- | --- | --- |
| 2026-08-14, 08-27, 09-26 | Serverless removals: DeepSeek V4 Flash, V4 Flash 0731, V4 Pro (both), Kimi K2.6 and K2.7 Code, GLM 5.2 (all variants), MiniMax M2.7, GPT OSS 20B, Muse Glimmer 30B ([changelog](https://docs.fireworks.ai/updates/changelog)) | No; none is configured. |
| 2026-09-01 | US-only serverless routes at 1,5× the base price ([US-only serverless](https://docs.fireworks.ai/serverless/us-only-serverless)) | No; avoid the `-us` model ids. |
| ~2026-09-23 | **Ember-1**: Fireworks' post-trained Kimi K3 with about 40 % shorter reasoning, 3,00 / 0,30 / 15,00 ([MarkTechPost, 2026-09-28](https://www.marktechpost.com/2026/09/28/fireworks-ai-releases-ember-1-a-post-trained-kimi-k3-that-uses-about-40-fewer-tokens/), [pricing](https://docs.fireworks.ai/serverless/pricing)) | No: 20,7 % on TB4 at US$ 19,48 per task. |
| 2026-09-25 | **MiMo-V2.6-Pro-RL** in the model library, on-demand only, function calling "not supported" ([model page](https://fireworks.ai/models/fireworks/mimo-v2p6-pro-rl)) | No, not as a serverless agent model. |
| 2026-09-28 | **FireRouter with Opus** (`firerouter/opus`), plus `auto` and `auto-instant` routers ([model page](https://fireworks.ai/models/fireworks/firerouter-opus), [FireRouter docs](https://docs.fireworks.ai/nexus/firerouter)) | See question 2. |
| 2026-10-01 | **DeepSeek V4.1 Flash repriced** to 0,30 / 0,006 / 1,20 (Priority 0,375 / 0,0075 / 1,50); infrastructure changes "to improve cache hit rate" ([changelog](https://docs.fireworks.ai/updates/changelog)) | Yes: verdict 2. |
| 2026-10-01 | Managed reinforcement fine-tuning (RFT) paused; 70 models can no longer be fine-tuned; managed SFT and DPO continue; RL moves to the Training API ([changelog](https://docs.fireworks.ai/updates/changelog)) | Not now. |
| 2026-10-02, 10-07 | Rate-limit ceilings for "Small" models (under 600B parameters, including GLM 5.3 Flash, DeepSeek V4.1 Flash, GPT OSS 120B) raised twice, now 216M prompt tokens per minute ([changelog](https://docs.fireworks.ai/updates/changelog)) | Throttling by Fireworks is no longer a bench risk; LiteLLM's US$ 10 per day cap still is. |
| current | **Nemotron 3 Ultra** (NVFP4) serverless at 0,60 / 0,12 / 2,40, 262K context ([pricing](https://docs.fireworks.ai/serverless/pricing), [model page](https://fireworks.ai/models/fireworks/nemotron-3-ultra-nvfp4)) | Maybe: no independent agentic score yet; NVIDIA reports 54 % on Terminal-Bench 2.0 *(v)* ([NVIDIA blog](https://developer.nvidia.com/blog/nvidia-nemotron-3-ultra-powers-faster-more-efficient-reasoning-for-long-running-agents/)). |

Not on Fireworks: **GPT-6.1 Sol** is closed-weight and served by OpenAI, Azure and Bedrock, not Fireworks ([Artificial Analysis](https://artificialanalysis.ai/models/gpt-6-1-sol), [models.dev](https://models.dev/models/openai/gpt-6.1-sol/)); homelab already routes it through OpenAI. No GLM 5.4 and no DeepSeek newer than V4.1 exists on Fireworks or, as far as found, anywhere (*unverified* beyond Fireworks' library, [models](https://fireworks.ai/models)). Xiaomi's own API serves MiMo V2.6 Pro at 0,435 / – / 0,87 ([VentureBeat](https://venturebeat.com/technology/better-than-deepseek-xiaomis-mimo-v2-6-pro-debuts-as-the-top-open-weights-model-in-the-world-alongside-cheaper-v2-6-flash)); Xiaomi retires the V2.5 ids on 2026-10-21 ([MiMo changelog](https://mimo.mi.com/docs/en-US/updates/model)).

### Compared with what Ploeg uses

TB4 board of 2026-10-13. Fireworks prices from [serverless pricing](https://docs.fireworks.ai/serverless/pricing) unless marked.

| Model | Price | Context | TB4 | US$ per task → per solved task |
| --- | --- | --- | --- | --- |
| DeepSeek V4.1 Flash (bronze builder) | 0,30 / 0,006 / 1,20 | 262K *(training page)* | 19,7 % | 0,50 → **2,54** |
| GLM 5.3 Flash (reviewer, Ask) | 0,15 / 0,03 / 0,50 | 200K *(training page)* | **37,4 %** | 1,22 → **3,26** |
| GLM 5.3 | 1,40 / 0,26 / 4,40 | 262K | 38,9 % | 9,37 → 24,1 |
| MiMo V2.6 Pro | 0,435 / – / 0,87 (Xiaomi) | 1M | 31,3 % | 0,50 → 1,60 |
| GPT-6.1 Sol | 2 / 0,10 / 10 (OpenAI) | — | 55,1 % | 1,72 → 3,12 |
| Claude Haiku 5.5 | 0,10 / 0,01 / 0,50 (Anthropic, under 100K) | — | 36,4 % | 3,12 → 8,58 |
| Nemotron 3 Ultra | 0,60 / 0,12 / 2,40 | 262K | not listed | — |
| Ember-1 | 3,00 / 0,30 / 15,00 | 1M | 20,7 % | 19,48 → 94,1 |
| Kimi K3 | 3,00 / 0,30 / 15,00 | 192K | 17,2 % | 12,48 → 72,7 |
| Qwen 3.8 Max | 2,00 / 0,25 / 6,00 | — | 34,3 % | 10,63 → 31,0 |
| MiniMax M3 (`chat-default`) | 0,30 / 0,06 / 1,20 | — | 1,0 % | — |

Caveats: Vals does not say which price it charged per model; DeepSeek's US$ 0,50 per task may predate the 1 October price rise (*unverified*). TB4 runs one harness, not Ploeg's OpenHands loop. GLM 5.3 Flash spends more per task than its token price suggests because it uses more tokens; in Ploeg's own loop the order could differ.

### Discounts and other offers

- **Batch inference** is 50 % of serverless input and output ([serverless pricing](https://docs.fireworks.ai/serverless/pricing)). Useless for interactive Runs; useful for a planted-defect reviewer bench (RB-01) if the bench can submit requests in bulk.
- **Prompt caching** is automatic, exact-prefix only, lasts minutes to hours, and needs session affinity on serverless ([prompt caching guide](https://docs.fireworks.ai/guides/prompt-caching)). See verdict 3.
- **Serverless vs on-demand.** On-demand GPUs cost US$ 8 per hour for an H100 or H200, billed per second ([pricing](https://fireworks.ai/pricing)). At bronze's volume (a few dollars a week) serverless stays far cheaper.
- **Fine-tuning.** Managed RFT is paused; LoRA SFT on GLM 5.3 Flash and DeepSeek V4.1 Flash is available on the Training APIs ([changelog](https://docs.fireworks.ai/updates/changelog)); serving a fine-tuned model costs the base model's price ([pricing](https://fireworks.ai/pricing)). Not worth it before Ploeg has a few hundred judged Runs to train on.

## 2. Routing: sending easy work to a cheap model

### LiteLLM

- **Auto Router** (`model: auto_router/complexity_router`) gives callers one model name and maps each request to a tier, `SIMPLE`, `MEDIUM`, `COMPLEX` or `REASONING`, each pointing at a configured model ([Auto Router](https://docs.litellm.ai/docs/auto_router/), [setup](https://docs.litellm.ai/docs/auto_router/setup)). The tier is chosen by one of: a free local **heuristic** scorer (the default), an **LLM** judge (`classifier_type: llm`), an **OSS classifier** (self-hosted Laya or Bespoke Nimble, TypeSafe's hosted Jev, or Databricks `ai_decide`), keyword rules, or, since 1.105.0, any onboarded **decision model** ([decision classifiers](https://docs.litellm.ai/docs/auto_router/decision_classifiers), [v1.105.0 notes](https://docs.litellm.ai/release_notes/v1.105.0/v1-105-0)).
- **Coding-agent features**: `session_affinity` pins the tier for a session; `escalation_keywords` moves a request up one tier; oversized prompts escalate to a tier with a bigger context window; the classifier ignores Claude Code and Codex system text ([recommended configurations](https://docs.litellm.ai/docs/auto_router/recommended_configurations), [v1.102.0 notes](https://docs.litellm.ai/release_notes/v1.102.0/v1-102-0)).
- **Cache-aware routing**: `optional_pre_call_checks: ["prompt_caching", "deployment_affinity", "session_affinity"]` keeps a conversation on the deployment that holds its cache; 1.105.0 adds opt-in "prompt-cache cost routing" ([recommended configurations](https://docs.litellm.ai/docs/auto_router/recommended_configurations), [v1.105.0 notes](https://docs.litellm.ai/release_notes/v1.105.0/v1-105-0)).
- **Capability and Fuse v2 routers** arrived in 1.103.0 (a capability classifier; Fuse model presets) ([v1.103.0 notes](https://docs.litellm.ai/release_notes/v1.103.0/v1-103-0)). How Fuse decides is not documented in what could be read (*unverified*).
- **Licence limits**: without an enterprise licence, one tuned Auto Router, one Capability router and one Fuse v2 router ([v1.102.0](https://docs.litellm.ai/release_notes/v1.102.0/v1-102-0), [v1.103.0](https://docs.litellm.ai/release_notes/v1.103.0/v1-103-0)).
- **Claimed savings**: 37–69 % over caching alone across five datasets, and 51,1 % over four months in one production case ([Auto Router](https://docs.litellm.ai/docs/auto_router/)). Vendor-reported, measured against an all-frontier baseline; Ploeg's baseline is already a cheap model.
- **Budgets and fallbacks**: since 1.103.0 every fallback target is re-checked against the caller's budget and unaffordable targets are skipped ([v1.103.0](https://docs.litellm.ai/release_notes/v1.103.0/v1-103-0)); fallback targets outside a key's allowed models are skipped by default (`general_settings.enforce_fallback_model_access`, version not stated, [reliability docs](https://docs.litellm.ai/docs/proxy/reliability)); per-key `disable_fallbacks` exists and Ploeg uses it. 1.104.0 adds team routing controls: group-scoped priority, time-windowed reservation of deployments for a team, provider-affinity headers ([v1.104.0 notes](https://docs.litellm.ai/release_notes/v1.104.0/v1-104-0)); config keys not read.

### Fireworks

- **FireRouter** (`firerouter/opus`, since 2026-09-28) routes each new user turn between Claude Opus 5.5 and GLM 5.3 or GLM 5.3 Flash; the chosen model serves the whole turn including tool calls. A preference from 1 (max intelligence) to 5 (max savings) tunes it. You pay the chosen model's price; Opus turns bill to your own Anthropic account. Fireworks claims "57 % lower cost per coding session at 98,1 % of Opus accuracy" without a method ([model page](https://fireworks.ai/models/fireworks/firerouter-opus), [FireRouter docs](https://docs.fireworks.ai/nexus/firerouter)).
- **`auto`** routes among GLM 5.3, GLM 5.3 Flash and Kimi K3; **`auto-instant`** uses GLM 5.3 Flash and falls over when it is slow. Fireworks chooses and changes the models ([FireRouter docs](https://docs.fireworks.ai/nexus/firerouter)). LiteLLM accepts the short ids from 1.105.0, and `accounts/fireworks/routers/<id>` before that ([LiteLLM PR #43641](https://github.com/BerriAI/litellm/pull/43641)).

### What fits Ploeg

Ploeg already makes the cheap-or-strong choice once per Run, by Role and Team. What it lacks is a reason to pick per Work Item. The evidence in the [11 October record](2026-10-11-agentic-models-and-topology.md#3-which-shape-a-team-should-have) says escalation only works when the cheap model does not decide it itself. So:

1. **Decide per Work Item, before the Run, in Ploeg.** Inputs: Size, labels, and a cheap classifier's answer to typed questions ("does the brief name the files to change?", "is this a refactor across modules?"). The answer picks the Team or the builder model and is recorded on the Shift.
2. **Escalate on outcome, not on self-report.** A Shift that fails its review twice on the cheap builder gets its next Shift on the strong builder. Ploeg already has the capped review loop to detect this.
3. **Use LiteLLM's router only where per-request choice is harmless**: Open WebUI chat and the brain evaluation, not Runs.

## 3. Decision, judge and reward models

| What | Where | Price | Use for Ploeg |
| --- | --- | --- | --- |
| **Decisions API** `/v1/decisions` (OpenAI format) and `/v1/systemone` (named questions): typed yes/no, choice and score answers, up to 128 questions per call, with keys, budgets and spend tracking | LiteLLM 1.104.2 and 1.105.0 ([v1.104.2 notes](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2)) | per model | The premise check and Size triage, once on 1.105.x |
| `perplexity/pplx-decider-v1-27b` | Perplexity | 0,04 in / 0 out, 262K | Cheapest hosted decider; US provider, client code off-limits until [VIK-1651](https://vikunja.webgrip.dev/tasks/1651) |
| `cloudflare/clef`, `clef-flash` | Cloudflare | 0,24 / 0,09 in, 0 out, 65K | Same caveat |
| `openai/gpt-6-luna` on `/v1/decisions` | OpenAI | not read | — |
| Laya, Bespoke Nimble 9B, Strands Decider 2B | self-hosted | GPU only | Possible on Hetzner later |
| `decision_model` guardrail: admin-written yes/no questions screen messages and tool-call arguments, block or log above a threshold | LiteLLM 1.105.0 ([v1.105.0 notes](https://docs.litellm.ai/release_notes/v1.105.0/v1-105-0)) | per decision call | A cheap tripwire on tool calls; not needed now |
| **FARE-20B**: evaluator fine-tuned from gpt-oss-20b for pairwise comparison, step scoring and verification | Fireworks, dedicated GPUs only ([model page](https://fireworks.ai/models/fireworks/fare-20b)) | ~0,90 in and out per aggregators (*unverified*) | Candidate selector for best-of-two, which is parked |
| gpt-oss-safeguard-120b / 20b, Llama Guard | Fireworks | — | Safety classification, not difficulty |
| **Nemotron 3.5 Lightning 30B A3B** | Fireworks serverless | 0,05 / 0,01 / 0,20 | Cheapest Fireworks model for a classifier prompt with structured output; already configured as `fireworks-nemotron-lightning` |
| GLM 5.3 Flash | Fireworks serverless | 0,15 / 0,03 / 0,50 | A known-good classifier from the reviewer's family |

"Microsoft-Decision-1", named in the 1.106.0-rc.1 release title, could not be found in the readable notes (*unverified*). No Fireworks model is sold as a reward or "router" model apart from FireRouter itself. Fireworks' own judge example uses Qwen3 235B ([blog](https://fireworks.ai/blog/model-as-judge)).

A premise check with ten typed questions over a 4.000-token brief costs about US$ 0,0002 on Nemotron 3.5 Lightning or US$ 0,0006 on GLM 5.3 Flash: noise next to US$ 0,52 per Work Item.

## 4. Other LiteLLM changes since v1.102

### Releases

| Version | Date | Kind |
| --- | --- | --- |
| v1.102.4 | 2026-10-08 | stable backport on the line homelab runs |
| v1.103.0 | 2026-09-27 | stable |
| v1.104.0 / .2 / .3 | 2026-10-03 / 10-08 / 10-11 | stable |
| v1.105.0 / .1 | 2026-10-11 / 10-14 | stable, latest |
| v1.106.0-rc.2 | 2026-10-13 | pre-release |

Sources: [GitHub releases](https://github.com/BerriAI/litellm/releases), [release notes index](https://docs.litellm.ai/release_notes/).

### Security advisories

| Advisory | Severity | Affects v1.102.1? |
| --- | --- | --- |
| [GHSA-7hp6-4w63-5g45](https://github.com/BerriAI/litellm/security/advisories/GHSA-7hp6-4w63-5g45), `internal_user` to `proxy_admin` through the shared salt key, 2026-09-30 | Critical 9.9 | **Yes**, fixed in 1.102.2. Workaround `EXPERIMENTAL_UI_LOGIN=false` breaks CLI SSO. |
| [GHSA-g5ff-637f-6q2m](https://github.com/BerriAI/litellm/security/advisories/GHSA-g5ff-637f-6q2m), local file read via `vertex_ai_credentials`, 2026-10-01 | High 8.1 | No, below 1.95.0 only |
| [GHSA-3cv6-jpf6-8222](https://github.com/BerriAI/litellm/security/advisories/GHSA-3cv6-jpf6-8222) (CVE-2026-84377), SSRF via request-body routing parameters, 2026-08-26 | Moderate 6.5 | No, below 1.94.0 only |
| [GHSA-hhww-mrg2-969h](https://github.com/BerriAI/litellm/security/advisories/GHSA-hhww-mrg2-969h), XSS in `/sso/debug/callback`, 2026-09-30 | Moderate 6.8 | No, below 1.85.0 only |

Only the first page of advisories was read. 1.105.0 also closes `/sso/debug/*` by default and keeps request bodies and credentials out of errors and logs ([v1.105.0 notes](https://docs.litellm.ai/release_notes/v1.105.0/v1-105-0)).

### What a move from 1.102.x to 1.105.x needs

Breaking changes that touch homelab or Ploeg, each from the release notes linked above:

- **stdio MCP servers are off by default from 1.104.0.** Homelab defines six; set `LITELLM_ENABLE_MCP_STDIO=true` or move them to HTTP. Turning them off is also a defence against the advisory above.
- **Weak or missing master key refuses to start** (1.104.0). Check the key in OpenBao before the upgrade.
- **An exhausted budget returns HTTP 422 instead of 429** (1.104.0; `litellm_settings.budget_exceeded_status_code: 429` restores it). Harnesses stop retrying a spent budget, which Ploeg wants; check how Ploeg's worker reports a Run that hit 422.
- **Spend-log index** (1.103.0): build it with `CREATE INDEX CONCURRENTLY` first, or writes block while it builds at start-up.
- **A proxy with failing migrations no longer starts** (1.104.0, enforced in 1.105.0).
- **Organisation and project `max_budget: 0` now means zero**, use `null` for unlimited; a key's per-model rpm/tpm overrides the team's (1.103.0).
- **Runtime edits to keys `config.yaml` declares are refused** (1.103.0). Homelab is GitOps-driven, so this helps.
- **From 1.106.0**: the caller's LiteLLM key is never forwarded to MCP servers, and the response cache skips requests with more than four messages ([v1.106.0-rc.1](https://docs.litellm.ai/release_notes/v1.106.0rc1/v1-106-0-rc-1)). Check the omnigraph MCP servers' auth before then.

### Changes worth having

- **Pricing**: the bundled map prices `fireworks_ai/deepseek-v4p1-flash` at 0,30 / 0,006 / 1,20 from 1.105.0, and has `fireworks_ai/glm-5p3-flash` from 1.104.0. Cached input defaults to 50 % off when no cache rate is listed (1.103.0). Lifetime `total_spend` on keys, budget re-checks on fallback targets and per-member organisation spend (1.103.0); "count provider budget spend on every API surface" (1.105.0), which matters for the US$ 10 per day Fireworks cap.
- **MCP gateway**: guardrails on MCP tool calls and a `search_tools` / `get_tool_schema` / `call_tool` proxy mode (1.102.0); client allowlisting and live session force-close (1.103.0); upstream tool descriptions scanned and pinned (1.105.0).
- **Agent gateway (A2A)**: agent identities, Entra ID delegation, Microsoft Foundry agents at `/a2a/*` (1.103.0, 1.105.0). Not needed, as the earlier record concluded.
- **Observability**: per-project, per-model rate-limit gauges in Prometheus (1.106.0-dev.3); **Lens**, an OTLP trace store on ClickHouse with SQL over agent traces, in beta (1.105.0). Not worth a ClickHouse for now.
- **`litellm.agent()`** in the SDK runs Claude Code, Codex and OpenCode through the gateway (1.105.0). Not relevant to Ploeg's Go worker.

## Plan

Ordered by urgency. Model spend is zero unless stated.

1. **Today:** homelab pull request, LiteLLM `v1.102.1` → `v1.102.4`.
2. **This week:** read-only spend-log query for the cache-hit share per model, and the VIK-1617 query re-run for Shifts opened after 1 October.
3. **Next:** a planned upgrade to 1.105.x with the checklist above, ideally after the stdio MCP servers move to HTTP.
4. **With VIK-1617's next run:** cost per merged Work Item for Shifts opened after 1 October, so the DeepSeek price rise is in the number.
5. **With VIK-1621 (owner approves the spend):** add GLM 5.3 Flash as a builder; pair it with a non-GLM reviewer.
6. **With VIK-1678:** record the routing stance (per Work Item, in Ploeg, escalation on outcome) and the premise check on a cheap classifier; try the Decisions API once on 1.105.x.
7. **Optional:** point `chat-default` at GLM 5.3 Flash or Fireworks `auto` instead of MiniMax M3.

## Sources

LiteLLM: <https://github.com/BerriAI/litellm/releases>, <https://docs.litellm.ai/release_notes/>, <https://docs.litellm.ai/release_notes/v1.102.0/v1-102-0>, <https://docs.litellm.ai/release_notes/v1.103.0/v1-103-0>, <https://docs.litellm.ai/release_notes/v1.104.0/v1-104-0>, <https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2>, <https://docs.litellm.ai/release_notes/v1.105.0/v1-105-0>, <https://docs.litellm.ai/release_notes/v1.106.0rc1/v1-106-0-rc-1>, <https://docs.litellm.ai/docs/auto_router/>, <https://docs.litellm.ai/docs/auto_router/setup>, <https://docs.litellm.ai/docs/auto_router/decision_classifiers>, <https://docs.litellm.ai/docs/auto_router/recommended_configurations>, <https://docs.litellm.ai/docs/proxy/reliability>, <https://docs.litellm.ai/docs/proxy/custom_pricing>, <https://github.com/BerriAI/litellm/pull/43641>, <https://github.com/BerriAI/litellm/security/advisories>.

Fireworks: <https://docs.fireworks.ai/updates/changelog>, <https://docs.fireworks.ai/serverless/pricing>, <https://fireworks.ai/pricing>, <https://docs.fireworks.ai/serverless/us-only-serverless>, <https://docs.fireworks.ai/guides/prompt-caching>, <https://docs.fireworks.ai/nexus/firerouter>, <https://fireworks.ai/models>, <https://fireworks.ai/models/fireworks/firerouter-opus>, <https://fireworks.ai/models/fireworks/mimo-v2p6-pro-rl>, <https://fireworks.ai/models/fireworks/nemotron-3-ultra-nvfp4>, <https://fireworks.ai/models/fireworks/fare-20b>, <https://fireworks.ai/blog/DeepSeek-V4.1-Flash-Astra>, <https://fireworks.ai/blog/model-as-judge>.

Benchmarks and models: <https://www.vals.ai/benchmarks/terminal-bench-4>, <https://www.marktechpost.com/2026/09/28/fireworks-ai-releases-ember-1-a-post-trained-kimi-k3-that-uses-about-40-fewer-tokens/>, <https://developer.nvidia.com/blog/nvidia-nemotron-3-ultra-powers-faster-more-efficient-reasoning-for-long-running-agents/>, <https://venturebeat.com/technology/better-than-deepseek-xiaomis-mimo-v2-6-pro-debuts-as-the-top-open-weights-model-in-the-world-alongside-cheaper-v2-6-flash>, <https://mimo.mi.com/docs/en-US/updates/model>, <https://artificialanalysis.ai/models/gpt-6-1-sol>, <https://models.dev/models/openai/gpt-6.1-sol/>.

Second-hand or unconfirmed: FARE-20B's price comes from aggregators; how Fuse routes, when `enforce_fallback_model_access` arrived, and "Microsoft-Decision-1" could not be confirmed. That LiteLLM 1.102.1 honours `model_info` prices for config-defined models was checked in its code and in the running image, not against recorded spend.
