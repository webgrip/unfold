# De Vloer documentation

De Vloer provides durable operator sessions, agent workspaces, intervention and reviewable evidence. Start with the guide for your task.

## Try it

- [Local fixture demonstration](operations/demo.md)
- [Shared Ploeg demonstration](operations/local-unified-demo.md): both applications and PostgreSQL without model calls

## Operate

- [Live operation](operations/live.md): standalone setup, identity, workspaces and intervention
- [Shared execution setup and recovery](operations/unified-baseline.md)
- [Task connections](operations/task-connections.md)
- [Release procedure](operations/release.md)

## Integrate

- [HTTP API](contracts/api.md)
- [Ploeg execution](contracts/ploeg-execution.md)
- [Canonical tracker binding](contracts/ploeg-tracker-binding.md)
- [Candidate verification and approval](contracts/candidate-delivery.md)

## Understand and change

- [Current architecture](architecture.md) and [ADR index](adrs/README.md)
- [Shared product explanation](landscape/index.md), [diagrams](landscape/c4.md) and [open choices](landscape/questions.md)
- [Product domain YAML](domain/model.yaml) and generated [glossary](domain/glossary.md) and [rules](domain/rules.md)
- [Monorepo and runner proposal](monorepo-transition.md)
- [Documentation maintenance](documentation.md)

## Evidence and planning

[Validation](validation.md) records exercised paths and limitations. [Dated delivery evidence](research/evidence/delivery-2026-09-11/README.md) supports the candidate path. These are observations at their recorded revisions, not blanket production qualification.

The [design chapter guide](PRODUCT-DESIGN.md) links the September planning baseline. [Planning exports](../backlog/README.md) retain acceptance criteria and dependencies; the tracker owns priority. [The documentation audit](research/2026-09-12-documentation-audit.md) records the inventory, corrections and review limits.

People and agents use these same Markdown sources. [llms.txt](../llms.txt) is a short discovery index; structured schemas and domain models supply the machine-readable data.
