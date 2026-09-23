---
type: tutorial
audience: [owner, operator, contributor]
owner: vloer
last_verified: 2026-09-23
verified_by: "Read apps/vloer/package.json (demo, smoke), src/config.ts (demo repository, crew, port 4080, VLOER_DATA_DIR), src/runtime/demo.ts, scripts/smoke.mjs and examples/order-service"
---

# A ten-minute coworker walkthrough

Purpose: show a consistent way to supervise work and judge its evidence. The demo uses a deterministic agent substitute. It executes real Git and Node commands locally, with no LLM requests, provider credentials or invented token counts. Ten minutes is a walkthrough budget, not a measured onboarding benchmark.

## Before the meeting

Use Node 24 and Git. From the Glide root, run `mise run demo`; from `apps/vloer`, run:

```sh
npm run demo
```

Open `http://127.0.0.1:4080`. The explicit demo flag creates the demo operator without a login. Bind only to the default loopback interface for a local demonstration. The same data directory retains sessions across restarts; choose a fresh directory for a fresh demonstration:

```sh
VLOER_DATA_DIR=.vloer/demo-walkthrough npm run demo
```

Starting this path requires no `npm install`. Running the development type checker separately requires `npm ci`.

## Walkthrough

| Time | Show or do | What a coworker should understand |
| --- | --- | --- |
| 0–1 min | Open the workbench and identify its demo mode | This is executable workflow evidence with no AI spend |
| 1–2 min | Create an **Order service** session with **Delivery crew**. Use “Fix the rounding regression and independently review the resulting diff.” as the objective | Repository, crew and spending authorization are explicit inputs |
| 2–4 min | Start the session and inspect the run activity | The implementer copies an isolated fixture, proves the regression, edits source and reruns the checks |
| 4–5 min | Open the baseline and verification artifacts | A deliberately failing `node --test` baseline is followed by passing tests; green status has executable evidence |
| 5–6 min | Inspect **Workspace changes** and **Independent review checks** | The reviewer inspects the actual diff and reruns tests; approval is a distinct result |
| 6–7 min | Reload the browser and return to the session | A connection does not own the work; the result and event history are durable |
| 7–8 min | Create a second session; start and pause it while it runs, add an instruction, then resume | A recorded instruction and a deliberate execution intervention have different meanings |
| 8–9 min | Inspect the review outcome and `$0.00` demo accounting | Completion does not merge or deploy; a person reviews the change |
| 9–10 min | Explain the live deployment boundary and one-replica limit | Agents move to the server or Kubernetes in live mode; this demo has not qualified a provider or cluster |

The fixture is `examples/order-service`. Its defect is rounding `1.005` to cents with `Math.round(amount * 100)`. The deterministic writer adds `Number.EPSILON`, verifies the correction and retains the Git diff. The reviewer runs a separate check invocation. If a session fails, inspect its actual artifact and blocker; do not present it as a successful demo.

For a repeatable automated demonstration, leave the server running and execute:

```sh
npm run smoke
```

The smoke script refuses a non-demo server. It creates and runs a session, checks retained baseline/verification/review evidence, requires a real Git diff and explicit reviewer approval, and checks the durable history. It does not call a model. A second invocation creates a separate isolated session.

## CTO discussion

The proposition is a shared operating contract: people choose an objective and authorization, then spend their attention on blockers and evidence. Crew configuration and portable procedures carry reusable knowledge; the harness can change behind a maintained adapter. Workspaces run remotely when the service is deployed remotely.

Roles execute in sequence and the control plane has one writer. The fixture does not exercise live model access, OIDC sign-in or cluster isolation. Completing it does not merge a change, and a read-only prompt is not a sandbox. See the [architecture](../architecture.md) and [validation evidence](../validation.md).

The next useful experiment is one real repository and one small live budget. Time registration through reviewed result, test an interrupted connection, exercise a human response, settle the spend and verify cleanup. Compare that complete workflow with an existing workbench before expanding this implementation.
