## 0. Before any code

- [ ] 0.1 Create the VIK ticket and put its id in proposal.md and ADR-0044
- [ ] 0.2 Owner ratifies or amends ADR-0044 and answers design.md Open Questions 1–7 and 9; record each answer in design.md
- [x] 0.3 Owner decided the per-session model (design.md R1, 2026-10-13: yes, from the Team's Role policy list) and "Approve tool use automatically" (R2: Ploeg's per-Run `autoApprove`)

## 1. Ploeg prerequisites (ploeg-hq first, then a `ploeg`-scoped pin commit each; ADR-0019)

- [ ] 1.1 ploeg-hq `record-harness-per-run` released (`harnessVersion` and `harnessAgent` on Run reads; `harness`, `model` and `observedHarness` per Role on `GET /api/v1/operator/teams`); pin moved in a `ploeg`-scoped commit
- [ ] 1.2 ploeg-hq `submit-work-items` released (`POST /api/v1/operator/work-items`, ADR-0023 increment 1, idempotent by `requestId`); pin moved in a `ploeg`-scoped commit
- [ ] 1.3 ploeg-hq `select-harness-per-run` released, after 1.1 and 1.2 (Harness and model on the submission, resolved Harness and model per Role in its response, allowlist, default and qualification per Role and the models each Role's policy lists on the Teams read, a model off the list refused, one workload per allowed Harness; with the record that narrows Ploeg ADR-0039); pin moved in a `ploeg`-scoped commit
- [ ] 1.4 ploeg-hq `interactive-runs` released, after 1.1 (`attended` and `autoApprove` on the submission, per-Run interaction reads, `answer`, `message`, `pause` and `resume`, events on `/api/v1/operator/events`, `interactive` per Harness on the Teams read); pin moved in a `ploeg`-scoped commit

## 2. Harness and version per Run (needs 1.1)

- [ ] 2.1 Parse `harness`, `harnessProfile`, `harnessVersion` and `harnessAgent` from Ploeg's Run shapes in `src/ploeg.ts`, null as "not recorded"
- [ ] 2.2 Show them per Run in the session view, the Work Item page and the Agents window; test with a fake Ploeg including a null version

## 3. Submission behind `ploeg.submit` (needs 1.2)

- [ ] 3.1 Persist `requestId` and fingerprint before submitting; replay after restart; test a lost response across a restart yields one Work Item
- [ ] 3.2 Server-side event polling into the SSE stream with a stored cursor; test resume without duplicates
- [ ] 3.3 Route cancel, try again and message to Ploeg's cancel, requeue and notes with persisted `commandId`s; test replay has no second effect

## 4. Harness and model picker (needs 1.3)

- [ ] 4.1 Replace `runtimes` and `placements` in `/api/bootstrap` with Team Harness offers (allowlist, default, qualification, `interactive`, `observedHarness`) and replace `models` with the models each Role's policy lists, the Role's model as default (R1); update `docs/contracts/api.md`
- [ ] 4.2 Replace Runtime and Workspace placement in `public/views/dialogs.js` with the Harness picker, and limit the Model field to the chosen Team's Role policy list with the Role's model preselected; label the observed version; refresh both on Team change; disabled state when Ploeg is unreachable
- [ ] 4.3 Send the Harness and model on the submission and in its fingerprint and show Ploeg's refusal without fallback; show the resolved Harness and model per Role from the response; Try again offers no Harness or model field; dialog (model off the list refused), restart-replay and API tests

## 5. Interaction through Ploeg (needs 1.4)

- [ ] 5.1 Submit sessions with `attended`; show permission requests and questions from Ploeg with deadline; answers with `commandId`; tests for answer, two answers, expiry at the deadline, pod death while waiting and Unfold restart while waiting
- [ ] 5.2 Send "Approve tool use automatically" as `autoApprove` on the submission and in its fingerprint (R2); checked: no permission requests shown, questions, messages and pause still offered; unchecked: every permission request shown and an expired one shows the Team's permission mode's decision; name the Team's permission mode instead of the checkbox for Harnesses that are not interactive; tests for both states and expiry
- [ ] 5.3 Mid-Run messages shown `delivered` or `carried_over` from Ploeg's answer or event; next-Run note label for Harnesses that are not interactive
- [ ] 5.4 Pause and resume as Ploeg commands; tests that a pause survives an Unfold restart, that `paused_too_long` and `paused_run_lost` show their reason and offer Try again, and that nothing requeues on its own
- [ ] 5.5 Render controls from the `interactive` flag; AHP host (`src/ahp/`) and `extensions/vscode` forward the same commands
- [ ] 5.6 Add the `front-end` check to `scripts/integration.mjs` with an in-process `ploeg-worker` on a deterministic ACP agent

## 6. Switch the default

- [ ] 6.1 Start submits to Ploeg; reject removed configuration (`runtime.kind` other than `demo`, the other `runtime.*` workspace keys, `docker`, `kubernetes`, `execution`, the broker's LiteLLM settings; keep `litellm.baseUrl` for Asks) with migration messages; config tests
- [ ] 6.2 Mark stored local sessions `interrupted` with "Run again in Ploeg"; keep managed sessions reconciling under the Operator Execution contract; count open Operator Executions on `/api/health`
- [ ] 6.3 Update `config/*.example.json`, `ops/local/*` and the chart (`values.yaml`, `values.schema.json`, `values.live.example.yaml`, drop `workspace*` and `workspace-rbac.yaml`); `helm template` with an old values file fails
- [ ] 6.4 Operations guide: drain step for open Operator Executions

## 7. Delete (after the drain)

- [ ] 7.1 Startup refusal while a non-final Operator Execution session remains; test
- [ ] 7.2 Delete `src/runtime/*` except `demo.ts`, `src/broker.ts`, `src/execution-authority.ts`, the non-demo engine paths and their tests; test that no module imports them
- [ ] 7.3 Delete `ops/agent/`, `ops/cluster/agent-sandbox/`, the `unfold-agent` build and publish steps in `.forgejo/` and the release scripts, and its row in `docs/operations/artifacts.md`
- [ ] 7.4 Remove Renovate's `unfold-agent` regex manager, the `opencode` package rule and the `apps/unfold/ops/agent/Dockerfile` match; remove the `probe-opencode` tasks from `apps/unfold/mise.toml` and `scripts/opencode-version.mjs`, `probe-docker.mjs`
- [ ] 7.5 Update the README ledger rows of ADR 0003, 0009, 0011, 0013, 0014, 0017, 0019 and 0040, with a dated More Information bullet in each record

## 8. Docs

- [ ] 8.1 Rewrite `docs/concepts/inside-a-run.md`, `docs/concepts/how-work-flows.md`, `docs/landscape/components.md` and `docs/workflows/managed-execution.md` for sessions in Ploeg, Harness choice and interaction
- [ ] 8.2 Retire `apps/unfold/docs/contracts/ploeg-execution.md` once deleted; update `apps/unfold/docs/ploeg-front-end.md` (pause and steering now follow ADR-0044) and `apps/unfold/docs/architecture.md`, `browser-ui.md`
- [ ] 8.3 Glossary: retire Placement, Supervision, Step and Operator Execution in `docs/domain/model.yaml` when their code goes; run `mise run domain`
- [ ] 8.4 Run `python3 scripts/validate_adr_consistency.py .`

## 9. Homelab follow-ups (in `webgrip/homelab-cluster`, not this repository)

- [ ] 9.1 Ploeg Team plans list allowed Harnesses, defaults, permission modes and interaction timeouts; worker images carry the allowed Harnesses
- [ ] 9.2 Unfold's operator consumer gets `execute` on the Teams it submits to
- [ ] 9.3 After step 7: remove Unfold's workspace namespace, RBAC, Kata warm pool, `workspace*` values, the `unfold-agent` pin and the LiteLLM master key ExternalSecret for Unfold

## 10. Delivery

- [ ] 10.1 Run `mise run verify` and paste the output in each pull request
- [ ] 10.2 Run `mise run docs-check` for every pull request that changes docs or an AGENTS.md, and paste the output
