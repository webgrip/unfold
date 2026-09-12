# Ploeg

Developed in [Glide](../../README.md). Run repository-wide checks from the Glide root.

Ploeg is a self-hosted service for authorizing and coordinating agent work. Tracker assignments can start unattended workers; De Vloer can run interactive sessions under the same execution authority. PostgreSQL retains the work, leases, outcomes, evidence and accounting.

*Ploeg* is Dutch for a work crew or shift. The software is experimental and uses release-candidate versions. Qualification applies to specific tested paths, not every provider or deployment.

## Start here

- [Documentation](docs/index.md): current guides, contracts and design history.
- [Architecture](docs/architecture.md): what runs where and who holds authority.
- [Managed workers](docs/ops/managed-workers.md): required configuration and recovery.
- [De Vloer's local demonstration](../../docs/workflows/local-demo.md): both applications and PostgreSQL, using a deterministic fixture with no model calls.

The older [Compose fixture](ops/local/docker-compose.yml) and [claim demo](ops/local/demo.sh) predate managed worker authentication. They do not configure the managed bootstrap and signing requirements. Use the shared demonstration above for current onboarding; the old fixture needs migration before it can serve as a current setup guide.

## How it works

Verified tracker webhooks enqueue work. KEDA or the CronJob executor starts workers that must claim authorized work. Configured Shift plans coordinate roles and review rounds. Workers invoke a harness, report results and renew their leases. KEDA polls queue depth; idle queue checks do not require model calls.

[De Vloer](https://forgejo.webgrip.dev/webgrip/de-vloer) supplies the human workbench and delegated workspace execution. Its shared path retains one Ploeg Work Item, Shift and operator Run across changes in supervision. Supported [tracker selections](docs/contracts/tracker-execution.md) can bind an existing queued Work Item. Manual-origin admission need not create a tracker ticket.

Management credentials remain in the controller. [Scoped worker capabilities](docs/contracts/worker-control.md) authorize control and inference. Unknown spending stays unresolved until trusted reconciliation.

The source includes Vikunja and ClickUp tracker integrations, Forgejo and GitLab forge integrations, team plans, tracker write-backs and multiple harness adapters. Capabilities differ by provider. See the [implementation map](docs/architecture.md#6-providers-harnesses-and-delivery) and [published contracts](docs/contracts/README.md).

Delegated [candidate delivery](docs/contracts/operator-delivery.md) records verified evidence and candidate-bound approval. Its live publisher executor is not enabled. A completed Run is not automatically a published or accepted result.

## Develop

Run tooling through mise and follow the [repository instructions](AGENTS.md). The [CI workflow](.forgejo/workflows/on_pull_request.yml) defines Go build, vet and tests, Helm validation and golden renders, and brand/license checks. The [backlog](docs/backlog.md) records planning history; the tracker owns priority.

## License

Code: [Apache-2.0](LICENSE).

The name *Ploeg* and the Ploeg mark are trademarks — §6 of that licence grants
no rights in them, deliberately. [docs/brand/TRADEMARK.md](docs/brand/TRADEMARK.md)
says what you may do with them without asking (reproduce them, link, say your
software works with Ploeg) and the two things that need permission (shipping a
fork under the name, implying endorsement). Settled in
[ADR-0022](docs/adrs/0022-the-name-and-mark-are-trademarks-not-cc-licensed-artwork.md).
