---
type: explanation
audience: [owner, contributor, agent]
owner: glide
last_verified: 2026-09-30
verified_by: "read against Glide ADRs 0005 to 0010 and docs/domain/model.yaml on docs/agency-offering; no code implements the agency offering yet, so nothing was run"
---

# Who Glide is for

Glide is for developers and agencies who do not want to bill by the hour. It turns an **Agency**'s Work Items into pull requests that a developer reviews, and it tells the Agency up front what each one may cost ([ADR-0005](../adr/adr-0005-glide-is-offered-to-agencies.md)).

**None of the agency offering is implemented yet.** Today Glide runs self-hosted for its owner's own backlog. This page explains the direction, so that work on Glide moves toward it and not away from it. The [glossary](../reference/glossary.md) defines each **bold** term.

## Two phases

| | Phase 1: self-hosted | Phase 2: hosted |
| --- | --- | --- |
| Who uses it | The owner, on their own backlog, and the owner's employer, an agency that self-hosts Glide with ClickUp as its tracker | Agencies that pay for hosted Glide, starting with Dutch agencies of 5 to 80 people |
| Who pays for models | Each user pays its own Model Provider (Fireworks today) | The Agency pays Glide a **Token Charge** per attempt |
| What Glide charges | Nothing | A **Delivery Fee** in **Credits** on **Acceptance**, plus a monthly platform fee set by the Agency's **Edition** |
| Where it runs | The user's own cluster | A rented EU cluster, one **Tenant** per Agency |

Phase 2 starts when phase 1 works and there is money to fund it. Glide stays open source in both phases: self-hosting is encouraged, and no feature is held back from the open-source code.

## The loop

1. A **Client**, the Agency's customer, sends a **Request** through the **Client Portal**, a tracker or email.
2. **Refinement** turns it into one or more Ready Work Items, each with Acceptance Conditions and a **Size**. When information is missing, the Agency asks the Client; Glide never contacts a Client directly ([ADR-0007](../adr/adr-0007-clients-approve-ready-work.md)).
3. The Client approves each Work Item's **Quote**: the Size and the Agency's price. Until then the Work Item waits as proposed.
4. Ploeg runs a Shift within the Size's Shift Budget. It never raises a Budget on its own; a Shift that reaches it stops and offers a split.
5. The Shift ends with a small, explained pull request and a **Preview Environment** ([ADR-0008](../adr/adr-0008-every-pull-request-gets-a-preview-environment.md), [ADR-0010](../adr/adr-0010-pull-requests-are-small-whole-and-explained.md)).
6. The Agency's developer reviews it. Approving or merging is **Acceptance**, and makes the Work Item a **Delivery**. The Client's feedback on the preview is input to that decision.

Phase 1 uses the same loop without the portal, the Quote or any charge.

## Where Glide's responsibility ends

Glide delivers a reviewed pull request and its preview. It never merges and never deploys to production; previews never receive production secrets. The Agency owns merging, production and the relationship with its Clients. Every pull request says that an agent wrote it and names the developer who reviewed it.

## How a Work Item is priced

A price has two parts ([ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md)):

* The **Token Charge**: model tokens and compute for every attempt, at cost plus Glide's published **Markup**, up to the Shift Budget. Rejected work still pays it, so rejecting is never free.
* The **Delivery Fee**: Credits by Size, charged only on Acceptance, and refunded as a **Reversal** if the change is reverted within 14 days for a defect. A disagreement about a charge is a **Dispute**, opened with ten working days' notice.

Agencies and Clients call a Work Item with a Quote a **Ticket**. That word belongs in the portal and in sales material; everywhere else, say Work Item. The numbers (Credits per Size, Shift Budgets, the Markup) live in ADR-0006 and nowhere else, so they cannot drift.

## Isolation between Agencies

In hosted Glide each Agency's work lives in its own Tenant: its own namespaces, default-deny network, sandboxed runtime, model budget and per-Run credentials. Real credentials never enter a Run's pod. A Client is a user inside its Agency's Tenant, never a Tenant ([ADR-0009](../adr/adr-0009-one-tenant-per-agency.md)).

## Where the work is

The work is on the Glide board in Vikunja under the label `theme/agency-offering`, split by `phase/1-self-hosted` and `phase/2-hosted`. The research behind the decisions is in the [agency pricing strategy](../research/2026-09-29-agency-pricing-strategy.md) and [fair credit pricing](../research/2026-09-29-fair-credit-pricing.md) records.
