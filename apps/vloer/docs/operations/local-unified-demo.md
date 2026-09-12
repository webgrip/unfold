# Local shared execution demonstration

[The launcher](../../scripts/unified-demo.ts) keeps a real Ploeg HTTP service, isolated PostgreSQL and the De Vloer browser workbench available for hands-on testing. It reuses the existing deterministic runtime: actual fixture code changes, an initially failing check, passing verification and an independent review. There are no model calls, paid credentials, external repository writes or cluster changes.

## Start

Keep the matching Ploeg checkout beside De Vloer. Both should include the [shared execution contract](../contracts/ploeg-execution.md). Use a regular macOS or Linux user with Node 24 through mise, Go 1.25 or later, Git and PostgreSQL 17 or later (`initdb` and `postgres`) on PATH. Go may fetch the dependencies already declared by Ploeg when its cache is cold. The launcher does not install software or start a system PostgreSQL service.

From the De Vloer checkout:

```sh
mise exec -- node scripts/unified-demo.ts
```

Wait for `unified-demo.ready`, then open the printed workbench URL. It includes a queued session ready to start. Both applications listen on `127.0.0.1` with available ports. No login is required in this explicitly labelled local demonstration; do not expose or forward its ports to other users.

Optional environment settings:

| Setting | Purpose |
| --- | --- |
| `PLOEG_PATH` | Absolute path to the matching Ploeg checkout; defaults to `../ploeg`. |
| `PG_BIN` | Directory containing PostgreSQL binaries, if they are not on PATH. |
| `VLOER_DEMO_PORT` | A fixed workbench port; otherwise an available port is chosen. |

## Exercise the shared session

1. Open the prepared session and press **Start crew**. Its execution panel now identifies the Ploeg execution and Work Item.
2. Change supervision to background, close or refresh the browser, and return. The server continues the same session. Take control again if it is still running.
3. To exercise pause and resume, pause before completion and wait for the confirmed stop. Resume explicitly; the execution identity stays the same while its generation changes. The fixture takes roughly 30 seconds without intervention.
4. Review the actual workspace patch and executed checks. Open the linked Ploeg Work Item to inspect its Shift, operator Run and retained report.
5. Create another fixture session to exercise cancellation. It remains cancelled until discarded with the rest of this temporary stack.

The demo runtime always repairs the supplied order-service fixture, regardless of a different objective you type. It does not invoke OpenCode or test a model's understanding. Candidate evidence is available after completion; **the delivery gate is not configured**, so this launcher does not verify delivery policy, grant a publication approval or publish a proposal. [The complete authority and delivery qualifications](unified-baseline.md) exercise those separate boundaries. Tracker import is also outside this launcher; [its qualification evidence](../research/evidence/delivery-2026-09-11/tracker-authority-qualification.json) uses the real applications and database with a tracker HTTP fixture.

A pause during repository initialization waits for the current Git metadata command to finish before confirming the stop. Each such command has a 30-second timeout, followed by at most one second to terminate an unresponsive child. This preserves resumable repository metadata; an explicit resume never relies on deleting unknown Git locks.

## Stop and clean up

Press **Ctrl+C** in the launcher terminal. From another terminal, send `SIGTERM` to the launcher PID printed in `unified-demo.ready`. Wait for `unified-demo.stopped`, which confirms that the application processes and PostgreSQL have stopped and the printed temporary directory has been removed.

PostgreSQL accepts connections only through a Unix socket inside that private temporary directory. It has no TCP listener and requires no database password file. The scoped Ploeg consumer token is generated for this process and never written to a configuration file or printed. De Vloer uses an in-memory SQLite store and an in-memory candidate signing key. Repository workspaces and PostgreSQL data use the temporary directory. Browser disconnects preserve the running session; stopping the launcher deliberately discards every test record. Start again for a clean stack.

An uncatchable process kill or host crash can leave temporary files or PostgreSQL running. Use the printed data directory to inspect that specific instance before cleanup; do not stop a system PostgreSQL service or delete another stack's directory. This launcher is not a persistence, restart-recovery or production deployment test.

## Automated smoke check

```sh
mise exec -- node scripts/unified-demo.ts --smoke
```

Smoke mode launches the same stack, starts its prepared session, hands it to background supervision, waits for real fixture verification and independent review, and checks that the same Ploeg execution completed with exactly one operator Run. It prints `unified-demo.smoke-passed`, then performs the same cleanup and exits. The result records zero model calls and spend. The longer [operator qualification](../../scripts/qualify-ploeg.ts) additionally covers pause, cancellation, durable event replay and service-instance recovery.
