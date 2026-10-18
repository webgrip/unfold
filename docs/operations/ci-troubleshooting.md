---
type: how-to
audience: [contributor, operator, agent]
owner: unfold
last_verified: 2026-10-14
verified_by: "Symptoms collected from Forgejo runs 456 to 1588 between 2026-09-29 and 2026-10-14; cancellations matched against Forgejo's request log and its action_run table; each fix checked against the script or workflow it names (scripts/verify-gate.mjs, scripts/release-repair.mjs, scripts/ci-warnings.mjs, scripts/ploeg-pin.mjs, .forgejo/workflows). Storage-side causes are described by symptom only; their fixes live in the cluster's runbooks."
---

# Troubleshoot CI and releases

Symptoms seen on Unfold's Forgejo Actions, what caused them and what fixed them. [CI and release workflows](ci.md) explains how the pipeline is meant to work.

## Read a run without a token

The repository is public. Without a Forgejo token you can still read:

* the task list: `https://forgejo.webgrip.dev/api/v1/repos/webgrip/unfold/actions/tasks`
* a job's raw log: `https://forgejo.webgrip.dev/webgrip/unfold/actions/runs/<run>/jobs/<index>/attempt/1/logs`
* a run's real state: fetch the job page with `curl -L` and read `state.run` in the `data-initial-post-response` attribute (HTML-escaped JSON).

Re-running a job needs the web interface.

## Symptoms

| Symptom | Cause | Fix |
| --- | --- | --- |
| A run is red but every job log looks fine or says "job is not started" | A pre-execution error, which no log shows. Read `state.run.preExecutionError` on the job page. On Forgejo 15.0.2 a reusable-workflow caller's `with:` that read a skipped job's outputs caused it (run 456). | Gate the called workflow through its `enabled` input; see [Gating a reusable workflow](ci.md#gating-a-reusable-workflow). |
| Red with "job is not started" or `context canceled`, a few seconds after the start | Someone cancelled the run in the web interface. Forgejo itself cancels a run only for a workflow whose `concurrency` sets `cancel-in-progress: true` (pull requests, docs, nightly, schedule); `on_source_change.yml` queues instead, so a merge never cancels a `development` push run. Every cancelled source run since the rename (2026-10-02 to 2026-10-14, runs 1218, 1559 and 1588 among them) matches a `POST /webgrip/unfold/actions/runs/<n>/cancel` in Forgejo's log, sent by a signed-in browser seconds after a merge. A cancelled run also shows as a red commit status. Check `state.run.status`. | Re-run it in the web interface. Don't cancel a `development` push run: its `release` job is how a merge ships. To find who cancelled, search Forgejo's log for `actions/runs/<n>/cancel`. |
| `release` tagged a head that never passed `checks` | A pull request was merged while a `release` job was running, and the newer head's push run was then cancelled by hand (run 1218, rc.56). | Wait for a running `release` job to finish before merging, and don't cancel the newer push run; re-run it if it was cancelled. |
| `checks` runs for about 40 minutes; the summary shows groups `CANCELLED` and none `FAILED` | A gate in a later, unprinted group failed, and a cancelled gate never exited (run 538). | Fixed by [`scripts/verify-gate.mjs`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/scripts/verify-gate.mjs): a cancelled gate is killed after a grace period and an orphaned process counts as a failure. |
| `warnings` is red with "job is not started" while `checks` passed | The dependent job was never scheduled while another pull request's run was active (runs 1131, 1183, 1184). Not a real warning. | Re-run the job in the web interface; a re-push can hit the same race. |
| `fatal: tag '<x>' already exists` in `release` | An orphaned release commit: the tag points at a release commit that is no longer on `development` (`git merge-base --is-ancestor <tag> origin/development` fails). | Revert the duplicate release commit, then `git merge --no-ff` the orphan so the tag is reachable again. Never move a published tag. |
| `release` fails with HTTP 500 right after `Created tag` | Forgejo inserted the tag's release row while semantic-release created the release (`duplicate key … UQE_release_n`). Tag and release commit are fine. | [`scripts/release-repair.mjs`](https://forgejo.webgrip.dev/webgrip/unfold/src/branch/development/scripts/release-repair.mjs) runs after a failed release and adopts the existing tag. |
| `checks` dies in under a minute with `<tool>@<version> is not in the lockfile` | A tool version in a `mise.toml` changed without `mise.lock`, and CI's install refuses a tool the lockfile does not hold. | Run `mise install` from the root and commit `mise.lock` with the change. |
| A `fix(ploeg)` pull request has a red `ploeg-docs` with `Stale decision register`, a stale combined glossary or `Stale landscape`; Renovate reports `Artifact file update failure` | The new Ploeg release adds an ADR or changes its domain model, and these pages are generated from the pinned contract bundle (run 1400, rc.16). On [#369](https://forgejo.webgrip.dev/webgrip/unfold/pulls/369) Renovate logged `Post-upgrade command './scripts/renovate-ploeg-docs.sh' has not been added to the allowed list in allowedCommands` and ran nothing. | homelab-cluster's Renovate configuration must allow the script in `allowedCommands`. Until it does, and always for the landscape, which needs a browser, run `mise run domain`, `mise run docs-decisions` and `mise run landscape` on the branch and push. |
| A `build(ploeg)` pull request has a red `ploeg-docs` with `Combined glossary conflicts` and adds `ploeg-glossary-conflicts.txt`; Renovate may also report an artifact failure on older branches | The new Ploeg release defines a term Unfold's model also defines (rc.17: Tenant and Client). No regeneration can fix that. | Follow [the term clash steps](ci.md#the-ploeg-pin-pull-request) on the Renovate branch, as [#339](https://forgejo.webgrip.dev/webgrip/unfold/pulls/339) did, then delete the report. |
| A test waiting for a process to disappear times out only in CI | The runner's PID 1 never reaps orphans, so a killed process stays a zombie and `kill(pid, 0)` keeps succeeding. | Treat state `Z` in `/proc/<pid>/stat` as gone. Reproduce with `unshare --user --map-root-user --pid --fork --mount-proc node --test <file>`. |
| A publish step answers `GET ghcr.io … 401` at the anonymous pull check | The GitHub package exists but is private; new GHCR packages start private. | Check with `curl -s -o /dev/null -w '%{http_code}' "https://ghcr.io/token?service=ghcr.io&scope=repository:webgrip/<package>:pull"` (200 public, 401 private, 403 absent). The owner changes the visibility in GitHub, then re-runs the job. |
| A release hangs about 30 minutes, then `context deadline exceeded` | Something still addressed the old repository name: Forgejo's redirect turned a POST into a GET, and a `git ls-remote` to a deleted repository waited for credentials (run 750). | Use `webgrip/unfold` everywhere; the publisher sets `GIT_TERMINAL_PROMPT=0` and fails on a redirected write. |
| Release assets answer HTTP 500 `unable to seek`, registry pushes answer 400, or a job is reaped after "Job succeeded" | Forgejo's object storage is full or failing; writes appear to succeed. | Not a pipeline problem. Free the storage (cluster runbook), then re-run the failed publish jobs. |
