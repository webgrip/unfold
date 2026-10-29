---
type: explanation
audience: [owner, contributor, agent]
owner: unfold
last_verified: 2026-10-19
verified_by: "Source read on 2026-10-19 of ploeg-hq/ploeg origin/development fc604d4 (pkg/config/config.go, pkg/config/resolve.go, pkg/target/resolver.go and readiness.go, pkg/worker/target.go, cmd/ploegd, docs/how-to/route-a-multi-repo-board.md and connect-github-as-a-forge.md), webgrip/homelab-cluster main c6078236 (kubernetes/apps/ploeg/ploeg/app/helmrelease.yaml and tracker-wiring.cronjob.yaml, kubernetes/apps/ploeg/unfold/app/helmrelease.yaml, kubernetes/apps/forgejo/forgejo-actions-secrets/app/glide-forge-webhook.job.yaml) and apps/unfold/src/tasks.ts and task-handoff.ts. Prompted by Vikunja #2025, refused on 2026-10-13 because repo/ploeg names no target. Nothing was run. The owner agreed to the five directions on 2026-10-19; directions 1 and 2 were then built (Ploeg PR ploeg-hq #196, homelab-cluster PR #826 and the Unfold Connections page), checked with unit tests and the demo."
---

# Connect a repository

How a repository and a tracker board get connected to Ploeg and Unfold, so that handing a task to a Team ends in a pull request. This page details the "Sources, Teams, secrets" stage of journey 8 on [Users and their journeys](users-and-journeys.md), which says *partly: files only*. It describes what exists today, where the journey breaks, and the directions the owner has to choose between.

## The journey

| | |
|---|---|
| Name | connect a repository and its board so a Team can work on it |
| Actors | the operator of the installation (responsible); the person who hands work over (informed: they find out whether it worked) |
| Starts when | a repository should get agent work, or a board starts holding tasks for a repository Ploeg does not know |
| Done when | a task on that board, handed to a Team, becomes a pull request on that repository, and review comments come back as rework |
| How often | a few times a month while an installation grows; at onboarding for a new organisation |
| Success measure | time from "I want agents on this repository" to its first pull request opened by a Run; baseline: not instrumented, several hours of manual edits today |

