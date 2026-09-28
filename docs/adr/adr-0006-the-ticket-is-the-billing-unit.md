---
status: proposed
date: 2026-09-28
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
* Credits are charged when the pull request is delivered review-ready. A Shift that ends without delivery returns the credits. Reaching the cap stops the Shift and offers the client a split into new tickets, never a silent top-up.
* A Follow-Up is a new ticket, approved and sized like any other ([Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md)). A fix Round inside the Shift is not.
* The agency sets its own price per size for its clients. Glide reports both numbers per ticket.
* Preview environments are metered separately in environment-hours ([ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md)).

The [pricing units record](../research/2026-09-28-pricing-units.md) compares the units and shows the margin arithmetic. Not implemented yet.

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
