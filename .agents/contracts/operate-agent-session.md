# Operate-agent-session contract

Context: De Vloer. Applies when operating this repository's workbench.

- Start the fixture demonstration with `npm run demo`, then open `http://127.0.0.1:4080`. This path uses no model calls. [Coworker walkthrough](../../docs/operations/demo.md).
- Live startup is `npm start -- --config config/live.local.json`. Administrator environment and runtime setup are defined in [live operation](../../docs/operations/live.md), not in this contract.
- Repository and crew IDs come from authenticated `GET /api/bootstrap`. Select registered values; user input cannot define process commands or endpoints.
- Use the [HTTP contract](../../docs/contracts/api.md) for session actions, durable event replay and human responses. User-facing commands remain subject to authenticated ownership and role checks.
- The tracker owns priority. [`GET /api/ploeg`](../../docs/contracts/api.md) reads authenticated, scoped Ploeg work and evidence snapshots; it is not a dispatch or tracker-mutation endpoint.
- Preserve the session budget across interventions. For shared sessions follow [Ploeg execution](../../docs/contracts/ploeg-execution.md) and [recovery](../../docs/operations/unified-baseline.md#recovery); standalone retry and settlement rules do not apply to them.
- Evidence and current qualification limits are in [validation](../../docs/validation.md). The application supports one SQLite writer and one application replica.
- Repository gates: `npm ci`, `npm run typecheck`, `npm test`, `npm run check`; chart gates: `helm lint ops/helm/de-vloer` and `helm template de-vloer ops/helm/de-vloer`.
- Credentials are supplied through supported environment variables or deployment Secrets. No secret values belong in this file, skills or event output.
