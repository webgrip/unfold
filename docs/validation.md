# Validation evidence

This matrix distinguishes implementation from exercised behavior. Update the result column with the command, date and relevant revision when qualifying a release. Passing a local mock or rendered chart must not be recorded as a real provider or Kubernetes deployment.

| Scope | Reproducible check | Current qualification |
| --- | --- | --- |
| Strict source types | `npm ci` then `npm run typecheck` | PASS on 2026-09-09: Node 24.19.0, TypeScript 7.0.2, strict no-emit check |
| Core, lifecycle, HTTP, adapters and backlog tooling | `npm test` | PASS on 2026-09-09: 90 tests, zero failures, zero skipped; native Node test runner, final 0.2.0 integration run |
| Source syntax, relative imports, JSON and basic secret hygiene | `npm run check` | PASS on 2026-09-09: 47 source modules and 20 JSON files; does not execute application entrypoints or constitute a security audit |
| Full deterministic delivery/review flow | Start `npm run demo`, then `npm run smoke` | PASS on 2026-09-09: actual baseline failure, repaired tests, independent review, Git diff and 18 durable events; zero model calls; repeated successfully from the extracted 0.2.0 archive without installed npm dependencies |
| Operator browser flow | `npm run test:browser` after installing Playwright Chromium | NOT RE-QUALIFIED on 2026-09-09 for the placement change: the suite currently fails at its cancel step both with and without this change, because the resumed demonstration session has already reached `failed` with both runs queued when the test clicks Cancel (`This session has already ended.`). Investigate the browser check's resume timing before trusting a fresh run. Earlier PASS on 2026-09-09 with Chromium 152.0.7977.0: task preview/import/start, immutable bundle/patch/manifest downloads, duplicate import, changed-revision handling, inert tracker text, existing demo/lifecycle flows, a deterministic delayed-response control race, desktop and 390px layout, login/logout; no script/CSP errors |
| OpenCode wire adapter | OpenCode adapter tests in `test/` | API tests pass; actual OpenCode 1.18.30 server probe also passed authentication, managed config, provider registration, sessions, permissions, SSE and abort. No prompt or model call was sent; see the probe in `scripts/probe-opencode.mjs` |
| Command adapter | Command adapter tests in `test/` | Actual local child-process fixture with normalized JSON-lines; does not qualify arbitrary third-party runners |
| LiteLLM broker | Broker tests in `test/` | Local API contract tests; live gateway/model billing and revocation still require qualification |
| Docker workspace backend | Docker backend tests in `test/` and `node scripts/probe-docker.mjs de-vloer-agent:1.18.30` | PASS on 2026-09-09 against Docker Desktop 4.79 (Engine 29.5.3, arm64) with the image built from `ops/agent/Dockerfile`: fake-engine lifecycle, failure detail and placement tests; live probe cloned the fixture inside the container, matched the base commit, verified read-only root, dropped capabilities, no privilege, no master key, loopback port, authenticated health, managed configuration, provider alias, adapter session, reconciliation endpoints, event stream, abort, candidate capture after a confirmed stop and container removal in 4.4 s to readiness with zero inference requests. No paid prompt was sent |
| Session placement | Engine, configuration and HTTP placement tests in `test/`; extension `npm test` | PASS on 2026-09-09: default and explicit placement, rejection of disabled or malformed placements, demo deployments exposing none, persistence across restart; extension client tests pass with the new optional field |
| Kubernetes provisioning | Workspace/Kubernetes tests and `helm lint` / `helm template` | Local provisioning and export API tests pass, including writer deletion before read-only export and blocked capture when deletion is unconfirmed. The exact inline export helper also ran locally against real Git; manifests statically inspected. `helm lint` and `helm template` (Helm 4.2.4 via mise) pass on 2026-09-09 including `workspaceAgentSecrets` rendering into the agent container. The agent image builds locally; target-cluster scheduling, egress and cleanup remain unqualified |
| Image hardening | `trivy image --scanners vuln` (Trivy 0.74.0) on both images built locally on 2026-09-10 | PASS: `de-vloer` (runtime base, 151 MB) and `de-vloer-agent` (dev base, 470 MB) report zero findings at every severity; the previous Debian agent image reported 14 critical, 83 high, 140 medium and 128 low. The hardened agent image passed the live Docker probe |
| Release pipeline | `.forgejo/workflows/*.yml`, `.releaserc.cjs`, `scripts/release-prepare.mjs` | Workflows parse; the prepare script was exercised locally for `0.3.0-rc.0` and produced the VSIX and lockstep versions before the manifests were restored; chart renders with images defaulting to `appVersion`. No hosted run claimed: the cosign role entry, repository secrets and Open VSX namespace are prerequisites recorded in [releases](operations/release.md) |
| Performance and shared operations | Real repository pilot | No throughput, productivity improvement, high-availability or multi-tenant isolation benchmark claimed |
| VS Code client contract | `npm run extension:test` after extension `npm ci` | PASS on 2026-09-09: ten tests against actual isolated demo/live-auth Vloer servers; includes linked task imports, a Vikunja API fixture, real candidate downloads, lifecycle, ownership, cookies and redirect/size rejection |
| VS Code compiled package | `npm run extension:build` and `npm run extension:package` | PASS on 2026-09-09: JavaScript compilation and 38.04 KB VSIX 0.2.0 package, 12 packaged files; no marketplace publication |
| VS Code webview | `npm --prefix extensions/vscode run test:webview` with root Playwright dependencies and Chromium | PASS on 2026-09-09: actual imported task and candidate evidence through shipped script, keyboard tabs, instructions, draft retention, inert hostile text, disconnect state, actionable failure guidance, desktop and 390px layout; screenshots inspected |
| Actual VS Code desktop host | F5 extension-development configuration and platform installation checklist | NOT RUN: this environment has no working VS Code desktop binary. Native extension activation, SecretStorage integration and desktop accessibility still require qualification |
| Design and import artifacts | `npm run design:check`, `npm run backlog -- check`, and backlog tests in `npm test` | PASS on 2026-09-09: deterministic consolidated design, resolved local chapter links, 78 records, acyclic dependencies, all 30 gaps mapped, multiline CSV and explicit bounded session payloads; no external tickets created |

