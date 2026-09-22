# Validation evidence

## Unified tracker and delivery increment — 2026-09-11

The prerelease preparation passes **210 application tests**, TypeScript checking and the source/JSON check (**118 modules, 28 JSON files** at the recorded run), plus **41 editor extension tests**. The consolidated design rebuild and link check pass. The ordinary browser and Ploeg browser suites pass on Chromium **151.0.7922.34**, including desktop/mobile layout and outage recovery. New tracker browser fixtures additionally validate canonical-source preview, import, stale Start and inert tracker content. Both Dockerfiles build locally, both Helm configurations lint/render, and the VSIX packages successfully.

Ploeg passes the full Go test suite with embedded PostgreSQL, `go vet ./...`, `go build ./...`, Helm lint, four chart golden renderings, ADR ledger and both new OpenSpec changes. New store regressions exercise claim/admission lock inversion, a webhook upsert waiting on newly established ownership, pristine pending-Run retirement, stale source/target rejection, receipt/approval identity and publication uncertainty. The scope-retention regression was observed failing before its fix.

The [evidence index](research/evidence/delivery-2026-09-11/README.md) separates browser fixtures from real cross-service qualification. Real PostgreSQL and both HTTP services prove one existing tracker Work Item survives a deliberately lost admission response. The independent verifier proves failure before a fix, passing checks after it, rejection of fake success output, canonical commit ancestry, and one receipt reused after restart. Desktop/mobile screenshots show the real candidate approval UI.

These results qualify the implementation for a prerelease pilot. No provider inference, live tracker mutation, candidate publication, cluster deployment or scale qualification was performed. A live publisher executor and active-worker takeover remain unimplemented; the Ploeg publication barrier is implemented and defaults closed. Approved base bundles and verifier policy files are operator-provisioned. A configured verifier service is part of the trusted control plane, while candidate processes are isolated from its credentials.

The [local shared execution launcher](operations/local-unified-demo.md) passes its real PostgreSQL/Ploeg smoke check and browser Start. SIGINT during execution stops both HTTP services and PostgreSQL, then removes the temporary directory. The workbench database and signing key stay in memory; the smoke check rejects private-key or password files. Its delivery gate remains unconfigured.

Release preparation reproduced a demo pause/resume defect: interruption during `git init` left incomplete metadata in 3 of 44 stress trials. Waiting for the child to close still left a Git lock in 1 of 240 trials. The final fix lets each bounded Git metadata command finish before acknowledging pause, validates the local repository, and waits for actual child termination. It passed 240 of 240 abort-and-explicit-resume trials. [Deterministic regressions](../test/runtime-demo.test.ts) fail against the earlier behavior and cover partial initialization, retained files, confirmed process exit and forced termination of a child that ignores SIGTERM. No lock deletion, hidden retry or workspace reset is used.

