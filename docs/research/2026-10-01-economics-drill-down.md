# Economics drill-down

Status: research record, 2026-10-01. It checks the decided pricing model in [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md) against what Glide runs today, and turns the gaps into spikes and tickets on the Glide board. It decides what to measure and in which order. The owner's decisions on its findings are listed under Decisions and recorded in ADR-0006.

## What exists

| Layer | State on development @ 40b2339 |
| --- | --- |
| Decisions | ADR-0005 to ADR-0010 accepted 2026-09-29; ADR-0006 holds the full price table |
| Research | [Agency pricing strategy](2026-09-29-agency-pricing-strategy.md), [fair credit pricing](2026-09-29-fair-credit-pricing.md) and their evidence folders. External figures came from search summaries |
| Tickets | VIK-1468 to VIK-1501. The billing set (1487 to 1495, 1498, 1499) is all `phase/2-hosted` and `needs-refinement` |
| Code | Ploeg authorizes and settles a Shift pool and per-Run caps in US$, from LiteLLM's settled spend (`pkg/store/shift.go` `ClaimRoleWithin`, `pkg/store/llm_accounts.go`). A merge sets the Work Item `done` (`pkg/shiftengine/review.go`). Unfold shows spend per Shift and Run. There are no Sizes, Quotes, credits, euros, markup, acceptance timer, tenants or billing |
| Measurement | KPIs K2 (cost per ready pull request) and K5 (clean-merge rate) are on the Glide — Loop dashboard ([KPIs](../reference/kpis.md)). The only baseline ([2026-09-27](2026-09-27-loop-baseline.md)) could not compute cost per merged pull request |

## Findings

1. **The pricing assumes models Glide does not run.** The research sized Shift Budgets for Sonnet-class models at US$ 2 / 10 per million tokens. Production Teams run Fireworks open-weight models: bronze writes with DeepSeek V4.1 Flash ($8 pool, $2.00 builder cap) and reviews with GLM 5.3 Flash ($0.40 cap); silver writes with `deepseek-chat` ($6 pool). Fireworks' [Serverless Pricing](https://docs.fireworks.ai/serverless/pricing) page lists US$ 0,30 / 0,006 cached / 1,20 per million tokens for DeepSeek V4.1 Flash and 0,15 / 0,03 / 0,50 for GLM 5.3 Flash. With the research's S token shape, an S Shift costs about US$ 0,23, against US$ 1 to 1,5 assumed.
2. **The delivery rate is unmeasured, and open-weight is the low case.** The research's own estimate for open-weight models is 35 to 40 %, below ADR-0006's 55 % planning rate.
3. **The €12 floor has lost its derivation.** It was worst-case token cost ÷ 0.7, from when Glide absorbed failed-attempt tokens. Under the two-part price the agency pays every attempt's tokens, so the delivery fee is close to pure margin. The floor should follow fixed cost and volume (model below).
4. **At open-weight cost the markup is not a revenue line.** 25 % of US$ 0,23 is about € 0,06 per attempt. Markup Tiers (VIK-1491) may cost more to build than they ever return.
5. **Review time, not tokens, sets the agency's economics.** See the model.
6. **Currencies do not meet.** Ploeg settles in US$; every price is in euro. Nothing defines the rate or when it is fixed.
7. **Bronze's builder spend was recorded about a third low.** The Fireworks aliases had no price in the LiteLLM config (`webgrip/homelab-cluster`, `kubernetes/apps/ai/litellm/app/litellm-config.configmap.yaml`), so their spend came from LiteLLM v1.102.1's built-in price map. That map prices `deepseek-v4p1-flash` at the older DeepSeek V4 Flash 0731 rate (US$ 0,22 / 0,007 / 0,66), so a builder Run was recorded at about US$ 0,038 instead of about US$ 0,056. The other Fireworks aliases match Fireworks' page. The homelab-cluster change that adds the new frontier models pins the correct price; K2 and Shift spend before it are low by that factor.
8. **The 90-day plan in the strategy note does not fit phase 1.** It assumes 5 design-partner agencies and 200 tickets by 29 October 2026. Phase 1 is the owner's backlog and the employer's, at about 28 hours a week.
9. **Not economics, but found here:** `deepseek-chat` routes to DeepSeek's own API (`deepseek/deepseek-flash`). The legal evidence says never to send client data there. Silver works on `webgrip/glide` only today; no employer code may reach a Team that uses it.

## Model

The per-ticket model behind findings 1, 4 and 5. All inputs are assumptions until VIK-1617, VIK-1621 and VIK-1272 measure them.