The added design, schemas and backlog specify future behavior. Their validation does not establish that unattended ticket intake, canonical WorkOrders, independent live verification, fenced publication, team OIDC or cross-client isolation have been implemented. Audited Ploeg source was read at `67c4bc968455a99ef767bc8a24791ea1a87319cb`; The subsequent Ploeg candidate is commit `6c3e4f8`; its patch is included under `integrations/ploeg/`, with no deployment or Go/PostgreSQL qualification claimed.

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

## First implementation increment

The final 50-test run includes authenticated failure/history/SSE replay across restart, safe runtime vocabulary under corrupted error metadata, and missing-executable versus actual exit-127 handling. Both full browser suites passed on Chromium 152 with CSP enabled, including keyboard navigation at both widths, draft/focus and streaming scroll behavior, narrow failure guidance, and hostile text remaining inert. No inference requests were submitted.

The Ploeg patch was applied in a disposable checkout at its documented baseline; all 22 resulting files matched candidate `6c3e4f8`. This checks patch integrity, not Go behavior. Go/gofmt/build/vet/tests and embedded PostgreSQL execution remain pending after the environment cancelled the official toolchain download. See [the patch handoff](../integrations/ploeg/README.md).

## 0.2.0 task and candidate iteration

The provider adapters use documented read APIs for Forgejo, GitHub, GitLab, ClickUp and Vikunja. Tests run actual HTTP fixtures with credential, pagination, revision, scope, malformed response and redirect checks. They do not qualify the user's provider accounts. The fixture source is labeled as demonstration data.

The task API is exercised through live authenticated Vloer servers and actual SQLite persistence. It checks stale previews, closed tasks, configured execution authority at import/start/resume, concurrent and alias deduplication, cross-user privacy, unknown credential discovery, echoed-token redaction before persistence/prompting, and descriptions whose JSON encoding expands. The full demo imports a task, requires an explicit start, produces actual checks and exports a candidate that remains byte-identical after restart. No inference was submitted.

All 15 candidate tests pass, including source Git exclusion handling and integrity checks before reusing a retained remote export. Candidate tests clone the exported bundle and apply its binary patch to reproduce the exact final tree, including new files, committed and staged changes, deletion, executable modes and symlinks. Source HEAD/index stay unchanged. Hooks, local Git configuration and content filters are not executed. Unsupported repositories, recognizable secrets, size limits and damaged downloads are rejected. Independent verification and publication remain explicitly `not_performed` in the manifest.

The latest browser and editor screenshots are actual application renders in [the README](../README.md). Browser tests additionally cover disabled conflicting actions while a lifecycle response remains in flight, so a streamed status update cannot invite a click that is silently dropped.

The release still needs live provider/gateway and Kubernetes qualification, container builds and Helm rendering, and a real VS Code desktop installation test. No automated PR/MR publication or task write-back is implemented. These are operational and roadmap limits, not failures hidden by the demonstration.