## Earlier qualification records

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
| Pull transport and relay | `test/relay.test.ts`, Docker pull tests, `node scripts/probe-docker.mjs de-vloer-agent:1.18.30 --pull` | PASS on 2026-09-10: the real worker process relays requests, streams and cancels through the relay; the fake-engine Docker lifecycle passes in pull mode; the live probe against the hardened image passed in pull mode with no published port, reaching a workbench bound to loopback through Docker Desktop in 4.3 s |
| Agent Host Protocol host | `test/ahp.test.ts` | PASS on 2026-09-10: two Node WebSocket clients negotiate 0.9.0, create and drive a demo session, receive identical envelopes, read the changeset and are refused with a bad token or an old version. No VS Code desktop build has attached yet |
| Sandbox CRD provisioner | `test/runtime-sandbox.test.ts` | PASS on 2026-09-10 against a fake API server and a fake pool worker for the cold and warm paths; the agent-sandbox controller is not installed on the homelab cluster, so no live claim was made |
| Signed candidates | `test/attestations.test.ts` | PASS on 2026-09-10: Ed25519 DSSE envelopes verify with the served key, a demo candidate's provenance and trace statements match the manifest, and the offline verifier rejects a modified patch |
| Session placement | Engine, configuration and HTTP placement tests in `test/`; extension `npm test` | PASS on 2026-09-09: default and explicit placement, rejection of disabled or malformed placements, demo deployments exposing none, persistence across restart; extension client tests pass with the new optional field |
| Kubernetes provisioning | Workspace/Kubernetes tests and `helm lint` / `helm template` | Local provisioning and export API tests pass, including writer deletion before read-only export and blocked capture when deletion is unconfirmed. The exact inline export helper also ran locally against real Git; manifests statically inspected. `helm lint` and `helm template` (Helm 4.2.4 via mise) pass on 2026-09-09 including `workspaceAgentSecrets` rendering into the agent container. The agent image builds locally; target-cluster scheduling, egress and cleanup remain unqualified |
| Image hardening | `trivy image --scanners vuln` (Trivy 0.74.0) on both images built locally on 2026-09-10 | PASS: `de-vloer` (runtime base, 151 MB) and `de-vloer-agent` (dev base, 470 MB) report zero findings at every severity; the previous Debian agent image reported 14 critical, 83 high, 140 medium and 128 low. The hardened agent image passed the live Docker probe |
| Release pipeline | `.forgejo/workflows/*.yml`, `.releaserc.cjs`, `scripts/release-prepare.mjs` | Hosted on 2026-09-10: [run 6](https://forgejo.webgrip.dev/webgrip/de-vloer/actions/runs/6) passed checks and cut [v0.3.0-rc.1](https://forgejo.webgrip.dev/webgrip/de-vloer/releases/tag/v0.3.0-rc.1) with the VSIX attached and the chart, root and extension manifests at the same version; [run 7](https://forgejo.webgrip.dev/webgrip/de-vloer/actions/runs/7) deployed the docs site under the `de-vloer` prefix. Two earlier runs failed before `main` existed on Forgejo (semantic-release requires every configured branch) and before the deploy step was pointed at the repository root; both are fixed on `development`. `v0.3.0-rc.1` did not trigger the release-published chain: its VSIX asset made the release plugin publish through a draft, which Forgejo reports as `updated`, so the asset upload moved into the publish workflow |
| Release distribution | `on_release_published.yml` on the `release` event | PARTIAL on 2026-09-10 across runs 11 ([v0.3.0-rc.2](https://forgejo.webgrip.dev/webgrip/de-vloer/releases/tag/v0.3.0-rc.2)) and 16 ([v0.3.0-rc.3](https://forgejo.webgrip.dev/webgrip/de-vloer/releases/tag/v0.3.0-rc.3)). Green in both: both images built for `linux/amd64` and `linux/arm64`, passed the CVE budget gate at zero critical and zero high, and were signed and attested through OpenBao Transit; the chart pushed to `oci://harbor.webgrip.dev/webgrip/charts/de-vloer`; the VSIX attached to the release. Open VSX and the Marketplace recorded a notice because no token is configured. The GitHub mirror failed in run 11 because `github.com/webgrip/de-vloer` does not exist and is disabled from run 16 on. The Forgejo mirror was green in run 11 and failed in run 16 after pushing the image: `de-vloer:0.3.0-rc.3` is in the Forgejo registry, and the failing step is not identifiable without an authenticated job log. The reusable mirrors one image, so `de-vloer-agent` reaches Harbor only. Harbor is LAN-only and the digests were not re-inspected from off the network |
| Release trigger | semantic-release on `development` | Runs 6, 10 and 15 cut `v0.3.0-rc.1`, `rc.2` and `rc.3`. Run 13 reported success and cut no version for a `fix` commit; that commit appears in `rc.3`, so no change was lost, and the cause is not identifiable without an authenticated job log. Watch for a repeat before trusting a single run to have released |
| Performance and shared operations | Real repository pilot | No throughput, productivity improvement, high-availability or multi-tenant isolation benchmark claimed |
| VS Code client contract | `npm run extension:test` after extension `npm ci` | PASS on 2026-09-09: ten tests against actual isolated demo/live-auth Vloer servers; includes linked task imports, a Vikunja API fixture, real candidate downloads, lifecycle, ownership, cookies and redirect/size rejection |
| VS Code compiled package | `npm run extension:build` and `npm run extension:package` | PASS on 2026-09-09: JavaScript compilation and 38.04 KB VSIX 0.2.0 package, 12 packaged files; no marketplace publication |
| VS Code webview | `npm --prefix extensions/vscode run test:webview` with root Playwright dependencies and Chromium | PASS on 2026-09-09: actual imported task and candidate evidence through shipped script, keyboard tabs, instructions, draft retention, inert hostile text, disconnect state, actionable failure guidance, desktop and 390px layout; screenshots inspected |
| Actual VS Code desktop host | F5 extension-development configuration and platform installation checklist | NOT RUN: this environment has no working VS Code desktop binary. Native extension activation, SecretStorage integration and desktop accessibility still require qualification |
| Design and import artifacts | `npm run design:check`, `npm run backlog -- check`, and backlog tests in `npm test` | PASS on 2026-09-09: deterministic consolidated design, resolved local chapter links, 78 records, acyclic dependencies, all 30 gaps mapped, multiline CSV and explicit bounded session payloads; no external tickets created |

The added design, schemas and backlog specify future behavior. Their validation does not establish that unattended ticket intake, canonical WorkOrders, independent live verification, fenced publication, team OIDC or cross-client isolation have been implemented. Audited Ploeg source was read at `67c4bc968455a99ef767bc8a24791ea1a87319cb`; The subsequent Ploeg candidate is commit `6c3e4f8`; its patch was never applied and has been removed from this repository, with no deployment or Go/PostgreSQL qualification claimed.

Independent implementation review on 2026-09-09 reported **8/8 passing API/security tests** covering the real demo flow, event replay, a child-process SIGKILL followed by interruption without automatic rerun, pause/message/resume/cancel persistence, login/logout and request-origin controls, ownership/role restrictions, profile validation and credential redaction. Its standalone demo smoke also passed with retained baseline, repaired tests, independent review, a Git diff and 15 durable events. These results involved no paid provider or Kubernetes deployment. The final integrated suite may contain additional checks; record its result above separately.

## Unified baseline, 10 September 2026

The [connected qualification record](research/evidence/unified-2026-09-10/README.md) supersedes earlier pending Ploeg integration notes for this increment. It includes screenshots from the actual Ploeg/PostgreSQL and De Vloer services, with real Git fixture verification and zero inference calls.

| Gate | Result |
| --- | --- |
| Workbench application tests | PASS: 174 tests, zero failures or skips |
| Workbench source check and strict types | PASS: native Node check and TypeScript no-emit |
| Existing full browser workflow | PASS: actual demo checks, exports, pause/resume/cancel, auth, desktop and mobile |
| Ploeg operator browser workflow | PASS: scoped lanes/details, bigint pages, unknown spend, stale-data clearing and inert hostile evidence |
| Editor client | PASS: 41 tests and compilation; native VS Code UI not run |
| Ploeg | PASS: all Go packages across the full run and corrected HTTP fixture rerun; final complete HTTP/store packages, build and vet after the last lifecycle fixes |
| Chart | PASS: lint, four goldens, actual worker secret-isolation assertions and before/after baseline renders |
| Actual cross-service integration | PASS: real PostgreSQL/HTTP authority, same-execution supervision, durable replay, pause/resume, cancel, application restart and retained candidate |
| Live provider/cluster/scale | Not run; no paid calls, deployment, settlement or throughput claim |

The implemented operator binding reuses Work Item/Shift/Run. Canonical tracker WorkOrders, independent verifier/publisher enforcement and general agent messaging remain proposed. Configured shared execution cannot silently fall back to the standalone broker. A confirmed pause may retain a capped gateway key until TTL; this is documented cooperative execution control rather than per-request hostile-process fencing.

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

The Ploeg patch was applied in a disposable checkout at its documented baseline; all 22 resulting files matched candidate `6c3e4f8`. This checks patch integrity, not Go behavior. Go/gofmt/build/vet/tests and embedded PostgreSQL execution remain pending after the environment cancelled the official toolchain download. The patch handoff has since been removed because the patch was never applied.

## 0.2.0 task and candidate iteration

The provider adapters use documented read APIs for Forgejo, GitHub, GitLab, ClickUp and Vikunja. Tests run actual HTTP fixtures with credential, pagination, revision, scope, malformed response and redirect checks. They do not qualify the user's provider accounts. The fixture source is labeled as demonstration data.

The task API is exercised through live authenticated Vloer servers and actual SQLite persistence. It checks stale previews, closed tasks, configured execution authority at import/start/resume, concurrent and alias deduplication, cross-user privacy, unknown credential discovery, echoed-token redaction before persistence/prompting, and descriptions whose JSON encoding expands. The full demo imports a task, requires an explicit start, produces actual checks and exports a candidate that remains byte-identical after restart. No inference was submitted.

All 15 candidate tests pass, including source Git exclusion handling and integrity checks before reusing a retained remote export. Candidate tests clone the exported bundle and apply its binary patch to reproduce the exact final tree, including new files, committed and staged changes, deletion, executable modes and symlinks. Source HEAD/index stay unchanged. Hooks, local Git configuration and content filters are not executed. Unsupported repositories, recognizable secrets, size limits and damaged downloads are rejected. Independent verification and publication remain explicitly `not_performed` in the manifest.

The latest browser and editor screenshots are actual application renders in [the README](../README.md). Browser tests additionally cover disabled conflicting actions while a lifecycle response remains in flight, so a streamed status update cannot invite a click that is silently dropped.

The release still needs live provider/gateway and Kubernetes qualification, container builds and Helm rendering, and a real VS Code desktop installation test. No automated PR/MR publication or task write-back is implemented. These are operational and roadmap limits, not failures hidden by the demonstration.
