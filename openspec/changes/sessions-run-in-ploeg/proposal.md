# Sessions run in Ploeg, with a harness chosen per session and interaction kept

## Why

A "managed" session still executes inside Unfold: `Engine.execute`
([engine.ts:1049](../../../apps/unfold/src/engine.ts#L1049)) takes a key from
Ploeg ([:1063](../../../apps/unfold/src/engine.ts#L1063)) and runs OpenCode in a
Workspace Unfold builds itself ([runtime/opencode.ts](../../../apps/unfold/src/runtime/opencode.ts),
[runtime/kubernetes.ts](../../../apps/unfold/src/runtime/kubernetes.ts)) from the
`unfold-agent` image ([ops/agent/Dockerfile](../../../apps/unfold/ops/agent/Dockerfile));
Ploeg only admits and budgets it
([ploeg-execution.md:10-15](../../../apps/unfold/docs/contracts/ploeg-execution.md)).
The New-session dialog therefore offers one Runtime, "OpenCode"
([dialogs.js:75](../../../apps/unfold/public/views/dialogs.js#L75)), because
Unfold registers exactly one runtime from `config.runtime.kind`
([main.ts:32-33](../../../apps/unfold/src/main.ts#L32-L33)). System ADR-0002
(accepted, not implemented) says Ploeg executes everything, and application
ADR-0023 (accepted 2026-10-11, not implemented) plans that path, but without
pause, without interactive permission answers and with one OpenCode driver.

On 2026-10-13 the owner decided that sessions execute in `ploeg-worker`, that a
person chooses the Harness per session from what Ploeg offers for the Team,
that interactivity stays, and that Unfold shows the Harness and its version per
Run. The Harness choice and kept interactivity diverge from ADR-0023, so they
need a new record and a plan before code moves. The same day the owner also
decided that a person chooses the model per session from the models the Team's
Role policy lists, and that "Approve tool use automatically" stays as Ploeg's
per-Run `autoApprove` flag.

Application: `apps/unfold`. Ticket: **VIK: to be created** (no ticket exists
yet; the owner or the product-owner flow must create one before
implementation starts).

## What Changes

- **Application ADR-0044 (proposed)** records the owner's 2026-10-13 decisions
  and supersedes the diverging parts of ADR-0023: "no pause in v1", "steering
  reaches the next Round only", "interactive permission answers go away" and
  "the ACP adapter is the only driver" (as a product limit on Harness choice).
- Every non-demo session is submitted to Ploeg as a Work Item and executed by
  `ploeg-worker`. Unfold no longer prepares Workspaces or drives a Harness.
  **BREAKING** for deployments: `runtime.kind: "opencode" | "command"`,
  `runtime.backends`, the `docker` and `kubernetes` blocks, `execution`, the
  broker's LiteLLM settings and the `workspace*` Helm values are rejected with
  a migration message. `litellm.baseUrl` stays while Asks
  ([http.ts:158](../../../apps/unfold/src/http.ts#L158)) and the status page
  use it.
- **BREAKING**: `OpenCodeRuntime`, `CommandRuntime`, the Docker, Kubernetes,
  sandbox and relay Workspace code, `broker.ts`, `execution-authority.ts` and the
  `unfold-agent` image are removed. The demo runtime stays and still says it is
  a demo.
- The New-session dialog replaces "Runtime" and "Workspace placement" with a
  **Harness** picker filled from the chosen Team's Teams read in Ploeg: per
  Role the allowlist, the default, each entry's qualification and whether it is
  interactive and the last observed Harness version, and a **model** choice
  limited to the models the Team's Role policy lists, defaulting to the Role's
  model (design R1). Unfold sends both on the submission; Ploeg refuses a
  Harness or model the Team does not allow.
- **"Approve tool use automatically"** stays and is sent as Ploeg's per-Run
  `autoApprove` flag (design R2): checked, the Team's permission mode decides
  every permission at once while questions, messages and pause still reach the
  person; unchecked, every permission request is shown, and one left
  unanswered past its deadline is decided by the Team's permission mode, which
  Unfold shows.
- Every session is submitted as an **attended** Run. Permission requests,
  questions, mid-Run messages, pause and resume reach the person through
  Ploeg's proposed relay (ploeg-hq `interactive-runs`: the worker posts
  requests and long-polls an inbox; consumers read interactions and send
  `answer`, `message`, `pause` and `resume` per Run), not through a Workspace
  Unfold owns.
- Each Run in Unfold shows the Harness, profile, version and agent Ploeg
  recorded (`harness`, `harnessProfile`, `harnessVersion`, `harnessAgent`).
- Stored standalone sessions become read-only history with an explicit "Run
  again in Ploeg"; in-flight Operator Executions drain before the code that
  serves them is deleted.
- Renovate's `opencode` group and the `unfold-agent` regex manager are removed
  with the image; the OpenCode pin moves to Ploeg's agent images.
- Docs: concepts, landscape, the managed-execution guide, the execution
  contract and the front-end proposal are rewritten for the new path.

## Capabilities

### New Capabilities

- `ploeg-session-execution`: a non-demo session is a Ploeg Work Item executed by
  `ploeg-worker`; submission, commands, restart, retry and cancel; no local
  execution path remains.
- `harness-selection`: the Harness and model picker sourced from Ploeg per Team, the
  admission fields Unfold sends, and the Harness and version shown per Run.
- `run-interaction`: permission requests, questions, mid-Run messages, pause and
  resume and live events through Ploeg, including what "Approve tool use
  automatically" means per Harness.
- `session-execution-migration`: what happens to stored sessions, in-flight
  Operator Executions, the configuration and Helm surface, the `unfold-agent`
  image and Renovate rules.

### Modified Capabilities

None: `openspec/specs/` holds no capability yet.

## Non-goals

- Changing Ploeg. Its part is four ploeg-hq changes, in this order:
  `record-harness-per-run`, `submit-work-items` (the prerequisite: ADR-0023's
  `POST /api/v1/operator/work-items`), `select-harness-per-run` and
  `interactive-runs`. `select-harness-per-run` also carries the per-Role model
  list and the model on the admission, with Ploeg ADR-0103, which narrows Ploeg
  ADR-0039; `interactive-runs` carries `autoApprove`. Each lands and is released in ploeg-hq first, then a
  `ploeg`-scoped commit moves the pin (root ADR-0019).
- Changing production desired state. Namespaces, images, ExternalSecrets and the
  Ploeg Team plans live in `webgrip/homelab-cluster`; this change lists them as
  follow-ups only.
- Attaching a person live to the worker's terminal or editor (ADR-0023's
  rejected option S3) and taking control of the agent itself.
- A per-session budget above the Team pool, or new billing (root ADRs
  0005–0010).
- Retiring the Agent Host Protocol host (ADR-0012); it keeps projecting
  sessions and forwards their commands to Ploeg.
- Reworking the deterministic demo onto a Ploeg fixture.

## Impact

- Code (`apps/unfold`): `src/engine.ts`, `src/main.ts`, `src/types.ts`,
  `src/config.ts`, `src/http.ts`, `src/ploeg.ts`, `src/ahp/`,
  `src/runtime/*` (all but `demo.ts`), `src/broker.ts`,
  `src/execution-authority.ts`, `public/views/dialogs.js`,
  `public/views/session.js`, `apps/unfold/extensions/vscode`.
- APIs: Unfold's `/api/bootstrap` (runtimes and placements give way to Team
  harness offers), session create, command and event routes
  ([api.md](../../../apps/unfold/docs/contracts/api.md)); Ploeg's operator API
  grows per the four ploeg-hq changes.
- Deployment: `config/*.example.json`, `ops/local/*`, the `unfold` chart's
  `workspace*` values and `workspace-rbac.yaml`, `ops/agent/`,
  `ops/cluster/agent-sandbox/`; release scripts that publish `unfold-agent`.
- Dependencies: `renovate.json` opencode group and agent-image regex manager;
  `apps/unfold/mise.toml` `probe-opencode` tasks.
- Records: ADR-0044 (new), ADR-0023 (history link only); ADR-0003, ADR-0009,
  ADR-0011, ADR-0013, ADR-0014, ADR-0017, ADR-0019 and ADR-0040 lose their
  subject once the engine path is deleted; the README ledger notes it then.
