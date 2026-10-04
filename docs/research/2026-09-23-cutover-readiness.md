# Release cutover readiness, 23 September 2026

Date: 23 September 2026, against `development` at `352fa52` (Forgejo holds `40e574f`). This is a record, not current guidance. The [structured record](2026-09-23-cutover-readiness.json) holds the observations; the [first cutover playbook](../operations/first-cutover.md) holds the procedure. It follows the [12 September record](2026-09-12-cutover-readiness.json).

Glide is still not ready to publish its first releases. Most blockers from 12 September are fixed in code or configuration. One new blocker stops the release preview: the GitHub mirror has none of the 67 release-channel notes, so the preview preflight fails its mirror comparison.

## Method

* Ran `mise run release-check`, the strict import verifier (`GLIDE_REQUIRE_IMPORT_NOTES=true`), the release distribution unit tests and `mise run verify` locally.
* Read `scripts/release_preflight.py`. It has no dry-run mode: every step after the GitHub repository read needs a CI secret or the Forgejo OIDC token. The anonymous steps were reproduced by hand; the others were not run.
* Compared refs on both Glide remotes with `git ls-remote`.
* Read the Forgejo and GitHub APIs anonymously, and `homelab-cluster` main at `d916989`.

No registry, OpenBao or Kubernetes call used credentials. Nothing was pushed, tagged, dispatched or published, and no model was called.

## What changed since 12 September

| Blocker on 12 September | Now | Evidence |
| --- | --- | --- |
| Release-channel notes | Fixed on Forgejo | 67 note refs on Forgejo; the strict import verifier passes (16 Vloer, 51 Ploeg). |
| Notes mirror could prune GitHub to empty | Fixed | `0968cf0` requires both source gates; `ae10513` also requires a push and `GLIDE_RELEASES_ENABLED`. |
| Ploeg image had no CVE budget | Fixed | `97bd509` runs the Grype and OpenVEX gate on `ploegd` before signing. |
| Signature propagation | Fixed in code, not yet exercised | Ploeg distribution waits for the signing output; every copied image is verified before and after the copy. |
| Source metadata and Ploeg module export | Fixed in code, not yet exercised | Labels and annotations name `github.com/webgrip/glide`; `publish_release.py` exports `apps/ploeg` to `github.com/webgrip/ploeg`. |
| OIDC signing role | Fixed in GitOps, not verified | `webgrip/glide` is in the `cosign-signer` claims since `9f521ad6` (13 September). |
| Open VSX bridge | Fixed in GitOps, not verified | `VSCODE_EXTENSION_REPO=glide`. |
| Renovate | Fixed for Glide | Discovery by `renovate` topic since 18 September; Glide has the topic and a Dependency Dashboard. |

## The OIDC and Renovate discrepancy

The [migration record](../migration.md) says Glide is in the signing role and the Open VSX bridge. The 12 September record says both are blocked. Both statements were true at their revision: the record read GitOps `80f553a`, and `9f521ad6` added Glide the next day. Renovate moved from a hand-kept list to topic discovery on 18 September, which closes that gate for Glide.

The repository and anonymous reads cannot show:

* whether the OpenBao bootstrap job has re-written the role since `9f521ad6`
* whether a Glide OIDC token receives the `cosign-signer` policy
* whether the `OVSX_PAT` secret exists on `webgrip/glide` and Open VSX accepts it

The preview preflight answers all three.

## New findings

* **GitHub has no notes.** Heads and all 70 tags match. Since `ae10513`, only an enabled release push copies the notes, so the preflight cannot pass while the gate is closed. A one-time manual copy fixes this. After the next native mirror sync, check that the copied notes are still there.
* **The old repositories are only partly frozen.** Actions are off and neither has released since rc.16 and rc.7. Both still carry the `renovate` topic and received a `chore(renovate)` commit on 22 September, so they still accept writes. Old Ploeg has four open pull requests.
* **Both applications have release-worthy commits.** There are 7 Vloer and 17 Ploeg `feat`/`fix` commits since the last tags. The empty trigger commit in the playbook should not be needed. Only the preview can predict the versions.
* **Recent CI:** runs 30 and 31 failed `checks` while the notes were missing; run 33 at `40e574f` passed. No preview has run since the 14 September preflight fix.

## Stage status

| Stage | Status | What is missing |
| --- | --- | --- |
| 1. Starting state | Ready | Local gates pass. The live cluster baseline was not read; GitOps pins are unchanged since 12 September. |
| 2. Release blockers | Blocked | GitHub notes, the old-repository freeze and a passing preflight (signing, credentials). |
| 3. Preview | Blocked by stage 2 | Dispatch **[Workflow] On Release Preview** on `development` after the notes copy. |
| 4. Recovery | Needs owner action | A fresh restore test, or choose an isolated pilot. |
| 5. Publish | Needs owner action | Set `GLIDE_RELEASES_ENABLED=true`, then push to `development`. |
| 6. Verify artifacts | Not run | Follows publication. |
| 7. GitOps pilot | Not run | A reviewed `homelab-cluster` change. |
| 8. Live session | Not run | Needs an approved budget. |
| 9–10. Rollback and close | Not run | Only after a pilot. |

## Limits

Anonymous reads cannot see repository secrets, variables, job logs or cluster state. The value of `GLIDE_RELEASES_ENABLED` was not observed; no release job has run. Only a preview run or the first publication can close the gates marked "not verified" or "not yet exercised".
