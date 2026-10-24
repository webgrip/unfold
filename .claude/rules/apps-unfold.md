---
paths:
  - "apps/unfold/**"
---

# Unfold

The Unfold application is where people define, follow, steer and review the work Ploeg runs: durable operator sessions, intervention and reviewable evidence. The root `AGENTS.md` applies here too. Read [docs/architecture.md](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/architecture.md) and the relevant contract before a non-trivial change.

## Commands

Before delivery, run `mise run verify` from the repository root: it adds `design:check`, `icons:check`, `license:check` and the backlog check to `npm test`, which typechecks first, and `npm run check`. While iterating, `mise exec -- npm test` in this directory is the fast check. `mise run demo` starts the deterministic demo.

## Rules

- Never give an agent workspace the LiteLLM master key, Kubernetes credentials, operator session secrets or another user's credentials.
- Every mutation requires an authenticated identity and object authorization.
- Durable events survive disconnects. An intentional pause or cancel never becomes an automatic retry, and a restart never silently repeats paid work.
- Native harness session state is opaque. Portable hand-offs use repository changes and structured evidence.
- The tracker owns priority. Ploeg owns dispatch and execution.
- Never clip a label Unfold writes with an ellipsis; wrap or reword it, as [Browser UI](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/docs/browser-ui.md#accessibility) explains.

## Where things live

Contracts are in `docs/contracts/`, evidence in `docs/research/`, decisions in `docs/adrs/`, deployment in `ops/`. The session-operation contract for agents is [.agents/contracts/operate-agent-session.md](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/apps/unfold/.agents/contracts/operate-agent-session.md).
