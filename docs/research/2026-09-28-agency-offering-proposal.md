# Agency offering: product proposal

Status: proposal, 2026-09-28, from the owner's brief. Nothing here is implemented unless it links to code. Decisions: [ADR-0005](../adr/adr-0005-glide-is-offered-to-agencies.md) to [ADR-0009](../adr/adr-0009-one-tenant-per-agency.md). Pricing: [pricing units](2026-09-28-pricing-units.md).

## Problem

Agencies sell software work by the hour. Agents make hours meaningless, and clients distrust open-ended bills. An agency needs to take a client's request, agree on scope and price once, and deliver a change the client can try, while keeping a developer accountable for what ships.

## Outcome

A client submits a request. Glide makes it Ready, quotes it and waits for approval. After approval, agents deliver a reviewed pull request with a running preview. The client pays the quoted price or less, and only for delivered work. The agency earns more per developer hour than it did billing hours.

## Users

| User | Wants |
| --- | --- |
| Agency owner | Margin per client, predictable cost, reports to send clients |
| Agency developer | Review-ready pull requests, fewer vague requests |
| Client | Say what they want, see the price, try the result |
| Glide operator (us) | Capped cost per ticket, isolated tenants, secure defaults |

## The loop

1. **Request.** The client writes in the portal, sends an email, or the agency imports a tracker item (Vikunja and ClickUp exist in Ploeg; Linear is next).
2. **Refine.** A refinement Run turns the request into a Work Item with Acceptance Conditions and a size. When information is missing, Glide tells the client what it knows and what it needs.
3. **Approve.** The client, or the agency on their behalf, approves the Work Item and its price.
4. **Build.** Ploeg admits a Shift with the budget cap of the ticket's size and runs the Team of that tier.
5. **Deliver.** The pull request is review-ready, with a preview URL. Credits are charged now.
6. **Review and accept.** The agency developer reviews and merges. The client accepts in the portal.

## Scope

| Area | What | Decision |
| --- | --- | --- |
| Billing | Credits, ticket sizes mapped to Team tier and cap, charge on delivery, refunds, reports | ADR-0006 |
| Intake and refinement | Refinement Role, client approval gate, client profile (Definition of Ready, Definition of Done, extra instructions), notifications, Linear provider, email intake | ADR-0007 |
| Portal | Tenants, agency users, clients, request and approval screens, agency price per size, margin report | ADR-0005 |
| Previews | Declared build, per-pull-request namespace and URL, cleanup, environment-hour metering, access control | ADR-0008 |
| Tenancy and security | Credential isolation on by default, tenant on every record, default-deny egress, sandboxed runtime, LiteLLM team per tenant, cross-tenant test | ADR-0009 |

## Not in scope

- Production hosting and deployment.
- An app builder for people without a developer.
- Voice intake in the first version. Voice becomes another intake channel after email works.

## Order

1. **Tenancy and security first.** A second agency cannot join without it. Start with the [credential isolation cluster plan](../../apps/ploeg/docs/research/2026-09-28-credential-isolation-cluster-plan.md).
2. **Billing on Ploeg's existing budgets.** Sizes, caps and the credit ledger reuse authorized and settled budgets.
3. **Refinement and approval.** The refinement Role and the approval gate reuse the `proposed` state of Ploeg ADR-0031.
4. **Linear provider**, as the first new tracker and a test of tracker neutrality.
5. **Previews** for one declared repository format.
6. **Portal and reports.**
7. **Email intake**, then voice.

Areas 1, 2 and 4 can run in parallel; 3 depends on 2; 6 depends on 2 and 3.

## Success measures

- Delivery rate: delivered tickets ÷ approved tickets.
- Settled spend ÷ cap, per size.
- Agency developer review minutes per ticket.
- Time from approval to delivery.
- Agency margin per client per month.

## Open questions

- Is the portal part of Vloer, or a separate application with its own identity? Glide ADR-0001 keeps applications independent.
- Does the client or the agency own the Definition of Done when they disagree?
- Which preview declaration comes first: a Dockerfile, buildpacks, or a Helm chart in the repository?
- Do refinement Runs cost credits?
