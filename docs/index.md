# Glide

Glide contains Vloer, the human workbench, and Ploeg, the service that admits and coordinates managed agent work. They share a repository and product language while keeping separate applications, deployments and versions.

Use [Vloer on its own](../apps/vloer/docs/operations/demo.md) for local interactive work. The [shared demonstration](workflows/local-demo.md) adds Ploeg and PostgreSQL without paid model calls. Ploeg is required only for work admitted to Ploeg.

| Your task | Start here |
| --- | --- |
| Understand the system | [Responsibilities and system landscape](landscape/index.md) |
| Operate or integrate Vloer | [Vloer documentation](../apps/vloer/docs/index.md) |
| Operate or integrate Ploeg | [Ploeg documentation](../apps/ploeg/docs/index.md) |
| Follow shared execution | [Setup and recovery](workflows/managed-execution.md) |
| Read product terms | [Generated glossary](domain/glossary.md) and its [YAML source](domain/model.yaml) |
| Make a change | [Repository instructions](../AGENTS.md) and [documentation policy](documentation.md) |
| Understand the migration | [Import and qualification](migration.md) |
| Switch releases to Glide and run a live pilot | [First cutover playbook](operations/first-cutover.md) |

The [system decision ledger](adr/index.md), [Vloer ledger](../apps/vloer/docs/adrs/README.md) and [Ploeg ledger](../apps/ploeg/docs/adrs/README.md) have different scopes. Existing proposed records remain proposed. Ploeg's [execution domain](../apps/ploeg/docs/domain/overview.md) defines its implementation vocabulary; a Ploeg Run may contain several Vloer role runs.

Markdown is the readable source for both people and agents. TechDocs renders those files; [llms.txt](../llms.txt) provides a short reading index. The schemas and models remain beside their owner. Generated pages are checked against their structured source.
