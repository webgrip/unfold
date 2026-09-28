# Pricing units for the agency offering

Status: proposal, 2026-09-28. Written from the owner's brief and the cost figures in the [capacity plan](2026-09-23-capacity-plan.md). Every price below is an illustrative assumption, not a measurement or a quote. Replace them with settled spend from real Shifts before publishing a price list. Decision: [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md).

## Summary

- **Bill tickets, not hours.** A ticket is a quoted, capped Shift budget, charged only when the pull request is delivered.
- **Two layers of price.** Glide sells credits to the agency. The agency sells tickets to its clients at its own price. Glide reports both, so the agency sees its margin per client.
- **Our margin is guaranteed by the cap.** When the credit price is at least the cap divided by the delivery rate, no delivered ticket loses money, whatever the model costs.
- **CPU minutes fit previews, not work.** Model spend is 10 to 1000 times a Run's electricity, so compute does not track the cost of a ticket.

## What a ticket costs us

| Component | Measured by | Size of it |
| --- | --- | --- |
| Model spend | LiteLLM, per Run, settled against the Shift budget | €0,01–0,05 per DeepSeek Run, €1,00–3,00 per frontier Run (capacity plan) |
| Worker compute | Pod CPU-seconds | €0,001–0,01 per Run in power (capacity plan) |
| Refinement | Model spend of the refinement Run | Small, but spent before the client approves |
| Preview | Environment-hours of the preview namespace | Grows with how long the pull request stays open |
| Failed attempts | Shifts that end without delivery | Up to the cap each; we absorb them |

Expected cost per delivered ticket = (average settled spend per Shift ÷ delivery rate) + refinement cost.
Worst case per delivered ticket = cap ÷ delivery rate.

## Units compared

| Unit | Fair to the client | Predictable for the agency | Tracks our cost | Verdict |
| --- | --- | --- | --- | --- |
| Hours | No: a faster agent earns less | Yes | No | Reject |
| Model spend + markup | Yes, but pays for failures | No | Yes | Reject for work; show it in reports |
| CPU minutes | Yes | Yes | No for work, yes for previews | Use for previews only |
| Story points | Depends on who estimates | Somewhat | No | Reject |
| Per merged pull request, uncapped | Yes | Yes | No: our cost is unbounded | Reject |
| **Ticket: sized, capped, charged on delivery** | Yes: price known, pays only for delivery | Yes | Yes, bounded by the cap | **Adopt** |
| Credits as the currency for tickets | Neutral | Yes: bundles | Lets us change the cost mix behind a size | **Adopt** |

## Illustrative arithmetic

Assumptions: delivery rate 70 %, typical settled spend at half the cap, credit price €15.

| Size | Credits | Price to agency | Cap | Worst case per delivered | Typical cost per delivered | Margin, worst / typical |
| --- | --- | --- | --- | --- | --- | --- |
| S | 1 | €15 | €4 | €5,71 | €2,86 | 62 % / 81 % |
| M | 3 | €45 | €12 | €17,14 | €8,57 | 62 % / 81 % |
| L | 8 | €120 | €30 | €42,86 | €21,43 | 64 % / 82 % |

The agency's side, assuming a €90 hourly rate it used to bill and 15 minutes of developer review per S ticket: the agency sells an S ticket at €150 (what one to two hours used to cost the client), pays Glide €15 and spends €22,50 of review time. It keeps about €112. The client pays less than before for a known price, and the agency earns more per hour of its developer's time.

The delivery rate is the number that matters most. Raising it from 70 % to 85 % cuts worst-case cost per delivered ticket by 18 %. [The loop baseline](2026-09-27-loop-baseline.md) is where it gets measured.

## Fairness rules

1. The client sees size and price before approving. The quote is the maximum.
2. Credits are charged on delivery. A Shift that ends without a review-ready pull request returns them.
3. Reaching the cap stops the Shift and offers a split. There is no silent top-up.
4. Scope change is a new ticket. A fix Round inside the Shift is not.
5. Every ticket's report shows size, quote, cap and settled spend.

## Revenue beyond tickets

- **Platform fee** per agency per month: the portal, client accounts and a refinement allowance.
- **Tiers** as a size multiplier: a premium tier uses frontier models and costs more credits per size.
- **Priority** as higher concurrency for a tenant's Shifts.
- **Previews** billed in environment-hours above an included allowance.
- **Client retainers** the agency can sell: a monthly bundle of S tickets, or maintenance where dependency updates and failing checks become tickets automatically.
- **Reports** the agency can send its client: tickets delivered, spend against quote, time to delivery.

## Open questions

- Who absorbs a wrong size: us, the agency, or a re-quote before the Shift starts?
- Does a refinement Run cost credits when the client never approves?
- How do credits for a self-hosted install work, where the agency pays the model provider directly?
