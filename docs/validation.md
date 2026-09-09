# Validation evidence

This matrix distinguishes implementation from exercised behavior. Update the result column with the command, date and relevant revision when qualifying a release. Passing a local mock or rendered chart must not be recorded as a real provider or Kubernetes deployment.

| Scope | Reproducible check | Current qualification |
| --- | --- | --- |
| Strict source types | `npm ci` then `npm run typecheck` | PASS on 2026-09-09: Node 24.19.0, TypeScript 7.0.2, strict no-emit check |
| Core, lifecycle, HTTP, adapters and backlog tooling | `npm test` | PASS on 2026-09-09: 46 tests, zero failures, zero skipped; native Node test runner |
| Source syntax, relative imports, JSON and basic secret hygiene | `npm run check` | PASS on 2026-09-09; does not execute application entrypoints or constitute a security audit |
| Full deterministic delivery/review flow | Start `npm run demo`, then `npm run smoke` | PASS on 2026-09-09: actual baseline failure, repaired tests, independent review, Git diff and 16 durable events; zero model calls |
| Operator browser flow | `npm run test:browser` after installing Playwright Chromium | PASS on 2026-09-09 with Chromium 152.0.7977.0: demo, diff/checks/export, reload, new session, pause/instruction/resume/cancel, 390px mobile layout, navigation and live login/logout; no script/CSP errors |
| OpenCode wire adapter | OpenCode adapter tests in `test/` | API tests pass; actual OpenCode 1.18.30 server probe also passed authentication, managed config, provider registration, sessions, permissions, SSE and abort. No prompt or model call was sent; see the probe in `scripts/probe-opencode.mjs` |
| Command adapter | Command adapter tests in `test/` | Actual local child-process fixture with normalized JSON-lines; does not qualify arbitrary third-party runners |
| LiteLLM broker | Broker tests in `test/` | Local API contract tests; live gateway/model billing and revocation still require qualification |
| Kubernetes provisioning | Workspace/Kubernetes tests and `helm lint` / `helm template` | Local provisioning API tests pass; manifests statically inspected. Helm unavailable and its download blocked, so lint/render have NOT run locally. Docker image builds and target-cluster scheduling, egress and cleanup remain unqualified |
| CI hosting | GitHub/Forgejo quality workflows | Workflow source provided; no hosted CI run claimed until the repository is pushed and jobs pass |
| Performance and shared operations | Real repository pilot | No throughput, productivity improvement, high-availability or multi-tenant isolation benchmark claimed |
| VS Code client contract | `npm run extension:test` after extension `npm ci` | PASS on 2026-09-09: seven tests against actual isolated demo/live-auth Vloer servers; includes real fixture evidence, lifecycle, ownership, cookies and redirect rejection |
| VS Code compiled package | `npm run extension:build` and `npm run extension:package` | PASS on 2026-09-09: JavaScript compilation and 30.9 KB VSIX package, 12 packaged files; no marketplace publication |
| VS Code webview | `npm --prefix extensions/vscode run test:webview` with root Playwright dependencies and Chromium | PASS on 2026-09-09: actual demo evidence through shipped script, keyboard tabs, instructions, draft retention, inert hostile text, disconnect state, desktop and 390px layout; screenshots inspected |
| Actual VS Code desktop host | F5 extension-development configuration and platform installation checklist | NOT RUN: this environment has no working VS Code desktop binary. Native extension activation, SecretStorage integration and desktop accessibility still require qualification |
| Design and import artifacts | `npm run design:check`, `npm run backlog -- check`, and backlog tests in `npm test` | PASS on 2026-09-09: deterministic consolidated design, resolved local chapter links, 78 records, acyclic dependencies, all 30 gaps mapped, multiline CSV and explicit bounded session payloads; no external tickets created |

The added design, schemas and backlog specify future behavior. Their validation does not establish that ticket intake, canonical WorkOrders, independent live verification, fenced publication, team OIDC or cross-client isolation have been implemented. Audited Ploeg source was read at `67c4bc968455a99ef767bc8a24791ea1a87319cb`; Ploeg was not modified or deployed by this design/extension change.

Independent implementation review on 2026-09-09 reported **8/8 passing API/security tests** covering the real demo flow, event replay, a child-process SIGKILL followed by interruption without automatic rerun, pause/message/resume/cancel persistence, login/logout and request-origin controls, ownership/role restrictions, profile validation and credential redaction. Its standalone demo smoke also passed with retained baseline, repaired tests, independent review, a Git diff and 15 durable events. These results involved no paid provider or Kubernetes deployment. The final integrated suite may contain additional checks; record its result above separately.

## Release acceptance

The first reviewer should be able to reproduce the demo from Node 24 and Git, identify its explicit no-AI mode, observe a real failing baseline becoming green, inspect the retained diff and reviewer verdict, reload the session, and reproduce pause/resume or cancellation without an automatic retry.

A live pilot adds one registered repository, one authenticated operator, a working scoped key, remote workspace evidence, an actual human intervention, attributable spend and verified disposal. Record failures as blockers with the responsible component and next action. Do not erase uncertainty by labeling a partial setup “ready.”

## Known limits of the evidence

Zero npm runtime dependencies does not mean zero external dependencies: live work needs Git, the selected harness and tools required by the target repository; Kubernetes and LiteLLM are separately operated services. A clean TypeScript check does not prove runtime protocol compatibility. A read-only prompt is not a filesystem sandbox. A completed run is not a reviewed merge or a deployment.

## Reproduce browser qualification

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The browser check starts isolated temporary servers and cleans them up. It does not use a running deployment or submit inference. Set `VLOER_CHROMIUM_BIN` to an existing Chromium executable when the normal Playwright browser download is unavailable. The recorded run used the Chromium 152 binary distributed in `@sparticuz/chromium` with browser web-security and CSP enabled. Optional `VLOER_SCREENSHOTS` selects an output directory for screenshots. CI runs this check with its own installed Playwright Chromium.
