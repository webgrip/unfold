---
type: tutorial
audience: [owner, operator, integrator, contributor]
owner: unfold
last_verified: 2026-10-01
verified_by: "Read apps/vloer/scripts/unified-demo.ts (prerequisite commands, ready/stopped/smoke-passed events, environment settings, cleanup), apps/vloer/package.json, root mise.toml and apps/ploeg/go.mod; on 2026-10-01 ran mise run demo-record, npm run replay:check and mise run demo-replay-conformance for the hosted replay section"
---

# Local shared execution demonstration

[The launcher](../../apps/vloer/scripts/unified-demo.ts) keeps a real Ploeg HTTP service, isolated PostgreSQL and the De Vloer browser workbench available for hands-on testing. It reuses the existing deterministic runtime: actual fixture code changes, an initially failing check, passing verification and an independent review. There are no model calls, paid credentials, external repository writes or cluster changes.

## Start

Unfold contains both applications at one revision, including the [shared execution contract](../../apps/vloer/docs/contracts/ploeg-execution.md). Use a regular macOS or Linux user with Node 24 through mise, Go 1.26 or later, Git and PostgreSQL 17 or later (`initdb` and `postgres`) on PATH. Go may fetch the dependencies already declared by Ploeg when its cache is cold. The launcher does not install software or start a system PostgreSQL service.

From the Unfold root:

```sh
mise run demo-unified
```

Wait for `unified-demo.ready`, then open the printed workbench URL. It includes a queued session ready to start. Both applications listen on `127.0.0.1` with available ports. No login is required in this explicitly labelled local demonstration; do not expose or forward its ports to other users.

Optional environment settings:

| Setting | Purpose |
| --- | --- |
| `PLOEG_PATH` | Absolute path to the matching Ploeg checkout; defaults to Unfold’s `apps/ploeg`. |
| `PG_BIN` | Directory containing PostgreSQL binaries, if they are not on PATH. |
| `VLOER_DEMO_PORT` | A fixed workbench port; otherwise an available port is chosen. |

## Exercise the shared session

1. Open the prepared session and press **Start crew**. Its execution panel now identifies the Ploeg execution and Work Item.
2. Change supervision to background, close or refresh the browser, and return. The server continues the same session. Take control again if it is still running.
3. To exercise pause and resume, pause before completion and wait for the confirmed stop. Resume explicitly; the execution identity stays the same while its generation changes. The fixture takes roughly 30 seconds without intervention.
4. Review the actual workspace patch and executed checks. Open the linked Ploeg Work Item to inspect its Shift, operator Run and retained report.
5. Create another fixture session to exercise cancellation. It remains cancelled until discarded with the rest of this temporary stack.

The demo runtime always repairs the supplied order-service fixture, regardless of a different objective you type. It does not invoke OpenCode or test a model's understanding. Candidate evidence is available after completion; **the delivery gate is not configured**, so this launcher does not verify delivery policy, grant a publication approval or publish a proposal. [The complete authority and delivery qualifications](managed-execution.md) exercise those separate boundaries. Tracker import is also outside this launcher; [its qualification evidence](../../apps/vloer/docs/research/evidence/delivery-2026-09-11/tracker-authority-qualification.json) uses the real applications and database with a tracker HTTP fixture.

A pause during repository initialization waits for the current Git metadata command to finish before confirming the stop. Each such command has a 30-second timeout, followed by at most one second to terminate an unresponsive child. This preserves resumable repository metadata; an explicit resume never relies on deleting unknown Git locks.

## Stop and clean up

Press **Ctrl+C** in the launcher terminal. From another terminal, send `SIGTERM` to the launcher PID printed in `unified-demo.ready`. Wait for `unified-demo.stopped`, which confirms that the application processes and PostgreSQL have stopped and the printed temporary directory has been removed.

PostgreSQL accepts connections only through a Unix socket inside that private temporary directory. It has no TCP listener and requires no database password file. The scoped Ploeg consumer token is generated for this process and never written to a configuration file or printed. De Vloer uses an in-memory SQLite store and an in-memory candidate signing key. Repository workspaces and PostgreSQL data use the temporary directory. Browser disconnects preserve the running session; stopping the launcher deliberately discards every test record. Start again for a clean stack.

An uncatchable process kill or host crash can leave temporary files or PostgreSQL running. Use the printed data directory to inspect that specific instance before cleanup; do not stop a system PostgreSQL service or delete another stack's directory. This launcher is not a persistence, restart-recovery or production deployment test.

## Automated smoke check

```sh
mise exec -- node apps/vloer/scripts/unified-demo.ts --smoke
```

Smoke mode launches the same stack, starts its prepared session, hands it to background supervision, waits for real fixture verification and independent review, and checks that the same Ploeg execution completed with exactly one operator Run. It prints `unified-demo.smoke-passed`, then performs the same cleanup and exits. The result records zero model calls and spend. A weekly CI job runs this page's two commands through `mise run docs-tutorial-smoke`, which skips when PostgreSQL is missing or the user is root. The longer [operator qualification](../../apps/vloer/scripts/qualify-ploeg.ts) additionally covers pause, cancellation, durable event replay and service-instance recovery.

## The hosted replay

The marketing site's `/demo/` page is a recorded replay of Vloer's own deterministic demo (`mise run demo`), not of this unified launcher ([ADR-0015](../adr/adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md)). It loads Vloer's unchanged interface; a small script answers its API from a recording, so nothing runs and nothing is sent anywhere. A banner names the Vloer commit and the recording date.

- The views and the demo session come from a real demo run. The session plays one event every 1.2 seconds after **Run the demonstration**, and its review can be accepted or rejected. **Restart the replay** in the banner starts over.
- Pausing, cancelling the session, instructions, a brief of your own, approving proposed work, crack attributions, opening packs and every settings change answer "This hosted replay is recorded. Run mise run demo to try this."

After a change to Vloer's interface, demo runtime or demo data, `mise run verify` fails in its `demo-replay` group until the recording is regenerated:

```sh
mise run demo-record
```

Commit the changed `apps/site/replay/` files in a separate commit scoped `site`, because the site only releases for commits under `apps/site`. `mise run demo-replay-conformance` drives the replay in Chromium and fails on any request the recording cannot answer, a page error or a CSP violation; it needs a local Chromium (`VLOER_CHROMIUM_BIN` or Playwright's own).
