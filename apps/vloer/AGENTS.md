# Vloer

Vloer is Ploeg's front end: durable operator sessions, intervention and reviewable evidence. The root `AGENTS.md` applies here too. Read [docs/architecture.md](docs/architecture.md) and the relevant contract before a non-trivial change.

## Commands

Run `mise exec -- npm test` and `mise exec -- npm run check` in this directory before delivery. `mise run demo` from the Glide root starts the deterministic demo.

## Rules

- Never give an agent workspace the LiteLLM master key, Kubernetes credentials, operator session secrets or another user's credentials.
- Every mutation requires an authenticated identity and object authorization.
- Durable events survive disconnects. An intentional pause or cancel never becomes an automatic retry, and a restart never silently repeats paid work.
- Native harness session state is opaque. Portable hand-offs use repository changes and structured evidence.
- The tracker owns priority. Ploeg owns dispatch and execution.

## Where things live

Contracts are in `docs/contracts/`, evidence in `docs/research/`, decisions in `docs/adrs/`, deployment in `ops/`. The session-operation contract for agents is [.agents/contracts/operate-agent-session.md](.agents/contracts/operate-agent-session.md).