Per Run, an S ticket moves 0.5 M input tokens (80 % cached) and 20 K output; a Shift is 4 Runs (writer, reader, fix, reader). The agency sells the ticket at €150, pays the €15 delivery fee on acceptance and tokens at cost × 1.25 on every attempt, spends 15 minutes on client handling and 30 minutes reviewing each pull request that reaches a human, at a loaded €50 per hour. 60 % of failed attempts reach human review; the rest stop inside Ploeg. Failures are returned to the client uncharged. The baseline is hourly work: 2 hours at €105, a €110 margin, €55 per senior hour.

| Tier | US$ per Shift | Delivery | Tokens per accepted ticket | Human hours per accepted ticket | Agency margin | Per senior hour |
| --- | --- | --- | --- | --- | --- | --- |
| Open-weight (DeepSeek V4.1 Flash) | 0,23 | 38 % | € 0,74 | 1,24 | € 72,28 | € 58,32 |
| Open-weight | 0,23 | 70 % | € 0,40 | 0,88 | € 90,67 | € 103,20 |
| Frontier (Sonnet 5 / GPT-6 Sol, EU +10 %) | 2,11 | 55 % | € 4,80 | 1,00 | € 80,43 | € 80,79 |
| Frontier | 2,11 | 70 % | € 3,77 | 0,88 | € 87,30 | € 99,37 |

*US$ treated as euro, as the strategy note does.*

What follows from it:

* Human review is €44 to €62 of the agency's cost per accepted ticket; tokens are at most €5. The levers are the delivery rate and the share of failures Ploeg stops before a human sees them.
* At today's estimates a frontier Team earns the agency more per senior hour than an open-weight one, despite 14 times the token cost. The default model tier is a delivery-rate question (VIK-1621), not a token-price question.
* Glide's revenue is the delivery fee and the platform fee. The floor is the price at which those cover fixed cost: `floor ≥ (fixed cost per month ÷ credits per month + variable cost per credit) ÷ (1 − target margin)`. With €1 variable cost and a 30 % margin, €12 holds from about 1.000 credits a month at €8.000 fixed cost, and from about 200 at €2.000. Which fixed cost applies, including the owner's pay, is the owner's input (VIK-1623).

## Providers

Three evidence notes compare the routes Glide could use: [Fireworks](evidence/2026-10-01-inference-providers/fireworks.md), [open-weight providers](evidence/2026-10-01-inference-providers/open-weight-providers.md) and [frontier models](evidence/2026-10-01-inference-providers/frontier-models.md). What matters for the economics:

