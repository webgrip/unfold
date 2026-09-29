---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# The ticket is the billing unit: a quoted, capped Shift budget charged on delivery

## Context and Problem Statement

Agencies sell hours, and hours stop meaning anything when agents do the work: a faster agent earns less. Glide needs a unit that is fair to the agency's client, predictable for the agency and profitable for us. Ploeg already authorizes a budget before a Shift and settles it afterwards ([Ploeg ADR-0012](../../apps/ploeg/docs/adrs/0012-two-level-budgets-authorized-and-settled.md)). What do we charge for?

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

* An agency buys **credits** in bundles. A **ticket** consumes credits by **size** (for example S = 1, M = 3, L = 8).
* The refinement Run proposes a size when it makes a Work Item Ready. The client sees the size and price and approves them ([ADR-0007](adr-0007-clients-approve-ready-work.md)).
* Each size maps to a Team tier and a Shift budget cap. Ploeg refuses a Shift it cannot fund and never raises the cap on its own ([Ploeg ADR-0032](../../apps/ploeg/docs/adrs/0032-keep-the-dispatch-plane-and-compete-on-authorized-spend.md)).
* Credits are charged only after the agency's reviewer accepts the pull request. A merge counts as acceptance, whether or not the forge required a review. A pull request with no reviewer decision after 10 working days counts as accepted; the agency gets reminders on day 3 and day 7. A ticket that fails or is rejected costs nothing: the agency retires it, iterates on it, has it remade, or picks it up itself. A charge is reversed when the change is reverted within 14 days for a defect inside its Acceptance Conditions. A Shift that ends without delivery returns the credits. Reaching the cap stops the Shift and offers the client a split into new tickets, never a silent top-up.
* A Follow-Up is a new ticket, approved and sized like any other ([Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)). A fix Round inside the Shift is not.
* The agency sets its own price per size for its clients. Glide reports both numbers per ticket.
* Preview environments are metered separately in environment-hours ([ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md)).

The [pricing units record](../research/2026-09-28-pricing-units.md) compares the units. The [agency pricing strategy](../research/2026-09-29-agency-pricing-strategy.md) tests the numbers against research. Not implemented yet.

### Decided numbers

| Setting | Value |
| --- | --- |
| Credits per size S / M / L | 1 / 3 / 8; no XL. Refinement must split work it estimates above the L cap |
| Premium model tier | 2x credits per size |
| Custom agents and Teams | Agencies may bring their own model keys (BYOK) and build their own agents and Teams; models are grouped in credit tiers; the ticket's cap applies whatever Team or key is used |
| Delivery rate for financial planning | 55%; 70% is the target after refinement |
| Shift budget cap per size | €4 / €10 / €20 |
| List price per credit | €15 |
| Floor price per credit | €12, recalculated quarterly from measured cost |
| Volume steps | €14 / €13 / €12 at 100 / 250 / 500+ credits a month |
| Refinement Runs | Free within a monthly allowance per client |
| Credit validity | 12 months; one month of volume rolls over |
| Purchase forms | Prepaid bundles, and 12-month monthly commitments that unlock the volume steps |
| Tokens and compute inside a ticket | Included in the ticket price, up to the ticket's cap; never billed separately |
| Metered usage above allowances | €0.008 per CI minute, €0.06 per preview hour, €0.10 per GB-month, extra tokens at list price × 1.25 |
| Agency markup on metered usage | Each agency sets its own multiplier toward its clients; Glide bills the agency at the rates above |
| Default cap on metered usage | €100 a month, alerts at 50, 75, 90 and 100%; work pauses at the cap |
| Billing stack | Mollie for payment, Lago self-hosted for metering; Ploeg enforces every cap before spend |
| Design partners | 3 to 5, 50% off the platform fee for 6 months; credits never below the floor |
| Public price list | Published after the pilot's first gate |
| Model price changes | Passed through to the price of new credits immediately; credits already bought and quotes already approved keep their price |
| Public launch gate | 60% of S tickets delivered at €4 or less per delivered S |

### Consequences

* Good, because the client's worst case is the quote, and our worst case per attempt is the cap.
* Good, because a failed Shift costs us, not the client, which rewards improving success rate.
* Bad, because sizing is a judgment. A wrong size either loses us money or loses the client.
* Bad, because refunds on failure need a clear failure definition; Ploeg's split between infrastructure and agent failures ([Ploeg ADR-0021](../../apps/ploeg/docs/adrs/0021-infra-failures-and-agent-failures-get-separate-retry-budgets.md)) is the starting point.

### Confirmation

Confirmed when every delivered ticket shows its size, quote, authorized cap and settled spend, and a report over a month shows settled spend below cap for every ticket.

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
* 2026-09-29 — The owner kept tokens and compute inside the ticket price, kept Glide's metered rates, and let agencies set their own markup on metered usage.
* 2026-09-29 — The owner decided that model price changes pass through to the credit price immediately, while bought credits and approved quotes keep their price.
* 2026-09-29 — The owner made a merge count as acceptance, allowed bring-your-own-key, and grouped models into credit tiers.
* 2026-09-29 — The owner set credit validity, purchase forms, metered rates, the default usage cap, the billing stack, design-partner terms and when prices go public.
