# Release-channel notes missing from Forgejo, 12 to 22 September 2026

Date: 23 September 2026, against `development` at `352fa52`. This is a record. The current rule is in [CI and release workflows](../operations/ci.md). Forgejo job logs and server audit logs were not readable for this investigation, so the deletion itself was not observed.

## What happened

Release-channel notes are the `refs/notes/semantic-release-*` refs that semantic-release reads to find each application's last release on a channel. The [migration](../migration.md#source-publication) pushed 67 of them to Forgejo on 12 September, and the [publication record](evidence/glide-2026-09-12/publication.json) verified them (`refsVerified.notes: 67`). On 22 September at 20:36 UTC, `git ls-remote origin 'refs/notes/*'` returned nothing. At 22:44 UTC the owner pushed them back from a fresh local copy fetched from the original `webgrip/ploeg` and `webgrip/de-vloer` repositories. Every ref arrived as `[new reference]`, and run 33's `checks` job then passed with `GLIDE_REQUIRE_IMPORT_NOTES=true`. On 23 September, Forgejo lists 67 notes at the objects in the [import manifest](2026-09-12-glide-import.json).

## Candidates ruled out

| Candidate | Evidence | Verdict |
| --- | --- | --- |
| A workflow pushes notes to `origin` with `--prune` or a mirror refspec | The only notes push in the history since 12 September is [`sync_release_notes.py`](../../scripts/sync_release_notes.py). It fetches from `origin` and pushes with `--prune` to `https://github.com/webgrip/glide.git`. Nothing pushes notes or prunes refs on `origin`. The shared `semantic-release-monorepo` composite pushes only a seed tag. | Not the cause |
| semantic-release rewrote notes | Every `release-vloer` and `release-ploeg` job from run 22 to run 33 was skipped because `GLIDE_RELEASES_ENABLED` is unset. semantic-release also adds notes one ref at a time and never deletes them. | Not the cause |
| A force push rewrote history | Every commit that CI built from 12 to 22 September is an ancestor of `development`. Tags and branches still match GitHub exactly. | No evidence |
| Forgejo pulls a mirror over the repository | The API reports `mirror: false`. The only configured mirror pushes from Forgejo to GitHub. | Not the cause |

The notes were most likely deleted by a push from outside CI, made from a clone that had no notes: for example `git push --mirror` or `git push --prune origin 'refs/*:refs/*'`, or a Forgejo administrator action. The 12 September clone was on another workstation and its shell history is not available here. The local clone used on 22 September was created at 19:46 UTC that day, and it had no notes until they were fetched from the source repositories. The exact cause cannot be determined without Forgejo's server log.

## The hazard CI did have

The GitHub side went wrong in a way that repository code can control. Before [`ae10513`](https://forgejo.webgrip.dev/webgrip/glide/commit/ae1051382e6a781b8415e130d721ff78e4d27036), `mirror-source-metadata` ran after every green push to `development`, whether or not releases were enabled, and in run 26 it ran even though `checks` had failed. With `origin` empty, fetching gets no notes, and `push --prune` then deletes every note on GitHub. GitHub has held no notes since, while its branches and tags match Forgejo. The next enabled mirror run republishes them.

## Changes

* `sync_release_notes.py` refuses to push unless `origin` holds every imported note at the object recorded in the manifest. An empty or partial fetch can no longer prune GitHub.
* [`test_release_notes_mirror.py`](../../scripts/test_release_notes_mirror.py) runs under `mise run verify`. It fails if any tracked workflow, local action, script or mise task pushes with `--prune`, `--mirror` or `--delete`, uses a deleting refspec, or pushes `refs/notes`. The only exception is the guarded GitHub mirror.
