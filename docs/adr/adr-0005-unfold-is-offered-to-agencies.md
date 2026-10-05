---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# Unfold is offered to agencies, and delivery ends at a reviewed pull request with a preview

## Context and Problem Statement

Unfold turns Work Items into review-ready pull requests. To sell it, we must choose who pays and where our responsibility ends. Three buyers are plausible: people who cannot code and want "any program", in-house development teams on Linear or Jira, and agencies that build software for their own clients. Each needs a different product. Who is Unfold for, and what does it deliver?

## Decision Drivers

* The buyer must already work in units that map to Work Items.
* The buyer must profit from Unfold, not only save time.
* Our strongest claim is authorized spend on a self-hosted stack ([Ploeg ADR-0032](../../apps/ploeg/docs/adrs/0032-keep-the-dispatch-plane-and-compete-on-authorized-spend.md)). The buyer must value a guaranteed cost ceiling.
* We must not become responsible for other people's production systems.

## Considered Options

* Agencies, with a client portal; delivery ends at a reviewed pull request and a preview environment
* In-house development teams, as a tracker-connected agent service
* Non-developers, as an app builder
* Any of these, with production hosting included

## Decision Outcome

Chosen option: "Agencies, with a client portal; delivery ends at a reviewed pull request and a preview environment", because agencies already sell fixed-scope work to clients, carry the cost risk Unfold caps, and keep a developer who reviews every change.

* **Phasing.** Unfold is built first for the people who use it: the owner, who runs it daily on their own backlog, and the owner's employer, an agency that will self-host it with ClickUp as its tracker. Both pay their own model provider (Fireworks today) and nothing to Unfold. The hosted agency business below is the designed second phase; its spending, hosting, legal and sales steps start once the self-hosted phase works and there is money to fund them.
* **Agency:** the business that uses and pays for Unfold; in hosted Unfold its work lives in one Tenant ([ADR-0009](adr-0009-one-tenant-per-agency.md)). **Client:** the agency's customer, who submits requests and approves Quotes in the portal.
* **Loop:** client request → refinement Run makes it Ready → client approves the quote → Shift → pull request with a preview environment → the agency's developer reviews and accepts it, by approving or merging. The client's feedback on the preview is input to that Acceptance.
* **Boundary:** Unfold delivers the pull request and its preview ([ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md)). The agency owns merging, production and the client relationship.
* In-house teams can use the same product as an agency with one client (themselves). We do not build for non-developers.
* **First segment:** Dutch, development-heavy agencies of 5 to 80 FTE with maintenance work. First stacks: WordPress, Laravel, Next.js/React, Shopify and DevOps work. Flanders follows in the second quarter. Sales are in Dutch; the product is in Dutch and English. Agencies without version control or CI are not a fit.
* **Positioning:** Unfold is for developers and agencies who do not want to bill by the hour. It speaks to the shift in where the industry's bottleneck sits, and it is fully transparent about price and effort, efficient and observable.
* **Brand and models:** the agency's brand comes first and "Powered by Unfold" is optional. Unfold stays model-neutral. The three-year goal is to be the EU standard for agencies.
* **Open source and self-hosting:** Unfold is free and open source first, and self-hosting is encouraged. The hosted service is an alternative, not the only way to use Unfold. Revenue comes from the hosted service, support and SLA contracts, and pilot and setup services; no feature is held back from the open-source code.
* **Editions:** the Studio edition launches first. White label follows once two partners ask for it; it is a paid edition, and white-label agencies resell their own service, never Unfold credits. Freelancers can self-host the open-source release from day one; the hosted Freelancer edition and Enterprise follow after the pilot's third gate. Platform fees per month: Freelancer €29, Studio €249, White label €690, including 1, 10 and 30 credits. Enterprise, from €18k a year, buys support, an SLA, security updates and setup for a self-hosted install; every feature, SSO and audit included, is open source.
* **Disclosure:** every pull request and the portal say that an agent wrote the change and name the developer who reviewed it.
* **Liability:** Unfold opens pull requests on semantically named branches and never deploys. Production deploys run in the agency's own CI, and whether a pull request may merge without review is the agency's forge and repository setting. Unfold's liability is capped at fees paid, as stated in the terms.
* **Trust:** agency owners see live spend against the Shift Budget for every Work Item, the full agent log per pull request, a public security page with a pentest summary, and a kill switch that stops all of the agency's Runs at once. Each agency privately sees all 35 quality, speed, cost, client and business numbers, with revenue per developer hour on the front page. The agency chooses which numbers its clients see in the portal. Anonymised platform-wide numbers, including the acceptance-rate medians, are published monthly.
* **Pilot:** in the hosted phase, the first external agency signs a 4 to 6 week pilot agreement with an NDA and a data processing agreement; Unfold never trains on its code and deletes it on exit. The pilot delivers 5 to 10 of the agency's real small tickets in its own repository.
* **Refinement as a product:** request-to-quote (refinement and pricing without agent code) is also sold on its own, for agencies not ready to let agents change code.
* **Never built:** an account or Work Item without a hard Budget, and features made for one agency that others will not use.
* **Agents and Teams:** agencies, and their clients where the agency allows it, define their own agents and Teams (Roles, models, instructions). Unfold ships default Teams. Every Team runs inside the Work Item's Shift Budget.
* **Invoicing and maintenance:** exporting accepted Work Items to Moneybird, Exact and e-Boekhouden is part of the pilot. Maintenance subscriptions, where dependency updates and failing checks become Work Items automatically, come in version 2 after the delivery rate is measured.
* **White label and partners:** Unfold suggests retail prices but never fixes them. The agency is first-line support for its clients and Unfold is second line. "Powered by Unfold" is optional. A referral earns 15% of the referred agency's first-year revenue as euro credit that does not expire. Overflow routing between agencies and a marketplace for Teams, packages and client profiles come later. Tool vendors such as Simplicate and Teamleader start as integrations; reselling through them stays an option.
* **Portal:** the client portal is part of Unfold. Clients see the agency's price. Unfold's charge is hidden by default; an agency can choose to show it.

