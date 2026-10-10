---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# The ticket is the billing unit: a quoted, capped Shift budget charged on delivery

## Context and Problem Statement

Agencies sell hours, and hours stop meaning anything when agents do the work: a faster agent earns less. Unfold needs a unit that is fair to the agency's client, predictable for the agency and profitable for us. Ploeg already authorizes a budget before a Shift and settles it afterwards ([Ploeg ADR-0012](../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md)). What do we charge for?

## Decision Drivers

* The client knows the price before approving the work.
* The client never pays more than the quote.
* We earn only when the agents deliver, so our incentive matches the client's.
* The unit must be backed by a number Ploeg already enforces, not by an estimate.

## Considered Options

* A ticket: a prepaid, sized, capped Shift budget, charged when the pull request is delivered
* Hours
* Model spend passed through with a markup
* CPU minutes
* Charge per merged pull request, uncapped

## Decision Outcome

Chosen option: "A ticket", because it is the only option where the price is known in advance, the cost is capped by admission, and the charge depends on delivery.

In this record, *ticket* is the word agencies and clients use for a Work Item with a Quote, as the [glossary](../reference/glossary.md) defines it. Code and guides say Work Item.

* An agency buys **credits** in bundles. A **ticket** consumes credits by **size** (for example S = 1, M = 3, L = 8).
* The refinement Run proposes a size when it makes a Work Item Ready. The client sees the size and price and approves them ([ADR-0007](adr-0007-clients-approve-ready-work.md)).
* Each size maps to a Team and a Shift Budget. Ploeg refuses a Shift it cannot fund and never raises the Budget on its own ([Ploeg ADR-0032](../../apps/ploeg/docs/adrs/0032-keep-the-dispatch-plane-and-compete-on-authorized-spend.md)).
* **Two-part price.** Model tokens are charged for every attempt at cost plus a published markup, up to the Shift Budget. Credits are the delivery fee, charged only on acceptance.
* Credits are charged only after the agency's reviewer accepts the pull request. A merge counts as acceptance, whether or not the forge required a review. A pull request with no reviewer decision 10 working days after it was opened counts as accepted; closing a pull request without merging requires a one-click reason (wrong scope, quality, not needed, done by hand); the agency gets reminders on day 3 and day 7. A ticket that fails or is rejected costs its tokens but no credits: the agency retires it, iterates on it, has it remade, or picks it up itself. A charge is reversed when the change is reverted within 14 days for a defect inside its Acceptance Conditions. A Shift that ends without delivery returns the credits. Reaching the cap stops the Shift and offers the client a split into new tickets, never a silent top-up.
* **Abuse defenses:** Unfold counts a ticket as accepted when its change lands on the base branch by another route. A strong match (the same commit, the forge's merge record, or a matching git patch-id) is billed after notice; a weaker similarity only opens a 10-working-day dispute notice. New agencies start on prepaid credits and move to postpaid billing and silent acceptance after 10 accepted deliveries. Tokens for attempts that fail through Unfold's own fault (infrastructure or an Unfold bug) are not charged; agencies see their own acceptance rate; tokens are always charged, so rejecting work is never free.
* A Follow-Up is a new ticket, approved and sized like any other ([Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)). A fix Round inside the Shift is not.
* The agency sets its own price per size for its clients. Unfold reports both numbers per ticket.
* Preview environments are metered separately in environment-hours ([ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md)).

The [pricing units record](../research/2026-09-28-pricing-units.md) compares the units. The [agency pricing strategy](../research/2026-09-29-agency-pricing-strategy.md) tests the numbers against research. Not implemented yet.

### Decided numbers

| Setting | Value |
| --- | --- |
| Credits per size S / M / L | 1 / 3 / 8; no XL. Refinement must split work it estimates above the L Shift Budget |
| Custom agents and Teams | Agencies may bring their own model keys (BYOK) and build their own agents and Teams; the Shift Budget applies whatever Team or key is used. Bring-your-own-key agencies pay the configured markup on their measured token use |
| Delivery rate for financial planning | 55%; 70% is the target after refinement |
| Shift Budget per size | Per model tier and Size, set from the measured p90 Shift cost ([research drill-down](../research/2026-10-01-economics-drill-down.md)); €4 / €10 / €20 for every tier until it is measured |
| List price per credit | €15 |
| Floor price per credit | €12, a margin floor on delivery fees that no discount goes below |
| Volume steps | €14 / €13 / €12 at 100 / 250 / 500+ credits a month |
| Refinement Runs | Tokens charged like any attempt, then credited against the delivery fee when the ticket is accepted within 30 days |
| What a credit is | One accepted S ticket, worth €15. Credits only measure delivery fees and are always shown with their euro value; tokens and hosting are charged in euros |
| Credit validity | Paid credits never expire while the account is active and are refunded at purchase price when the account closes; promotional credits can expire and are used first |
| Purchase forms | Prepaid bundles, and 12-month monthly commitments that unlock the volume steps |
| Tokens and compute inside a ticket | Charged per attempt at cost plus a published flat markup of 25%, up to the Shift Budget |
| Invoices | Show the platform fee split, for example "€249 = 10 credits (€150) + platform €99" |
| Acceptance review | An agency is reviewed, not penalised, when its acceptance rate falls below half the platform median over at least 20 closed tickets, after 2 or more confirmed copies in 90 days, or when reversals exceed 10% |
| Metered usage above allowances | €0.10 per GB-month of storage, extra tokens at list price plus the agency's markup. CI is not charged |
| Agency markup on metered usage | Each agency sets its own multiplier toward its clients; Unfold bills the agency at the rates above |
| Previews | Deploy step free; on Unfold hosting each delivery credit includes one preview deploy for 7 days; extra deploys cost €0.50 each and €0.50 per day beyond 7 days, taken from the account balance; ingress free, 100 GB egress a month included, then provider cost plus markup ([ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md)) |
| Incentives | A private per-agency quality score from acceptance rate, over a minimum sample, unlocks higher Budgets; a ready-check gives feedback on a ticket before any spend; referral rewards in euro credit that does not expire. No streaks, leaderboards or random bonuses |
| Self-hosted | No charge from Unfold; the agency pays its own model provider and infrastructure |
| Default Agency Budget for metered usage | €100 a month, alerts at 50, 75, 90 and 100%; work pauses when it is reached |
| Billing stack | Mollie for payment, Lago self-hosted for metering; Ploeg enforces every Budget before spend |
| Design partners | 3 to 5, 50% off the platform fee for 6 months; credits never below the floor |
| Public price list | Published after the pilot's first gate |
| Currency | Provider cost is settled in US$ and converted to euro at the ECB reference rate of the settlement day; each charge stores the rate and its date, and the markup absorbs the exchange risk |
| Model price changes | Flow into token charges only; the credit price changes only by announced decision, and credits already bought keep their price |
| Public launch gate | 60% of S tickets delivered at €4 or less per delivered S |
| Ask Allowance (proposed) | €2 a month per Client in phase 2 and per Team in phase 1, included in the platform fee, until measured Ask costs set it. When it is used up, Asks stop until the first of the next month unless the agency raises it; the part above the default is metered usage at list price plus the agency's markup ([ADR-0031](adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md)) |
| Per-Ask Budget (proposed) | US$ 0,02. One Ask on GLM 5.3 Flash with a 6,000-token brief and a 400-token answer costs about US$ 0,001, so the default allowance covers roughly 2,000 Asks |

### Consequences

* Good, because the client's worst case is the quote, and our worst case per attempt is the Shift Budget.
* Good, because a failed Shift costs the client only its tokens, and Unfold earns its margin only on accepted work, which rewards improving success rate.
* Bad, because sizing is a judgment. A wrong size either loses us money or loses the client.
* Bad, because refunds on failure need a clear failure definition; Ploeg's split between infrastructure and agent failures ([Ploeg ADR-0021](../../apps/ploeg/docs/adrs/0021-infra-failures-and-agent-failures-get-separate-retry-budgets.md)) is the starting point.

### Confirmation

Confirmed when every delivered ticket shows its size, quote, Shift Budget and settled spend, and a report over a month shows settled spend within the Shift Budget for every ticket.

## Pros and Cons of the Options

### Hours

* Bad, because it rewards slow work and cannot be measured for an agent.

### Model spend with a markup

* Good, because it is exact.
* Bad, because the client cannot predict it and pays for failed attempts.

### CPU minutes

* Good, because Kubernetes measures it.
* Bad, because compute is a small share of a Shift's cost; model spend is 10 to 1000 times the electricity ([capacity plan](../research/2026-09-23-capacity-plan.md)). It suits previews, not work.

### Per merged pull request, uncapped

* Good, because it is the purest outcome price.
* Bad, because our cost per attempt is unbounded and merge timing depends on the agency's review.

## More Information

* 2026-09-28 — The owner proposed tickets with a spending limit each, bought in bundles, with agent tiers.
* 2026-09-29 — Research proposed a stricter definition of delivered and revised numbers.
* 2026-09-29 — Accepted. The owner kept review-ready as the charge point and 1 / 3 / 8 credits, and set the price, floor, volume steps, refinement allowance and launch gate.
* 2026-09-29 — The owner set the planning delivery rate, the premium multiplier, the reversal rule, the L split rule, and kept rejected pull requests charged.
* 2026-09-29 — The owner moved the charge point from review-ready to the agency reviewer's acceptance, so rejected and failed tickets are never charged.
* 2026-09-29 — The owner set silent acceptance at 10 working days, with reminders on day 3 and 7.
* 2026-09-29 — The owner kept tokens and compute inside the ticket price, kept Unfold's metered rates, and let agencies set their own markup on metered usage.
* 2026-09-29 — The owner decided that model price changes pass through to the credit price immediately, while bought credits and approved quotes keep their price.
* 2026-09-29 — The owner made a merge count as acceptance, allowed bring-your-own-key, and grouped models into credit tiers.
* 2026-09-29 — The owner set credit validity, purchase forms, metered rates, the default usage cap, the billing stack, design-partner terms and when prices go public.
* 2026-09-29 — The owner replaced the all-in ticket price with a two-part price: tokens per attempt at cost plus markup, capped, and credits as a delivery fee on acceptance. L stays 8 credits. How credits are defined and valued, and any gamification, wait for research on fair pricing.
* 2026-09-29 — The owner set preview pricing and confirmed that self-hosters pay Unfold nothing.
* 2026-09-29 — The owner defined a credit as one accepted S ticket worth €15, stopped paid credits from expiring, charged previews per deploy instead of per hour, dropped CI charges, and chose the incentive mechanisms.
* 2026-09-29 — The owner set how copied code is billed, started new agencies on prepaid credits, and stopped charging for Unfold's own failures.
* 2026-09-29 — The owner dropped the 2x premium credit multiplier, unlinked the credit price from model costs, set the markup as the charge for bring-your-own-key agencies, and set preview prices.
* 2026-09-29 — The owner started the silence timer when the pull request opens, required a reason to close one, and refunded unused paid credits on account closure.
* 2026-09-29 — The owner charged refinement tokens and credited them against the delivery fee on acceptance within 30 days.
* 2026-09-29 — The owner kept €12 as a margin floor, made the token markup depend on the agency's tier, set the acceptance review rule, and required invoices to show the fee split.
* 2026-09-29 — The owner set the markup tiers at 25%, 20% and 15%, recalculated quarterly with at most one tier dropped per quarter.
* 2026-09-29 — Wording aligned with the domain model (ticket, Budget, Agency); no decision changed.
* 2026-09-30 — Wording aligned with the domain model (Markup Tier; a size maps to a Team); no decision changed.
* 2026-10-01 — The owner replaced the markup tiers with a flat 25% markup, so a quality score unlocks higher Budgets only; set Shift Budgets per model tier from the measured p90 Shift cost, keeping €4 / €10 / €20 until measured; and set the currency rule. The [economics drill-down](../research/2026-10-01-economics-drill-down.md) shows why: at open-weight cost the markup earns about €0,06 per attempt.
* 2026-10-10 — Added the proposed Ask Allowance and per-Ask Budget from [ADR-0031](adr-0031-people-ask-about-a-work-item-through-a-metered-read-only-ask-paid-from-a-monthly-allowance.md); the accepted numbers above are unchanged.