| Stage | Where | Today |
|---|---|---|
| 1. Make the repository ready | the repository | works: Ploeg checks for `AGENTS.md` on the base branch, not archived, not a mirror (`target_not_ready` otherwise) |
| 2. Give the bots access | the forge | works on Forgejo inside the `webgrip` org (org teams include every repository); missing for any other org and for GitHub |
| 3. Tell Ploeg about the repository and the board | Ploeg's configuration file in the cluster repository | partly: a `targets` entry and a `trackers.vikunja.projects` entry, read once at boot; a typo in a board name stops Ploeg from starting |
| 4. Tell Unfold about the repository and the board | Unfold's configuration file in the cluster repository | partly: a second `repositories` and `taskSources` entry for the same pair, keyed by board id where Ploeg keys by name; nothing compares the two lists |
| 5. Let the Team see the board | the tracker | partly: a job shares Team users and registers the tracker webhook every 15 minutes, but only after a person shares the Ploeg bot into the board by hand |
| 6. Hear about reviews | the forge | missing outside `webgrip/unfold`: the review webhook is registered on that one repository, so request-changes rework does not reach Ploeg for any other repository. The fix, one job over every routed repository, is [homelab-cluster PR #826](https://forgejo.webgrip.dev/webgrip/homelab-cluster/pulls/826) |
| 7. Check it works | Unfold | partly: **Settings → Connections** shows every board and repository with each check and its fix. It needs a Ploeg release with the connections read ([ploeg-hq #196](https://github.com/ploeg-hq/ploeg/pull/196), Ploeg ADR-0129); until then it says the release does not report them |

Every stage leaves Unfold. Stages 3 and 4 are the same fact written twice in two files.

## States

- **First time.** The operator has no checklist in the product; the steps live in Ploeg's how-to pages and comments in the cluster's Helm values.
- **Label names no target.** Ploeg refuses the task (`label_unregistered`) and comments on it. Unfold lists it under *Could not start*. This is what happened to Vikunja #2025.
- **Board without a rule.** Ploeg runs the task against the Team's fallback repository. Nothing warns.
- **Board unknown to Ploeg but listed in Unfold.** The hand-off assigns the Team user and nothing happens. Today the Dark Factory board is in this state.
- **Bot not shared, webhook missing.** Only a job log line or a `/readyz` count. The person who handed the task over sees nothing.
- **Repository on a second forge.** Ploeg can route and inspect a GitHub repository, but its workers push to one forge per release (`pkg/worker/target.go`: "forge is global today"). A GitHub target on the Forgejo installation would be accepted and then fail at push.

## Why Vikunja #2025 cannot run today

The task asks for work in `ploeg-hq/ploeg`, which lives on GitHub. Three things are missing, in this order:

1. Ploeg workers that reach a second forge in the same release (a Ploeg change).
2. A GitHub App for Ploeg, installed on `ploeg-hq/ploeg`, its key in OpenBao, worker egress to GitHub, and a reachable webhook endpoint (cluster changes).
3. A `ploeg` target with `forge: github`, allowed on the Unfold board (a cluster change).

Relabelling the task to `repo/unfold` would route it to the wrong repository. Until the three exist, such work runs from a linked Claude Code session.

## Directions

Proposed, for the owner to decide. They build on the tracker-port RFC in the cluster repository (accepted in part on 2026-10-17), which keeps boards, repositories and identities as cluster configuration and has Unfold read them through Ploeg.

1. **A wiring check before anything else.** *Built: Ploeg's connections read and the Connections page.* A *Connections* view in Unfold, fed by Ploeg, that lists every board and repository with each check green or red: board resolved, tracker webhook present, Team users shared, bot shared, bot can push, `AGENTS.md` present, review webhook present. It reads only. It turns every silent failure above into a visible line with its fix.
2. **Review webhooks for every target.** *In review: homelab-cluster PR #826.* The job that wires tracker webhooks also registers the forge review webhook on every repository in `targets`, replacing the one-repository job.
3. **One entry per connection.** One declaration per repository and board pair that renders both Ploeg's and Unfold's configuration, so stage 3 and 4 become one edit and cannot drift.
4. **Workers on more than one forge.** The worker takes the forge URL from the target instead of from the release, so one installation serves Forgejo and GitHub. This unblocks Ploeg working on its own repository.
5. **Connect from Unfold.** A form in Unfold that writes the declaration from direction 3 as a pull request on the cluster repository, which the operator merges. It respects "configuration stays in the cluster repository" and gives the journey a start inside the product.

## What an installation asks for today

A second installation, Unfold staging on the unfold-cluster, was set up on 2026-10-28 and 2026-10-29. Every credential it needed came from outside the product:

| Credential | How it got there | What a person did |
|---|---|---|
| Forgejo tokens for the builder and reviewer bots | a person creates each token in Forgejo's settings and types it into OpenBao with `just secret-set` | two tokens, two commands; ploegd does not start without them, even with its executor off |
| Vikunja bot token | a copy of the homelab bot's token, pushed by a homelab job, because Vikunja 2.6 creates bot tokens only in its web UI | none, but the copy can write every board that bot is on |
| Vikunja board share and webhook | a homelab CronJob shares the board with the bot and registers the webhook with a secret it generates | none |
| Model provider keys | a person creates each key on the provider's site and types it into OpenBao | two keys, two commands |
| Public hostname and login | an OpenTofu apply, from a plan a person reviews | one workflow run and a digest |

None of these steps happens in Unfold, and none is visible in it until something fails. The owner's verdict on 2026-10-29 was that this is not how connecting should feel.

## Direction 6: connect credentials from Unfold

Proposed. It extends direction 5 from configuration to credentials. Under **Settings → Connections** an operator connects each outside system once, the way a hosted product connects to GitHub or Linear:

1. **Connect Forgejo.** Unfold sends the operator to Forgejo's OAuth consent as themselves, lists the repositories they may administer, and for each chosen repository adds the builder and reviewer bots with the least permission and registers the review webhook. The bots' own tokens are minted by Unfold through Forgejo's API with that consent, never pasted.
2. **Connect a board.** The operator picks a Vikunja board from the boards they can see; Unfold shares it with the Team's bot and registers the tracker webhook with a secret it generates, replacing the homelab CronJob.
3. **Add a model key.** One field per provider; Unfold tests the key with a free call before it saves it, shows the provider's spend cap if the provider reports one, and never shows the key again.
4. **See every connection.** The checks from direction 1 stay the single view, each line green or red with the button that fixes it.

Where the credentials live is the decision this direction needs: ADR-0055 in the homelab keeps OpenBao as the only original of every secret. The proposal is that Unfold writes each credential to OpenBao under its installation's path through a role that may write there and nowhere else, and ploegd and the workers keep reading them through External Secrets. Unfold holds a credential only while it writes it.

Not in scope: the OpenTofu apply that gives an installation its hostname. That is the operator setting up the installation, done once, and stays in the cluster repository.

## Open questions

Each is the owner's to decide.

1. ~~Which directions to take, and in what order.~~ The owner agreed on 2026-10-19 to take all five in the order 1, 2, 4, 3, 5: visibility first, then the bug, then the blocker for Ploeg's own work, then the bigger reshaping.
2. Should Ploeg's own repository be worked on by the homelab installation at all, or stay with linked sessions?
3. Where the single declaration of direction 3 lives: in the cluster repository next to the Helm values, or in Ploeg's Team manifest (Ploeg ADR-0110, proposed).
4. Whether a board that Unfold lists but Ploeg does not route should be hidden in Unfold, or shown with "not connected".
5. Direction 6: whether Unfold writes credentials to OpenBao through a scoped role, or keeps them in its own encrypted store and hands them to ploegd another way.
6. Direction 6: whether Vikunja's missing bot-token API is worked around by connecting as the operator and minting a token for the bot user, or fixed upstream in Vikunja.
