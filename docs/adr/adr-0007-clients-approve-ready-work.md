---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# Clients approve Ready work, and each client sets its own definitions of Ready and Done

## Context and Problem Statement

An agency's clients describe what they want in email, calls, tracker items and chat. Most requests are not Ready ([Product glossary](../reference/glossary.md#ready)). Today a person decides when a Work Item is Ready and assigns it. In the agency offering ([ADR-0005](adr-0005-glide-is-offered-to-agencies.md)) the client pays, so the client must agree to what will be built and what it costs before a Shift starts. How does a request become approved work?

## Decision Drivers

* No credits are spent on building work the client has not approved.
* Making work Ready is itself work agents can do ([ADR-0003](adr-0003-the-unit-of-work-is-the-work-item.md)).
* Clients differ: one wants tests and screenshots, another wants a changelog entry. The rules must be per client, not per agency.
* Instructions from a client never override Glide's delivery contract.

## Considered Options

* A refinement Run drafts a Ready Work Item and a quote; the client approves it in the portal
* The agency's developer refines and approves every request
* Dispatch every request immediately and let review catch mismatches

## Decision Outcome

Chosen option: "A refinement Run drafts a Ready Work Item and a quote; the client approves it in the portal", because it moves refinement into the same budgeted, reviewed path as other work and gives the client a clear yes or no.

* **Intake:** the client portal, an imported tracker item (Vikunja and ClickUp exist in Ploeg; Linear is next), or email. Voice is later.
* **Refinement:** a refinement Role reads the request, asks the client questions when information is missing, and writes a Work Item with Acceptance Conditions and a size ([ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md)). It cannot dispatch the Work Item. A ready-check marks whether a ticket is agent-ready; the agency can send a ticket the check flagged anyway, at its own risk, with tokens charged as usual.
* **Waiting on the client:** when the request is incomplete, Glide tells the agency what it knows and what it needs. Glide never contacts an agency's clients directly; the agency passes questions on, and clients answer in the portal.
* **Approval:** the client approves the Work Item and its price. The Work Item stays `proposed` until then, reusing [Ploeg ADR-0031](../../apps/ploeg/docs/adrs/0031-runs-create-work-items-held-for-approval-within-limits.md).
* **Client profile:** each client has a Definition of Ready, a Definition of Done and extra instructions for agents. They rank below the delivery contract, like repository instructions ([Ploeg ADR-0030](../../apps/ploeg/docs/adrs/0030-target-repository-instructions-rank-below-the-delivery-contract.md)). The Definition of Done becomes Acceptance Conditions that the reviewer's Verdict checks.
* The agency can approve on the client's behalf, and can require its own approval in addition to the client's.
* When the client and the agency disagree on the Definition of Done, the agency's definition wins; the client adds requirements on top.
* Linear is the next tracker provider after Vikunja and ClickUp. At launch Glide works with GitHub, GitLab and Forgejo; intake is the portal and tracker imports, with email later.
* When a client disputes a preview, the agency decides against the approved Acceptance Conditions. A pull request that meets them is accepted; a new wish becomes a new ticket.

Not implemented yet.

### Consequences

* Good, because the client approves scope and price once, in one place.
* Good, because a refinement Run is cheap compared with a building Shift that builds the wrong thing.
* Bad, because refinement Runs cost model spend before any credits are charged. They need a monthly allowance per client to stop abuse.
* Bad, because client-written instructions are untrusted input to agents and need the same injection defenses as Work Item text.

### Confirmation

Confirmed when a Work Item created from a client request cannot enter a Shift without a recorded client or agency approval, checked by a Ploeg admission test.

## Pros and Cons of the Options

### The agency's developer refines everything

* Good, because a person checks every scope.
* Bad, because it keeps the agency's most expensive person on the slowest step.

### Dispatch immediately

* Bad, because credits are spent on work nobody agreed to.

## More Information

* 2026-09-28 — The owner described client intake by portal, email and phone, notifications that say what is missing, and per-client definitions of Ready and Done.
* 2026-09-29 — Accepted. The owner decided the approval rule, who owns the Definition of Done, and Linear as the next tracker.
* 2026-09-29 — The owner decided that the agency settles preview disputes against the approved Acceptance Conditions.
* 2026-09-29 — The owner decided that Glide never contacts an agency's clients directly.
* 2026-09-29 — The owner set GitHub, GitLab and Forgejo as launch forges and kept email intake for later.
* 2026-09-29 — The owner let agencies override the ready-check at their own risk.
