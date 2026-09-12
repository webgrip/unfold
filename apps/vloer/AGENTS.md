# De Vloer

De Vloer is the human workbench beside Ploeg: durable operator sessions, isolated remote workspaces, interchangeable agent runtimes, and evidence people can review.

Trunk is `development`. Use conventional commits. Keep intent in names, types, tests and ADRs; do not add explanatory source comments. Machine directives and exported API documentation are permitted.

Read `docs/architecture.md` and the relevant contract before non-trivial changes. Treat code and executable tests as current implementation evidence. Mark proposed behavior explicitly.

The tracker owns prioritization. Ploeg owns unattended dispatch. De Vloer owns interactive sessions and human intervention. Never give agent workspaces the LiteLLM master key, Kubernetes credentials, operator session secrets or another user's credentials.

All mutations require authenticated identity and object authorization. Durable events survive disconnects. An intentional pause/cancel must not become an automatic retry. A restart must never silently repeat paid work. Native harness session state is opaque; portable handoffs use repository changes and structured evidence.

Run `npm test` and `npm run check` before delivery. Keep live-provider tests opt-in. A demo must identify itself clearly, execute real checks, and never invent model calls or spend.

Keep contracts in `docs/contracts/`, evidence in `docs/research/`, decisions in `docs/adrs/`, deployment in `ops/`. Repository facts belong in the repo; reusable operating procedures belong in `skills/`.

Stage only paths you own. Other agents may be editing this checkout. Do not commit until the owning agent requests it.
