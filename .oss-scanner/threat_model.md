# Unfold threat model for the OSS Scanner

This is the brief for Anthropic's [OSS Scanner](https://github.com/anthropics/oss-scanner). Scan `apps/unfold`. Start with [apps/unfold/docs/architecture.md](../apps/unfold/docs/architecture.md), its *Boundaries* and *Trust and spending* sections in particular, and the contracts in `apps/unfold/docs/contracts/`.

## What Unfold does and where untrusted input enters

Unfold is a self-hosted Node.js (TypeScript, no build step) web application where people define, follow, steer and review agent work. A separate engine, Ploeg, admits, budgets and runs that work. Unfold talks to Ploeg's operator API with one consumer token, starts and supervises agent sessions in workspaces (`local`, `docker`, Kubernetes or agent-sandbox backends), shows transcripts, diffs and evidence, and publishes reviewed results. It serves a browser UI from `apps/unfold/public`, a JSON API, a WebSocket Agent Host Protocol endpoint for the VS Code extension, and an MCP endpoint.

Accounts have one of three roles: `admin`, `operator`, `viewer`. Sign-in is a local password, OIDC, or the editor device-code flow (`vle_` tokens). `unfold-mcp` acts for a person through short-lived delegated `vlm_` tokens limited to `delegatedRoutes` in `src/auth.ts`.

Treat all of the following as attacker-controlled:

- **Anything an agent produces:** transcripts, messages and thoughts (rendered as Markdown), tool calls and results, diffs, file names, branch names, commit messages, test output, SVG and card art, run logs, outcome summaries. A coding agent reads hostile repositories and tickets, so assume prompt injection already happened.
- **Tracker content** imported through task sources (Vikunja, ClickUp): titles, descriptions, labels, HTML bodies.
- **Repository content** cloned into a workspace and every path it contains.
- **Unauthenticated HTTP and WebSocket clients**, and authenticated clients acting above their role or on objects that are not theirs.
- **Text from Ploeg's API** that originated with agents or trackers (Work Item text, notes, findings, review bodies). Ploeg itself is trusted for authorization decisions.

Trusted: the installer's configuration file and environment, the Kubernetes API, the OIDC issuer, the LiteLLM gateway and Ploeg's authorization answers.

## Components that matter most

1. `src/http.ts`, `src/auth.ts`, `src/oidc.ts`, `src/mcp-auth.ts`, `src/mcp-http.ts`, `src/person-proof.ts`: authentication, session cookies, CSRF (`x-unfold-request` and `Sec-Fetch-Site`), role and object authorization on every route, OIDC callback, device-code sign-in, delegated tokens.
2. `src/ahp/` and especially `src/ahp/websocket.ts`: a hand-written WebSocket server (framing, masking, fragmentation, size limits) and the Agent Host Protocol handlers behind it.
3. Hand-written parsers and sanitizers that agent text passes through: `src/markdown.ts` (HTML to Markdown), `src/rich-text.ts`, `src/svg-sanitize.ts`, `src/redaction.ts`, and the browser renderers in `public/core/` (for example `public/core/markdown.js`). The browser CSP is in `src/http.ts`; a bypass of it counts.
4. `src/runtime/`: workspace isolation, git access (`git-access.ts`), command execution (`command.ts`), Docker and Kubernetes placement, the relay. Path traversal, argument injection, symlink following and credential exposure into a workspace live here.
5. `src/delivery*.ts`: publishing reviewed work with git; a hostile branch, path or ref must not push elsewhere.
6. `src/store.ts`: SQLite storage and its encryption key handling; SQL built from input.
7. `src/tasks.ts`, `src/task-binding.ts`, `src/ploeg.ts`, `src/execution-authority.ts`: tracker imports and the boundary with Ploeg.

## Out of scope

- `apps/ploeg`: an unpacked release bundle of the separate Ploeg project, scanned there. A bug in how Unfold *uses* Ploeg's API is in scope.
- `apps/site` (static marketing site), `docs/`, `knowledge/`, `openspec/`, `apps/unfold/docs/`, `apps/unfold/workbench/`, `apps/unfold/test/` and `apps/unfold/public/vendor/` (vendored three.js and html-to-image).
- The `local` runtime backend giving an agent the server's OS user and files. That is documented as trusted single-user development only. The same escape from the `docker`, Kubernetes or sandbox backends is in scope.
- Demo mode (`npm run demo`) doing demo things. A demo flaw that also exists in live mode is in scope.
- That an `admin` can change configuration, flags and accounts, or that an `operator` can start, steer and spend on sessions within their budget. Doing either as a lower role, or on another person's object, is in scope.
- Prompt injection that only changes what an agent writes in its own pull request for a person to review.
- Vulnerabilities inside dependencies. Unfold's runtime dependencies are `ws` and `hyparquet-writer` (with its reader `hyparquet`). A bug in how Unfold feeds them input is in scope.

## How to exercise it

- `cd /src/apps/unfold`. The image runs as the unprivileged `node` user. Dependencies, including dev dependencies, and Ploeg's contract bundle in `apps/ploeg` are installed. `npm test` typechecks, then runs the Node test suite offline; the first run is logged at `/src/unfold-test.log`.
- `npm run demo` starts a server on `127.0.0.1:4080` with deterministic fixtures and no model calls. Create accounts with `UNFOLD_USER_NAME=a UNFOLD_USER_ROLE=viewer UNFOLD_USER_PASSWORD=... npm run user:add` (use the same `UNFOLD_DATA_DIR` as the server).
- `test/security-http.test.ts` shows how the suite drives the HTTP server; a reproducer in that style is the most useful form.
- The VS Code extension in `extensions/vscode` is a client of the AHP endpoint and an example of a well-behaved peer.

## How we rate severity

- **Critical:** unauthenticated access to any authenticated API, WebSocket or MCP action; code execution in the Unfold server process; reading the store key, Ploeg consumer token, LiteLLM credential, OIDC client secret or another person's session; an agent workspace on the `docker`, Kubernetes or sandbox backend getting any of those.
- **High:** a `viewer` performing an `operator` or `admin` action, or anyone acting on another person's sessions or linked sessions; script execution in the browser from agent, tracker or repository text (stored XSS, including a CSP bypass); CSRF on a state-changing route; a delegated `vlm_` or editor `vle_` token reaching beyond its documented routes or lifetime; delivery pushing to a repository or ref nobody approved; starting paid work or raising a budget without the authority the UI requires.
- **Medium:** reading another person's data with a valid account; unauthenticated denial of service from a small number of requests (for example a WebSocket frame or Markdown input that hangs or exhausts the process); SVG or Markdown output that fetches external resources; secrets missed by redaction in a place Unfold displays.
- **Low:** information leaks of non-secret metadata, error-text echo, denial of service needing sustained load, hardening gaps without a demonstrated path.

## How we want reports and patches

- Name the route, WebSocket message or function, the role the attacker holds (none, `viewer`, `operator`, agent output, tracker text) and what they gain.
- Give a reproducer as a `node:test` test in `apps/unfold/test/` that fails on the current code.
- Patches: the smallest change that closes the path, with that regression test. Code comments are limited to exported API documentation; put reasoning in the report.
