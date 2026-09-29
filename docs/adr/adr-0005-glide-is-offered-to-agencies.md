---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# Glide is offered to agencies, and delivery ends at a reviewed pull request with a preview

## Context and Problem Statement

Glide turns Work Items into review-ready pull requests. To sell it, we must choose who pays and where our responsibility ends. Three buyers are plausible: people who cannot code and want "any program", in-house development teams on Linear or Jira, and agencies that build software for their own clients. Each needs a different product. Who is Glide for, and what does it deliver?

## Decision Drivers

* The buyer must already work in units that map to Work Items.
* The buyer must profit from Glide, not only save time.
* Our strongest claim is authorized spend on a self-hosted stack ([Ploeg ADR-0032](../../apps/ploeg/docs/adrs/0032-keep-the-dispatch-plane-and-compete-on-authorized-spend.md)). The buyer must value a guaranteed cost ceiling.
* We must not become responsible for other people's production systems.

## Considered Options

* Agencies, with a client portal; delivery ends at a reviewed pull request and a preview environment
* In-house development teams, as a tracker-connected agent service
* Non-developers, as an app builder
* Any of these, with production hosting included

## Decision Outcome

Chosen option: "Agencies, with a client portal; delivery ends at a reviewed pull request and a preview environment", because agencies already sell fixed-scope work to clients, carry the cost risk Glide caps, and keep a developer who reviews every change.

* **Customer (tenant):** an agency. **Client:** the agency's customer, who submits requests and approves work in the portal.
* **Loop:** client request → refinement Run makes it Ready → client approves the quote → Shift → pull request with a preview environment → agency developer reviews and merges → client accepts.
* **Boundary:** Glide delivers the pull request and its preview ([ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md)). The agency owns merging, production and the client relationship.
* In-house teams can use the same product as an agency with one client (themselves). We do not build for non-developers.
* **First segment:** Dutch, development-heavy agencies of 5 to 80 FTE with maintenance work. First stacks: WordPress, Laravel, Next.js/React, Shopify and DevOps work.
* **Editions:** the Agency edition launches first. White label follows once two partners ask for it; it is a paid tier, and white-label agencies resell their own service, never Glide credits. Freelancer and Enterprise self-hosted follow after the pilot's third gate. Platform fees per month: Freelancer €29, Agency €249, White label €690; Enterprise from €18k a year.
* **Portal:** the client portal is part of Vloer. Clients see both the agency's price and Glide's charge.

Not implemented yet. The [agency offering proposal](../research/2026-09-28-agency-offering-proposal.md) lists the work; the [agency pricing strategy](../research/2026-09-29-agency-pricing-strategy.md) holds the research.

### Consequences

* Good, because the ticket model ([ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md)) matches how agencies already quote work.
* Good, because a human developer stays accountable for every merge, which keeps Glide inside its review-ready boundary.
* Bad, because the portal, client accounts and reporting are new surface in Vloer.
* Bad, because multi-tenancy becomes a precondition for the second customer ([ADR-0009](adr-0009-one-tenant-per-agency.md)).

### Confirmation

This record is confirmed when one agency, other than webgrip, runs a client request from the portal to a merged pull request, and the agency's invoice to its client is higher than Glide's charge for that ticket.

## Pros and Cons of the Options

### Agencies with a client portal

* Good, because agencies bill per deliverable and resell, so a capped cost per ticket is margin they can see.
* Good, because the agency's developer is the reviewer Glide already assumes.
* Bad, because selling to agencies means selling to a smaller market than all development teams.

### In-house development teams

* Good, because the tracker integration already exists.
* Bad, because the market is crowded (Devin, Factory, the Copilot coding agent, Cursor background agents), and the buyer compares on code quality, not on cost control.

### Non-developers

* Bad, because no one reviews the result, which contradicts Glide's review-ready boundary.

### Production hosting included

* Bad, because it makes us responsible for uptime, incidents and data of systems we did not design. It is a separate business.

## More Information

* 2026-09-28 — The owner chose agencies as the customer and previews as the delivery boundary.
* 2026-09-29 — Accepted. The owner decided the first segment, stacks, edition order, platform fees, white-label resale model and portal placement.
