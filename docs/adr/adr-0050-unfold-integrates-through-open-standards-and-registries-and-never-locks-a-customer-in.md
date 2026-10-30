---
status: accepted
date: 2026-10-30
decision-makers: Ryan Grippeling
---

# Unfold integrates through open standards and registries and never locks a customer in

## Context and Problem Statement

Unfold is self-hosted first and later a hosted service for agencies ([ADR-0005](adr-0005-unfold-is-offered-to-agencies.md), [Who Unfold is for](../concepts/who-unfold-is-for.md)). An agency already has a forge, a tracker, a chat tool, an identity provider, a model provider, an observability stack and an accounting tool, and it will not replace any of them to use Unfold. It also has to be able to leave.

Unfold grew on the owner's own stack (Forgejo, Vikunja, Authentik, LiteLLM, VictoriaLogs), and that stack shows through in the code: provider lists written as closed unions, a publisher with no interface, a reference format that only Vikunja uses, an identity provider named in the defaults. Each one is small, and together they decide which agencies Unfold can serve. How does Unfold connect to the systems around it so that any agency can adopt it, and leave it, without switching tools?

This decision covers every integration of both applications: forges, trackers, chat, identity, model gateways, telemetry, audit, cost, billing, editors and data export. It covers what Unfold sends out and what it asks of Ploeg.

## Decision Drivers

* An agency adopts Unfold on the tools it already has, or it does not adopt it.
* A Tenant must be able to leave with its data. The EU Data Act ([Regulation (EU) 2023/2854](https://eur-lex.europa.eu/eli/reg/2023/2854/oj), Chapter VI, Articles 23 to 31) obliges a provider of data processing services to let a customer switch to another provider or to its own infrastructure, with its exportable data, without obstacles, and since 12 September 2025 that duty applies. The hosted service is such a service.
* Every adapter Unfold writes is code it maintains. Where a standard exists, one implementation of the standard serves every vendor that speaks it.
* Billing is per accepted ticket ([ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md)). The lines an agency invoices from must reach the tool it invoices with.
* Ploeg knows no consumer ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md), [ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)).
* Trust: an agency that can see the hosted service runs the same code it could run itself does not have to take a sales promise on faith.

## Considered Options

* Open standards on the wire, registries in the code, everything exportable
* One adapter per vendor, added as customers ask, behind closed lists
* Support only the owner's stack until a paying customer needs more

## Decision Outcome

Chosen option: "**Open standards on the wire, registries in the code, everything exportable**", because it is the only option under which an agency neither has to switch tools to adopt Unfold nor loses its data when it leaves. The owner accepted it on 30 October 2026.

### The rules

