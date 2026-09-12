# Ploeg documentation

Use these sources for the current implementation. The [architecture](architecture.md) distinguishes implemented behavior from remaining limits; the [ADR index](adrs/README.md) distinguishes accepted decisions from proposals.

## Try it

The [local shared demonstration](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/operations/local-unified-demo.md) runs Ploeg, De Vloer and PostgreSQL without model calls.

## Operate

- [Managed workers and recovery](ops/managed-workers.md)
- [Tracker configuration](ops/board.md)
- [CI and infrastructure](ops/ci-and-infra.md)
- [Experimental releases](ops/release-versioning.md)

## Integrate

- [Published contracts and schemas](contracts/README.md)
- [Managed worker control](contracts/worker-control.md)
- [Tracker execution binding](contracts/tracker-execution.md)
- [Operator candidate delivery](contracts/operator-delivery.md)

## Understand and change

- [Architecture](architecture.md)
- [Domain source](domain/model.yaml), generated [glossary](domain/glossary.md) and [rules](domain/rules.md)
- [Decision ledger](adrs/README.md)
- [Product intent and design history](design.md)
- [Shared product questions](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/landscape/questions.md)
- [Documentation maintenance](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/documentation.md)

The [backlog](backlog.md), [OpenSpec changes](../openspec/changes/) and [research dossiers](research/) retain plans and evidence. Their existence does not establish implemented behavior or current priority. The [documentation audit](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/research/2026-09-12-documentation-audit.md) records review coverage.

Human readers and agents use these same Markdown pages. JSON schemas define published wire shapes; YAML is the source for generated domain views. The [machine discovery index](../llms.txt) links here without copying the specification.