* **Fireworks cannot promise EU processing.** Data residency is an Enterprise feature, the only self-serve region is the US, and EU-only serverless is "contact sales". Its data terms are otherwise good: no retention by default, no training, EU SCCs in the DPA. Prices moved without notice in August and September 2026.
* **EU-resident open-weight inference costs more, but still little.** Per Run: about US$ 0,03 for DeepSeek V4 Flash through OpenRouter's EU endpoint, €0,04 to €0,09 from EU-owned vendors contracting directly (T-Systems, OVHcloud, Scaleway), and US$ 0,28 for GLM 5.3 hosted by Mistral in France. Providers that do not discount cached input cost 3 to 5 times their list price for this workload.
* **Frontier models cost about US$ 0,50 per Run and 10 % more in the EU.** Sonnet 5.5 costs US$ 0,53 per Run (EU US$ 0,58 through Bedrock or Vertex; the direct Anthropic API has no EU option). GPT-6.1 Sol costs US$ 0,49 (EU US$ 0,54 through OpenAI's EU endpoint). On Vals' independent Terminal-Bench 4.0 run, Sonnet 5.5 solved 64,1 % and GPT-6.1 Sol 55,1 %, but GPT-6.1 Sol spent about a tenth of the tokens per task. Token counts per Run differ by model, so VIK-1621 measures them.
* **Google's newest model, Gemini 4 Argon (30 September 2026), cannot be called yet.** The newest callable one is Gemini 3.8 Flash at US$ 0,18 per Run, at a promotional price that doubles on 1 January 2027.
* **Every route that keeps client code in the EU raises Glide's token cost, not its margin.** Under the two-part price the agency pays tokens, so the route is a compliance decision first (VIK-1651).

## Decisions

Taken by the owner on 2026-10-01, after this record's findings:

* **Measurement:** Ploeg exports cost and outcome per Work Item on its operator API, so the baseline (VIK-1617) can be re-run without database access ([VIK-1686](https://vikunja.webgrip.dev/tasks/1686)).
* **Client code:** only Mistral-hosted GLM 5.3 (France) may process employer or agency client code, once its DPA and EU terms are read in full (VIK-1651), through a LiteLLM alias ([VIK-1688](https://vikunja.webgrip.dev/tasks/1688)). Every other route is own-code only.
* **Silver** moves from DeepSeek's own API to Fireworks DeepSeek V4.1 Flash.
* **Bench:** bronze against Sonnet 5.5 and GPT-6.1 Sol, judged blind in Unfold (VIK-1621, [VIK-1687](https://vikunja.webgrip.dev/tasks/1687)).
* **Size** comes from a tracker label on Vikunja and a custom field on ClickUp, both in VIK-1622.
* **Markup:** a flat 25%; Markup Tiers are dropped (ADR-0006, dated entry). VIK-1491 is closed.
* **Shift Budgets:** per model tier and Size from the measured p90 Shift cost; €4 / €10 / €20 until measured (ADR-0006).
* **Currency:** the ECB reference rate of the settlement day, stored on each charge; the markup absorbs the exchange risk (ADR-0006, VIK-1625).
* **Plan:** a phase-1 gate replaces the strategy note's 90-day dates: at least 20 settled S Shifts on the owner's and the employer's backlogs, a measured acceptance rate, US$ per accepted S Shift and review minutes per pull request. Outreach to agencies starts after it.
* **Floor:** VIK-1623 builds the fixed-cost sheet and asks the owner only for a target pay.

Made in this record, because they only order work: phase 1 measures and does not bill, and no billing ticket is refined before VIK-1623 has run.

## Spikes and tickets

| Ticket | Phase | What it decides or delivers | Waits on |
| --- | --- | --- | --- |
| [VIK-1617](https://vikunja.webgrip.dev/tasks/1617) spike: measure cost and merge rate per Work Item since rc.16 | 1 | Whether the ADR-0006 planning numbers survive measured data | VIK-1686 |
| [VIK-1621](https://vikunja.webgrip.dev/tasks/1621) spike: bench open-weight vs frontier Teams | 1 | Default model tier and Shift Budget per Size | VIK-1617 |
| [VIK-1622](https://vikunja.webgrip.dev/tasks/1622) ploeg: K2 and K5 by Size from a size label | 1 | Size-split measurement | — |
| [VIK-1272](https://vikunja.webgrip.dev/tasks/1272) vloer: report active review seconds (existing) | 1 | Review minutes, the largest agency cost | — |
| [VIK-1623](https://vikunja.webgrip.dev/tasks/1623) spike: re-derive floor and Shift Budgets | 2 | Floor formula and per-tier Budgets as a proposed ADR-0006 amendment | VIK-1617, VIK-1621, VIK-1486 |
| [VIK-1624](https://vikunja.webgrip.dev/tasks/1624) spike: agency break-even under the two-part price | 2 | Client price band and an interactive calculator for pilots | VIK-1617, VIK-1621, VIK-1272 |
| [VIK-1625](https://vikunja.webgrip.dev/tasks/1625) billing: convert US$ to euro at settlement | 2 | Currency rule on every charge | — |
| [VIK-1651](https://vikunja.webgrip.dev/tasks/1651) spike: choose the EU-resident inference route for client code | 1 | Which Teams may take client code, on which provider | — |
| [VIK-1686](https://vikunja.webgrip.dev/tasks/1686) ploeg: report cost and outcome per Work Item | 1 | The data VIK-1617 reads | — |
| [VIK-1687](https://vikunja.webgrip.dev/tasks/1687) vloer: hide the Team on bench pull requests | 1 | Blind judging for VIK-1621 | — |
| [VIK-1688](https://vikunja.webgrip.dev/tasks/1688) litellm: add Mistral-hosted GLM 5.3 | 1 | The client-code route | VIK-1651 |
| [VIK-1652](https://vikunja.webgrip.dev/tasks/1652) litellm: raise the Gemini 3.8 Flash price on 2027-01-01 | — | Spend stays correct after the promotion | due 2026-12-31 |

## Method

Read on 2026-10-01: ADR-0005 and ADR-0006, the research notes and evidence above, the KPI page and 2026-09-27 baseline, the Glide board tickets VIK-1468 to VIK-1501, the Ploeg and Unfold source for budgets, settlement and spend display, and the Ploeg and LiteLLM desired state in `webgrip/homelab-cluster`. Production data was not read. Provider prices were read on the vendors' pages where they render, and are marked otherwise in the evidence notes.