Not implemented yet. The [agency offering proposal](../research/2026-09-28-agency-offering-proposal.md) lists the work; the [agency pricing strategy](../research/2026-09-29-agency-pricing-strategy.md) holds the research.

### Consequences

* Good, because the ticket model ([ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md)) matches how agencies already quote work.
* Good, because a human developer stays accountable for every merge, which keeps Unfold inside its review-ready boundary.
* Bad, because the portal, client accounts and reporting are new surface in Unfold.
* Bad, because multi-tenancy becomes a precondition for the second agency ([ADR-0009](adr-0009-one-tenant-per-agency.md)).

### Confirmation

This record is confirmed when one agency, other than webgrip, runs a client request from the portal to a merged pull request, and the agency's invoice to its client is higher than Unfold's charge for that Work Item.

## Pros and Cons of the Options

### Agencies with a client portal

* Good, because agencies bill per deliverable and resell, so a capped cost per ticket is margin they can see.
* Good, because the agency's developer is the reviewer Unfold already assumes.
* Bad, because selling to agencies means selling to a smaller market than all development teams.

### In-house development teams

* Good, because the tracker integration already exists.
* Bad, because the market is crowded (Devin, Factory, the Copilot coding agent, Cursor background agents), and the buyer compares on code quality, not on cost control.

### Non-developers

* Bad, because no one reviews the result, which contradicts Unfold's review-ready boundary.

### Production hosting included

* Bad, because it makes us responsible for uptime, incidents and data of systems we did not design. It is a separate business.

## More Information

* 2026-09-28 — The owner chose agencies as the customer and previews as the delivery boundary.
* 2026-09-29 — Accepted. The owner decided the first segment, stacks, edition order, platform fees, white-label resale model and portal placement.
* 2026-09-29 — The owner set the credits included in each fee and let agencies hide Unfold's charge from clients.
* 2026-09-29 — The owner decided that agent authorship is always disclosed and that the agency's merge is the liability gate.
* 2026-09-29 — The owner hid Unfold's charge from clients by default.
* 2026-09-29 — The owner set the trust features and the pilot terms, after naming lack of trust as the most likely cause of failure.
* 2026-09-29 — The owner made refinement a standalone product and set what Unfold never builds.
* 2026-09-29 — The owner placed deploys and merge rules with the agency's CI and forge, and let agencies define their own agents and Teams.
* 2026-09-29 — The owner made Unfold free and open source first, with self-hosting encouraged and the hosted service as an alternative.
* 2026-09-29 — The owner set revenue sources: hosted service, support and SLA, and pilot and setup services, with no closed features.
* 2026-09-29 — The owner set the positioning, kept Enterprise as support for self-hosters with all features open, and confirmed brand, model neutrality and the three-year goal.
* 2026-09-29 — The owner let freelancers self-host from day one and confirmed Flanders in quarter two, bilingual product and Dutch sales.
* 2026-09-29 — The owner put invoice export in the pilot and maintenance subscriptions in version 2.
* 2026-09-29 — The owner chose the first quality numbers agencies see.
* 2026-09-29 — The owner made all 35 numbers visible to agencies, put revenue per developer hour on the front page, let agencies choose what clients see, and chose to publish anonymised platform numbers monthly.
* 2026-09-29 — The owner confirmed the white-label defaults, set referrals at 15% of first-year revenue as credit, and kept overflow routing, the marketplace and vendor reselling for later.
* 2026-09-29 — The owner set a self-hosted first phase for the owner and the owner's employer, each paying its own model provider, with the hosted agency business as the second phase.
* 2026-09-29 — Wording aligned with the domain model (Agency, Client, Acceptance, Budget); no decision changed.
* 2026-09-30 — The owner renamed the Agency edition to Studio, because Agency names every business that uses Unfold.
* 2026-10-01 — Wording follows ADR-0006's flat markup (no markup tiers); no decision in this record changed.
