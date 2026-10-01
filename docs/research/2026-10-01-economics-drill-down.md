# Economics drill-down

Status: research record, 2026-10-01. It checks the decided pricing model in [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md) against what Glide runs today, and turns the gaps into spikes and tickets on the Glide board. It decides what to measure and in which order. It changes no accepted number: every change to ADR-0006 below is **proposed**.

## What exists

| Layer | State on development @ 40b2339 |
| --- | --- |
| Decisions | ADR-0005 to ADR-0010 accepted 2026-09-29; ADR-0006 holds the full price table |
| Research | [Agency pricing strategy](2026-09-29-agency-pricing-strategy.md), [fair credit pricing](2026-09-29-fair-credit-pricing.md) and their evidence folders. External figures came from search summaries |
| Tickets | VIK-1468 to VIK-1501. The billing set (1487 to 1495, 1498, 1499) is all `phase/2-hosted` and `needs-refinement` |
| Code | Ploeg authorizes and settles a Shift pool and per-Run caps in US$, from LiteLLM's settled spend (`pkg/store/shift.go` `ClaimRoleWithin`, `pkg/store/llm_accounts.go`). A merge sets the Work Item `done` (`pkg/shiftengine/review.go`). Vloer shows spend per Shift and Run. There are no Sizes, Quotes, credits, euros, markup, acceptance timer, tenants or billing |
| Measurement | KPIs K2 (cost per ready pull request) and K5 (clean-merge rate) are on the Glide — Loop dashboard ([KPIs](../reference/kpis.md)). The only baseline ([2026-09-27](2026-09-27-loop-baseline.md)) could not compute cost per merged pull request |

## Findings