1. **A registry, never a switch.** Every integration sits behind an interface, and its implementations are adapters registered by name. A new vendor is a new adapter, never an edit to a closed union, a `switch` over provider names or a list of hardcoded vendors. Reference formats are data that the adapter supplies: no code outside an adapter knows a prefix such as `VIK-`.
2. **An open standard on the wire wherever one exists.** OIDC for sign-in, SCIM 2.0 for user provisioning, OpenAPI for Unfold's own API, MCP for tools, ACP for editors, OpenFeature and OFREP for flags, OTLP for telemetry, and the standards in rule 3 for what leaves. Unfold writes its own adapter interface only where no standard exists: pull request operations on a forge, tracker APIs, chat bots and agent memory.
3. **Everything that leaves goes in a standard format.** Events are [CloudEvents 1.0](https://cloudevents.io/), signed as [Standard Webhooks](https://www.standardwebhooks.com/) and documented in [AsyncAPI](https://www.asyncapi.com/) 3.1. Telemetry is OTLP. Audit records are [OCSF](https://ocsf.io/). Cost and usage are [FinOps FOCUS](https://focus.finops.org/). Data that is only on a screen, or only in a CSV download, does not count as exported.
4. **Bring your own model credential and gateway.** Every feature works with the customer's own model credential through the customer's own gateway. No feature needs credits bought from Unfold.
5. **Every supported forge, or labelled.** A feature works on every forge Unfold supports, or the interface labels it as specific to the forges it works on.
6. **A Tenant can leave with all its data.** Through the API, in documented formats: JSONL for records, Parquet for large tables, OKF for knowledge ([ADR-0021](adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md)), git for code and anything kept as files. The export is complete, needs no support ticket, and is how the hosted service meets the Data Act's switching duty.
7. **The hosted service runs the same open-source code.** Nothing is held back from the self-hosted build: no closed module, no hosted-only feature. Hosting is operation, not a fork.
8. **Ploeg knows no consumer.** Whatever Unfold needs from Ploeg becomes a generic Ploeg contract, in Ploeg's words, that any consumer could use.

### Owner decisions of 30 October 2026

* **The model gateway is a generic Ploeg contract.** Ploeg's gateway seam ([Ploeg ADR-0008](../../apps/ploeg/docs/adrs/0008-litellm-is-the-credential-and-metering-seam.md)) becomes an interface for minting a scoped key, setting its budget and reading its spend. LiteLLM is one implementation; [Envoy AI Gateway](https://aigateway.envoyproxy.io/) is the second. The contract and both implementations are Ploeg work, written upstream in Ploeg's words.
* **Tracker order.** ClickUp first. Then Jira, as an Atlassian Forge app. Then GitHub Issues and GitLab issues. Then Linear, as a Linear agent on its AgentSession API. Every other tracker on demand. Each is an adapter in the tracker registry.
* **Editors.** In phase 1 Unfold offers a north-side ACP agent, so PhpStorm (and any other editor that speaks the Agent Client Protocol) can talk to Unfold as an agent.
* **Billing never sends Peppol itself.** Unfold writes one line per accepted ticket into the agency's PSA or accounting tool, and that tool sends the e-invoice over Peppol. Order: Simplicate first, then Teamleader, Moneybird and Exact. Each is an adapter in a billing registry.

### Consequences

* Good, because an agency adopts Unfold on its own forge, tracker, identity provider, gateway and accounting tool.
* Good, because one standard implementation (OTLP, CloudEvents, OCSF, FOCUS) reaches every tool that reads it, instead of one adapter per vendor.
* Good, because the hosted service meets the Data Act's switching duty by design, not by a migration project.
* Good, because the same code in both builds means a self-hosting agency can verify what the hosted service does.
* Bad, because a registry and an interface cost more than the first hardcoded adapter, and the first customer pays that cost on day one.
* Bad, because some rules wait on Ploeg releases (the gateway contract, multi-forge workers), and Unfold cannot finish them alone.
* Bad, because label-or-support (rule 5) makes every forge-specific feature visible as such, which shows gaps a closed list would hide.

**Known violations to fix.** These exist on `development` today:

* The LiteLLM admin API is hardwired: `LiteLLMBroker` in `apps/unfold/src/broker.ts` calls LiteLLM's admin routes directly. It moves behind the generic gateway contract.
* Sign-in assumes Authentik (the default display name and claims in `apps/unfold/src/config.ts`), and there is no SCIM provisioning.
* Unfold's own API has no OpenAPI description.
* There is no Tenant export.
* Run logs and linked-session telemetry are read back with LogsQL against VictoriaLogs (`apps/unfold/src/run-logs.ts`, `apps/unfold/src/linked-telemetry.ts`), so they work only on that one backend.

Each becomes a ticket. Until it is fixed, new code does not copy the pattern.

### Confirmation

A reviewer checks a pull request that adds or changes an integration, an export or a Ploeg request against these questions, in the [review guide](../contributing/review.md):

1. Does a new vendor arrive as a registered adapter behind an interface, with no new union member, `switch` arm or vendor name outside the adapter?
2. Where a standard exists for this wire, is it the standard? A new own interface names why no standard fits.
3. Does anything that leaves Unfold (an event, telemetry, an audit record, a cost line) use CloudEvents with Standard Webhooks signatures and an AsyncAPI entry, OTLP, OCSF or FOCUS, and is it reachable through the API, not only on a screen or as a CSV?
4. Does the feature work with a customer's own model credential and gateway?
5. Does it work on every supported forge, or is it labelled with the forges it supports?
6. Is new stored data included in the Tenant export, in a documented format?
7. Is any of it hosted-only?
8. Does a Ploeg change name Unfold, or is it a generic contract?

A "no" to 1, 3, 4, 6 or 8, or a "yes" to 7, is a blocking finding. `apps/unfold/test/integration-registries.test.ts` fails on a union of provider names, a comparison with a provider name or a built `VIK-` reference outside an adapter. Proposed, not built: an export test that round-trips a Tenant.

## Pros and Cons of the Options

### Open standards on the wire, registries in the code, everything exportable

* Good, because it meets every decision driver.
* Bad, because it costs more up front than a direct call to one vendor.

### One adapter per vendor behind closed lists

* Good, because each adapter is quick to add.
* Bad, because every vendor touches shared code, and every export format is invented per vendor.
* Bad, because data that leaves only in Unfold's own shapes is a lock-in the Data Act forbids for the hosted service.

### Support only the owner's stack

* Good, because it is what exists.
* Bad, because no agency on GitHub, Jira, Entra ID or a plain OpenAI key can adopt Unfold.

## More Information

* Touches [ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md) (the billing line per accepted ticket goes to the agency's own tool), [ADR-0008](adr-0008-every-pull-request-gets-a-preview-environment.md) (the preview step runs in the agency's own pipeline on every supported forge, and deploys to the agency's own infrastructure unless it chooses Unfold's hosting; rule 4 is about model credentials, not that hosting), [ADR-0009](adr-0009-one-tenant-per-agency.md) and [ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) (the Tenant is the unit of export), and [ADR-0026](adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md) (notifications use Web Push, a standard).
* Unfold application ADRs it builds on: [0003](../../apps/unfold/docs/adrs/0003-runtime-workspace-and-credential-seams.md) (distinct seams), [0004](../../apps/unfold/docs/adrs/0004-portable-procedures-and-explicit-contracts.md) (explicit contracts), [0042](../../apps/unfold/docs/adrs/0042-unfold-reports-errors-and-failed-asks-to-any-error-tracker.md) (any error tracker) and [0043](../../apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md) (flags behind OpenFeature).
* 2026-10-30 — Accepted by the owner, with the gateway, tracker order, editor and billing decisions above.
* 2026-10-30 — The task and link provider registries, the `DeliveryPublisher` interface with Forgejo, GitHub and GitLab adapters, Report a problem through the tracker registry and adapter-supplied reference formats replaced four of the known violations (OpenSpec change `integration-registries`).
