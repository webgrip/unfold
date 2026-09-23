---
type: landing
audience: [owner, operator, integrator, contributor, agent]
owner: vloer
last_verified: 2026-09-23
verified_by: "mise run docs-check (every link resolves); apps/vloer/llms.txt links this page"
---

# De Vloer documentation

De Vloer provides durable operator sessions, agent workspaces, intervention and reviewable evidence. Start with the guide for your task.

## Try it

- [Local fixture demonstration](operations/demo.md)
- [Shared Ploeg demonstration](../../../docs/workflows/local-demo.md): both applications and PostgreSQL without model calls

## Operate

- [Live operation](operations/live.md): standalone setup, identity, workspaces and intervention
- [Shared execution setup and recovery](../../../docs/workflows/managed-execution.md)
- [Task connections](operations/task-connections.md)
- [Release procedure](operations/release.md)

## Integrate

- [HTTP API](contracts/api.md)
- [Ploeg execution](contracts/ploeg-execution.md)
- [Canonical tracker binding](contracts/ploeg-tracker-binding.md)
- [Candidate verification and approval](contracts/candidate-delivery.md)

## Understand and change

- [Current architecture](architecture.md), [ADR index](adrs/README.md) and the [decision register](../../../docs/reference/decisions.md) across all three ledgers
- [Shared product explanation](../../../docs/landscape/index.md), [diagrams](../../../docs/landscape/c4.md) and [open choices](../../../docs/landscape/questions.md)
- [Product domain YAML](../../../docs/domain/model.yaml), generated [rules](../../../docs/domain/rules.md) and the [combined glossary](../../../docs/reference/glossary.md)
- [Monorepo and runner proposal](../../../docs/migration-proposal.md)
- [Documentation maintenance](../../../docs/documentation.md)
- [Model gateway capabilities](product/model-gateway-capabilities.md)
- [Brand identity](brand/README.md), [trademark policy](brand/TRADEMARK.md) and [profile copy](brand/social-profile-copy.md)

## Evidence and planning

[Validation](validation.md) records exercised paths and limitations. [Dated delivery evidence](research/evidence/delivery-2026-09-11/README.md) supports the candidate path. These are observations at their recorded revisions, not blanket production qualification.

The [design chapter guide](PRODUCT-DESIGN.md) links the September planning baseline. [Planning exports](../backlog/README.md) retain acceptance criteria and dependencies; the tracker owns priority. [The documentation audit](research/2026-09-12-documentation-audit.md) records the inventory, corrections and review limits.

People and agents use these same Markdown sources. [llms.txt](../llms.txt) is a short discovery index; structured schemas and domain models supply the machine-readable data.