1. **The pricing assumes models Glide does not run.** The research sized Shift Budgets for Sonnet-class models at US$ 2 / 10 per million tokens. Production Teams run Fireworks open-weight models: bronze writes with DeepSeek V4.1 Flash ($8 pool, $2.00 builder cap) and reviews with GLM 5.3 Flash ($0.40 cap); silver writes with `deepseek-chat` ($6 pool). Reported Fireworks prices are US$ 0,22 / 0,007 cached / 0,66 for DeepSeek V4 Flash and 0,15 / 0,03 / 0,50 for GLM 5.3 Flash ([usagepricing.com](https://www.usagepricing.com/ai-token-pricing/fireworks/deepseek-v4-flash-fireworks), [yottalabs](https://www.yottalabs.ai/post/deepseek-v4-1-flash-vs-glm-5-3-flash-2026); not checked on Fireworks' own page). With the research's S token shape, an S Shift costs about US$ 0,15, against US$ 1 to 1,5 assumed.
2. **The delivery rate is unmeasured, and open-weight is the low case.** The research's own estimate for open-weight models is 35 to 40 %, below ADR-0006's 55 % planning rate.
3. **The €12 floor has lost its derivation.** It was worst-case token cost ÷ 0.7, from when Glide absorbed failed-attempt tokens. Under the two-part price the agency pays every attempt's tokens, so the delivery fee is close to pure margin. The floor should follow fixed cost and volume (model below).
4. **At open-weight cost the markup is not a revenue line.** 25 % of US$ 0,15 is about € 0,04 per attempt. Markup Tiers (VIK-1491) may cost more to build than they ever return.
5. **Review time, not tokens, sets the agency's economics.** See the model.
6. **Currencies do not meet.** Ploeg settles in US$; every price is in euro. Nothing defines the rate or when it is fixed.
7. **Spend for the Fireworks models may be unpriced.** The LiteLLM config (`webgrip/homelab-cluster`, `kubernetes/apps/ai/litellm/app/litellm-config.configmap.yaml`) sets `input_cost_per_token` for `deepseek-chat` but not for the two Fireworks aliases. Their spend comes from LiteLLM's built-in price map, which has to be checked against the Fireworks bill before any K2 number is trusted.
8. **The 90-day plan in the strategy note does not fit phase 1.** It assumes 5 design-partner agencies and 200 tickets by 29 October 2026. Phase 1 is the owner's backlog and the employer's, at about 28 hours a week.
9. **Not economics, but found here:** `deepseek-chat` routes to DeepSeek's own API (`deepseek/deepseek-flash`). The legal evidence says never to send client data there. Silver works on `webgrip/glide` only today; no employer code may reach a Team that uses it.

## Model

The per-ticket model behind findings 1, 4 and 5. All inputs are assumptions until VIK-1617, VIK-1621 and VIK-1272 measure them.

Per Run, an S ticket moves 0.5 M input tokens (80 % cached) and 20 K output; a Shift is 4 Runs (writer, reader, fix, reader). The agency sells the ticket at €150, pays the €15 delivery fee on acceptance and tokens at cost × 1.25 on every attempt, spends 15 minutes on client handling and 30 minutes reviewing each pull request that reaches a human, at a loaded €50 per hour. 60 % of failed attempts reach human review; the rest stop inside Ploeg. Failures are returned to the client uncharged. The baseline is hourly work: 2 hours at €105, a €110 margin, €55 per senior hour.

| Tier | US$ per Shift | Delivery | Tokens per accepted ticket | Human hours per accepted ticket | Agency margin | Per senior hour |
| --- | --- | --- | --- | --- | --- | --- |
| Open-weight (DeepSeek V4 Flash) | 0,15 | 38 % | € 0,50 | 1,24 | € 72,53 | € 58,51 |
| Open-weight | 0,15 | 70 % | € 0,27 | 0,88 | € 90,80 | € 103,35 |
| Frontier (Sonnet 5 / GPT-6 Sol, EU +10 %) | 2,11 | 55 % | € 4,80 | 1,00 | € 80,43 | € 80,79 |
| Frontier | 2,11 | 70 % | € 3,77 | 0,88 | € 87,30 | € 99,37 |

*US$ treated as euro, as the strategy note does.*

What follows from it:

* Human review is €44 to €62 of the agency's cost per accepted ticket; tokens are at most €5. The levers are the delivery rate and the share of failures Ploeg stops before a human sees them.
* At today's estimates a frontier Team earns the agency more per senior hour than an open-weight one, despite 14 times the token cost. The default model tier is a delivery-rate question (VIK-1621), not a token-price question.
* Glide's revenue is the delivery fee and the platform fee. The floor is the price at which those cover fixed cost: `floor ≥ (fixed cost per month ÷ credits per month + variable cost per credit) ÷ (1 − target margin)`. With €1 variable cost and a 30 % margin, €12 holds from about 1.000 credits a month at €8.000 fixed cost, and from about 200 at €2.000. Which fixed cost applies, including the owner's pay, is the owner's input (VIK-1623).

## Decisions

Made here, because they only order and scope work:

* Phase 1 measures, it does not bill. The first number to produce is US$ per merged Work Item and the merge rate from real Shifts (VIK-1617), then the same per model tier (VIK-1621).
* Size is recorded from a tracker label now (VIK-1622), so phase-1 data can later be split the way ADR-0006 prices it. The Refinement Role (VIK-1477) writes the same field later.
* No billing ticket is refined or built until the pricing re-derivation (VIK-1623) has run. Markup Tiers (VIK-1491) wait on it.

Proposed, for the owner to accept or reject:

* Re-derive the €12 floor from fixed cost and volume, using the formula above (VIK-1623).
* Set Shift Budgets per Size from measured p90 Shift cost per model tier, replacing €4 / €10 / €20 (VIK-1623).
* Convert provider US$ to euro at the ECB reference rate of the settlement day, store the rate on each charge, and absorb the currency risk in the markup (VIK-1625).
* Replace the strategy note's 90-day plan with a phase-1 gate measured on the owner's and the employer's backlogs: at least 20 settled S Shifts, a measured acceptance rate and US$ per accepted S, and review minutes per pull request.

## Spikes and tickets

| Ticket | Phase | What it decides or delivers | Waits on |
| --- | --- | --- | --- |
| [VIK-1617](https://vikunja.webgrip.dev/tasks/1617) spike: measure cost and merge rate per Work Item since rc.16 | 1 | Whether the ADR-0006 planning numbers survive measured data | read access to Ploeg's database |
| [VIK-1621](https://vikunja.webgrip.dev/tasks/1621) spike: bench open-weight vs frontier Teams | 1 | Default model tier and Shift Budget per Size | VIK-1617 |
| [VIK-1622](https://vikunja.webgrip.dev/tasks/1622) ploeg: K2 and K5 by Size from a size label | 1 | Size-split measurement | — |
| [VIK-1272](https://vikunja.webgrip.dev/tasks/1272) vloer: report active review seconds (existing) | 1 | Review minutes, the largest agency cost | — |
| [VIK-1623](https://vikunja.webgrip.dev/tasks/1623) spike: re-derive floor, Shift Budgets and markup | 2 | Proposed ADR-0006 amendment | VIK-1617, VIK-1621, VIK-1486 |
| [VIK-1624](https://vikunja.webgrip.dev/tasks/1624) spike: agency break-even under the two-part price | 2 | Client price band and an interactive calculator for pilots | VIK-1617, VIK-1621, VIK-1272 |
| [VIK-1625](https://vikunja.webgrip.dev/tasks/1625) billing: convert US$ to euro at settlement | 2 | Currency rule on every charge | — |

## Method

Read on 2026-10-01: ADR-0005 and ADR-0006, the research notes and evidence above, the KPI page and 2026-09-27 baseline, the Glide board tickets VIK-1468 to VIK-1501, the Ploeg and Vloer source for budgets, settlement and spend display, and the Ploeg and LiteLLM desired state in `webgrip/homelab-cluster`. Production data was not read. Fireworks prices come from secondary pages because the Fireworks pricing page does not list serverless inference rates.
