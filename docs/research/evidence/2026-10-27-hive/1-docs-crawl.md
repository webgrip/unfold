# Hive (Hive Commons): documentation and website crawl

Crawled 2026-10-27. Sources: the shallow clone of `hivecommons/hive`, branch `v5` (the default branch), HEAD `3f307bb4` (2026-10-27 20:48 UTC), plus these pages fetched with curl: https://hive.hivecommons.dev/ , /get-started, /learn, /reading, /dashboard (redirects to /login), /pricing (returned 503, see below), https://hivecommons.dev/ , /stories/, /agenda, /meet, /join, /tv, /discord, https://spektacular.dev/ , https://docs.hivecommons.dev/ . I also used `gh api` for releases and metadata, and read two docs from the `v6` branch. Repo paths below are relative to the repo root.

## 0. Repo facts

- Repo: https://github.com/hivecommons/hive . Created 2026-04-17. Default branch `v5`. 77 stars, 47 forks, 65 open issues (gh api, 2026-10-27). Apache-2.0.
- Most of the code is written by agents, and Hive maintains its own repo. README numbers: "11,571 pull requests, 10 repositories, 15,054 AI reviews (oct '26)". hivecommons.dev: "merged pull requests 5,600+ · median issue close time 3 hours · counting since April 2026 · Hive maintains its own project." PR numbers are above #14600 as of 2026-10-27.
- `AGENTS.md` (and `CLAUDE.md`, a symlink to it) is written for agents working in the Hive repo itself, not for Hive users. It tells agents not to run `go test` locally because "CI is the sole verdict". It also requires DCO `git commit -s`, emoji PR-title prefixes and `changelog.d/` fragments.

## 1. Current version, date, versioning and stability

- **Latest release: `v5.186.4`, published 2026-10-18T19:46Z** from target `v5` (gh api releases). The same day also produced v5.186.0 through v5.186.3. `CHANGELOG.md` has an empty `## Unreleased`, then `## 2026-10-18 (v5.186.4)`. The repo HEAD (2026-10-27) is 9 days past the last tag.
- **Three release lines** (`ROADMAP.md` "Release lines at a glance"):
  - v4 (`v4`): "Maintenance line (feature-frozen; security/critical fixes only)". It publishes only `v4-latest` and short-SHA tags.
  - v5 (`v5`, default): "Supported stable line since the 2026-09-21 cut-over". It publishes the `stable`, `candidate` and `latest` channels.
  - v6 (`v6`): "Active development, tracks v5 by forward-merge". It publishes `edge`.
- **Semver, verbatim** (`src/docs/releases.md` "Release lines and the v5 semver policy"): "immutable, semver-tagged releases (`v1.2.3`) with a git tag and a GitHub Release, cut automatically — no human ever pushes a tag or clicks 'Draft a release' in the normal path." Also: "Since 2026-09-21 (#7721) **`v5` is the stable line** and **`v4` is the feature-frozen maintenance line**; each cuts its own semver tags". "**`v6` publishes continuous images only** (`v6-latest`, short-SHA, `edge`); no `v6.x` tag exists until that line is cut as a release line." The next version number is derived automatically "from semver rules applied to whatever is sitting in" `## Unreleased` (releases.md line ~122).
- **Continuous shipping, verbatim** (releases.md): "Hive ships continuously — every merge to a release line (`v5` today) publishes moving image tags … with no human step."
- **v5.0.0 date**: "v5.0.0 shipped 2026-09-21" (`UPGRADE.md`). The v4 to v5 cut-over was "executed as an emergency exception to the announced sequencing" (`ROADMAP.md` v4 section; deviation record on #7721).
- **There is no "LTS" term.** The closest equivalent is the v4 support window: "**v4 reaches end-of-life on 2026-12-21** — 90 days after the first stable v5 release (v5.0.0, 2026-09-21), the conventional security/critical support window." (`ROADMAP.md`). After EOL, "no further v4 releases or image retags, the `v4` branch is archived read-only".
- **Release channels** (`src/docs/release-channels.md`): `stable` = "Newest build promoted as generally safe to run"; `candidate` = "A build believed good, awaiting soak before promotion to stable"; `edge` = "The newest good build, with no soak period." Every green merge to v5 retags `candidate` and `latest`. `stable` advances by digest after a "24-hour stable soak" (`src/docs/stable-soak-policy.md`).
- **Release rate**: about ninety v4 releases (v4.19.0 to v4.51.2) landed between 2026-09-08 and 2026-09-17 (`ROADMAP.md` "Recently shipped (September 2026)"). v5 went from v5.0.0 to v5.186.4 in 27 days.
- **v6 is not yet a release line**, verbatim (`ROADMAP.md`): "`release_lines` is still `[v4, v5]` — `v6` has not been added … promoting `v6` past `edge` remains gated, but it is now a **deliberate, unflipped GA gate**." The v6 readiness bar is `src/docs/v6-readiness.md` on branch v6, tracker #7563.
- **Hosted service stability** (`ROADMAP.md` "Hosted Hive Hub"): "The hosted hub carries no SLA today; treat hosted hives as evaluation-grade unless an operator makes a separate commitment."
- **Stale version labels**: `src/hive.yaml.example` line 1 still reads "# Hive v2 Configuration". https://hive.hivecommons.dev/get-started says "Run Hive v2 on your own machine with Docker Compose".
- Images: `ghcr.io/hivecommons/hive`, `-contributor` and `-hub`, mirrored to `ghcr.io/kubestellar/*`. The README warns: "Only run images from `ghcr.io/hivecommons/hive`." `security-model.md` §11: "**Container images are not signed.**"
- Related versions: Crux (agent runtime, https://github.com/hivecommons/crux) `v0.1.0` on 2026-10-25; hivecommons.dev calls it "Early software". Spektacular GitHub release `0.29.0` on 2026-10-26, while the spektacular.dev header still shows "v0.19.2".

## 2. Core abstractions, as Hive spells them

| Term | One line (Hive's wording where possible) | Doc |
|---|---|---|
| **Hive** | "a co-maintainer system for your GitHub projects" (hive.hivecommons.dev). "Hive is like a CI system, except the job is an AI coding agent and the gate is an AI review plus your existing CI." (README) | README.md; hub landing page |
| **Spoke** | "one running Hive, serving your repo(s). It is where agents actually work. Runs on your Kubernetes cluster, Podman, or Docker Compose." | src/docs/what-is-hive.md |
| **Hub** | "the control plane for many spokes: registers, provisions, upgrades and watches them; fleet view, leaderboards, routes contributor compute". Same image as a spoke, with `HIVE_MODE=hub`. | what-is-hive.md; architecture.md §8 |
| **Hosted hub / hosted service** | https://hive.hivecommons.dev , "a hub we operate so you can onboard a spoke without a cluster. Same software, one deployment of it." | what-is-hive.md; src/docs/hosted-hub.md |
| **Agent** | A CLI coding agent (Claude Code, Copilot CLI, Codex, …) running in a tmux session `hive-<agent>`, one per role. Roles: supervisor, scanner, guide, ci-maintainer, quality, sec-check, architect, strategist, outreach, brainstorm, reviewer, adjudicator, dedupe, telemetry, operations. | architecture.md §2; acmm-policy-matrix.md; /learn "The fleet" |
| **Lane** | "which agent owns it". Classification assigns each issue a lane, a tier (Simple/Medium/Complex → haiku/sonnet/opus) and a cluster key. | architecture.md §4 |
| **Backend** | The agent CLI or inference route behind an agent (`backend: claude`, `copilot`, `codex`, `goose`, …). `KNOWN_BACKENDS` lives in `config/backends.conf`. | src/docs/backend-support-tiers.md |
| **Support tiers T1/T2/T3** | "T1 - core (headless-pod)", "T2 - supported (confined)", "T3 - experimental (unconfined)". | backend-support-tiers.md "The three tiers" |
| **Governor** | "a queue-depth scheduler". Modes `IDLE`/`QUIET`/`BUSY`/`SURGE` set per-agent cadences. It also enforces the token budget and the GitHub API budget. | architecture.md §3 |
| **Kick** | "a work order typed into the agent's CLI prompt", preceded by `/clear` if `clear_on_kick` is set. | architecture.md §3 |
| **Deterministic pipeline** | `run-pipeline.sh` `pre-kick` stages from `hive-project.yaml`: enumerate, classify, cluster, merge-gate, and others. "Deterministic work runs in Go and shell before any LLM sees the task; agents only handle the judgment." | architecture.md §4 |
| **ACMM** | "AI Codebase Maturity Model": six levels L1–L6 that map to per-agent modes. Paper: https://arxiv.org/abs/2604.09388 . hivecommons.dev once expands it as "the AI-native Capability Maturity Model" (inconsistent). | src/docs/acmm-policy-matrix.md; ADR src/docs/adr/0003-acmm-autonomy-levels.md |
| **Policy modes** | Advisory / Measured / Holdgated / Full. In proxy terms: `ADVISORY` → `ISSUES_ONLY` → `ISSUES_AND_PRS` → `ISSUES_PRS_MERGE`. Plus an orthogonal **converse** capability (reviewer: comments and reviews only). | acmm-policy-matrix.md; architecture.md §5 |
| **Beads** | "a durable, git-backed JSON ledger (`bd` CLI)" per agent. Types `bug · feature · task · epic · chore · decision · advisory`; status `open · in_progress · blocked · done · closed`; stored at `/data/beads/<agent>/beads.json`. "the ledger is internal state, never mirrored to GitHub". | architecture.md §7; adr/0004-beads-work-ledger.md |
| **Work source** | `governor.work_source.type`: `github` (default), `github_projects`, `linear`, `jira`. Additive kinds: `type: run` (`run_stages: true`) and `wavefront`. | src/docs/work-sources.md |
| **Tracker vs forge** | "`work_source` picks the **tracker**: where work items are read from." The forge is where code lives, and that is GitHub only. | work-sources.md "Trackers and forges"; landscape.md "Work sources" |
| **Stage labels** | "ONE ordered, mutually exclusive `stage/NNN-slug` family shared by issues and PRs" (see §3). | src/docs/labels-and-control-signals.md |
| **needs-decision / needs-human** | The issue park is `stage/045-needs-decision`; the PR park is `stage/085-needs-decision`. "A person owes a **decision**, not a merge". `needs-human` is the escalation label. | labels-and-control-signals.md table |
| **`hold` / `hive-pause/<hive-id>`** | "Level holds use literal `hold`". `hive-pause/<hive-id>` "is for manual item holds". `hive/<hive-id>` is "provenance only". | acmm-policy-matrix.md "Key Rules" |
| **`role/*`, `author/*`, `dco`/`no-dco`, `stage/stalled`** | `role/*` answers "would the hive auto-merge this?" (`role/trusted`, `role/contributor`, `role/newcomer`, `role/untrusted`). `author/*` answers "who wrote this PR?" (`author/human`, `author/clanker`, `author/hive`). `stage/stalled` means "nobody is working this". | labels-and-control-signals.md |
| **Clanker** | A PR or issue from a relay contributor or an external hive (`author/clanker`). | labels-and-control-signals.md 072 row |
| **Review swarm** | "a structured review-to-fix decision point for pull requests". Five built-in perspectives: `correctness`, `security`, `intent-alignment`, `style`, `docs-currency`; plus `plan_match`, off by default. Verdicts: approve / changes_requested / `requires_human` / reject. | src/docs/review-swarm.md |
| **Reviewer / adjudicator** | The reviewer is "in every pack from L2 up and never merges". The adjudicator "works escalated (`needs-human`) hive PRs through the reviewer lane" (L5+). "reviewer-lane output is advisory where a human-approval requirement exists". | acmm-policy-matrix.md; ROADMAP.md v5 |
| **Merge gate / merge-eligible** | `merge-gate.sh` writes `merge-eligible.json`. "agents may merge **only** PRs on that list". | architecture.md §4; src/docs/hive-merge.md |
| **Diff / path fences** | Merge-time fences. Workflow-path edits need owner approval ("path fence released by owner approval"). Intent verification refuses changes to workflows, the `gh` wrapper, proxy rules, `hive.yaml`, `OWNERS`/`CODEOWNERS` "without maintainer approval". The repo has no single "merge fence" term; "fenced" is also used for lease generations ("Claims and leases are fenced by task generation"). | security-model.md §6, §7; operator-reference.md l.449 |
| **Soak** | A pre-merge soak window, `automerge.contributor_lane.soak_minutes` (stage 095). The 24h stable-channel soak is a separate thing. | labels-and-control-signals.md 095 |
| **Escalation circuit breaker** | Refuses "A fourth fix attempt after three distinct red commits; the item is labelled and routed to a person." | security-model.md §6; adr/0010 |
| **ioscan** | Untrusted-input scanner. "Hidden instructions in issues or files are screened out before an agent reads them" (README). Per-kick `HIVE-CANARY-*` exfiltration canaries; `ioscan.fail_mode` open/closed. | src/docs/ioscan.md; acmm-policy-matrix.md |
| **Trajectory review** | "periodically reads transcript vs. intent; pauses agent on drift (fails open)". | architecture.md §5; trajectory-review.md |
| **MITM proxy** | GitHub API proxy on :18443 enforcing "(method, path) → MinMode first-match-wins · repo allowlist". | architecture.md §5; adr/0002 |
| **Evidence cards / review evidence bundle** | README "plain-language evidence cards" (Accuracy, Security, Cost, Also), generated by `src/scripts/outcome-benchmark.sh`. "Every merge leaves a review evidence bundle: canonical JSON … hashed and optionally Ed25519-signed." "Hive's evidence cards describe recorded outcomes, not proof of effectiveness." | README.md; security-model.md §6; src/docs/evidence.md; src/docs/review-evidence.md |
| **Contributor relay / ClankeR** | Lets "anyone who wants to help your project donate their compute and model tokens without you handing out anything". | what-is-hive.md; src/docs/contributor-relay.md |
| **The Commons** | Contributor-side multi-hive routing across subscribed hives. Strategies via `HIVE_COMMONS_STRATEGY`: `ranked` (default), `spread`, `neediest`. "The Commons strategies choose only between tasks." | src/docs/hivectl.md l.1115; env-vars.md l.418 |
| **Hive Commons** | The umbrella org/community: "Human judgment is the scarce resource." | hivecommons.dev |
| **Swarm (mode)** | "Swarm mode focuses the hive on one repository for a bounded window", with Discord announcements, themes and a leaderboard. "Swarm" is also used loosely ("governed swarms", "elastic swarm" for relay contributors). | src/docs/swarm.md |
| **Spektacular (Spek) / spek** | "Spek takes a markdown spek and uses AI coding agents to plan and implement your features." In Hive it is the stage runner: "A run moves through the `spec`, `plan`, and `implement` stages on one task lease. Spek owns the state of each artifact; Hive owns the workflow." Off by default (`runs.spektacular.enabled`). | src/docs/spektacular.md; spektacular.dev |
| **Run** | "Runs are long-lived, staged work items". Key `<owner/repo>#<number>`, exposed at `GET /api/runs`, `/api/runs/{key}`. | src/docs/runs.md |
| **Oracle / Generator / Executor / Gate** | The long-running-work archetypes: Oracle = `pkg/worksource`; Generator = `pkg/outputschema`; Executor = `pkg/convergence/mutation.Executor`; Gate = `pkg/convergence.Evaluate` (tri-state `True`/`False`/`Unknown`). | architecture.md "Archetypes for long-running work" |
| **Task lease / claim ledger** | Claims are fenced by generation. Lease key `<repo>!<run-key>:<stage>`. | runs.md; security-model.md §7 |
| **extwork** | External-execution contract `pkg/extwork` (Flue pilot, vibe-kanban, Claude Managed Agents adapters). "report-only", default off. | ROADMAP.md v6; src/docs/design/external-workflow-admission.md |
| **Jam session** | Per-campaign spec collaboration workspace (threads, suggestions, polls). | spektacular.md |
| **Inception / brainstorm** | L1 "interactive project scaffolding with llm-wiki and spec-kit". | src/docs/inception.md; /learn |
| **Knowledge** | Facts with sources and confidence; "Agents are primed with a bounded set of facts in the task prompt; they cannot query the store". | security-model.md §4; design/knowledge-system.md |
| **Crux** | "The agent runtime inside Hive, split out for reuse. It starts AI coding agents, sends them work, and restarts or pauses them when they stall." | hivecommons.dev; src/docs/design/crux.md |
| **Constellation** | Multi-spoke fleets under one hub (RFC #5691). | ROADMAP.md v5; docs/rfc-5691-constellation.md |

## 3. Lifecycle

### Stage labels (exact names), from `src/docs/labels-and-control-signals.md` "The table"

Exactly one `stage/*` label sits on each open item. "closed, merged or superseded items carry none (terminal = no stage)." Stages `010`–`045` are issue stages and `050`–`100` are PR stages; "Issue stages and PR stages are disjoint."

| Label | Kind | Meaning (abridged) | Dwell before `stage/stalled` |
|---|---|---|---|
| `stage/010-actionable` | issue | triaged; eligible for pickup | 24h |
| `stage/015-triage-needed` | issue | untrusted reporter, awaiting maintainer; "a display and tracking state, not a gate" | — |
| `stage/017-possible-existing` | issue | prior-art gate parked it; author confirms with `/hive decision proceed — <gap>` or `/hive decision exists` | none |
| `stage/020-claimed` | issue | a live claim (human, relay contributor or hive agent), no PR evidence yet | 2h |
| `stage/030-pr-in-progress` | issue | claimant has a PR under way | — |
| `stage/040-covered-by-pr` | issue | an open PR covers it | — |
| `stage/045-needs-decision` | issue | "**the** issue-side park-for-a-person signal" | — |
| `stage/050-review-pending` | PR | review swarm requested; awaiting verdict for current head | 1h |
| `stage/060-reviewed` | PR | swarm approve, a gate still pending | 30m |
| `stage/070-fixing` | PR | hive-owned repair (red, changes requested, needs-rebase) | 2h |
| `stage/071-needs-author` | PR | human-authored PR, author must act | 24h |
| `stage/072-returned-to-contributor` | PR | clanker PR, contributor must act | 24h |
| `stage/074-adopted-by-hive` | PR | clanker unavailable; the hive took the PR over | — |
| `stage/080-awaiting-merge-admission` | PR | nothing left for the author; lane has not admitted yet | 30m |
| `stage/085-needs-decision` | PR | "A person owes a **decision**, not a merge" (`requires_human` verdict, `sentinel-alert`, `hold`, workflow approval needed, …) | — |
| `stage/090-ready-for-human-merge` | PR | "the hive would merge this itself but trust/role blocks it … A maintainer's `/lgtm` `/approve` is the only missing step" | none |
| `stage/095-pre-merge-soak` | PR | lane admitted; soak running (`automerge.contributor_lane.soak_minutes`, doc says default 30; the `hive.yaml.example` sample shows 120) | 45m |
| `stage/100-merge-queue` | PR | "merge-eligible, waiting for tide / the merge window" | 3h |

- Modifiers outside the stage family: `stage/stalled`, `role/*`, `author/*`, `dco`/`no-dco`, `hive/claimed-by-<who>`, `hold`, `do-not-merge*`, `needs-human`, `needs-rebase`, `sentinel-alert`, `hive-pause/<id>`, `triage/accepted`, `approved-direction`, `already-exists`, `needs-triage`.
- The review loop "050 → 060 → 072 → 070 → 050 is the intended cycle". The full Mermaid state diagram is in the same doc.
- Config keys: `governor.labels.stage.enabled` (default `true`) and `governor.labels.stage.dwell` (per slug).
- **Who moves it**: "One writer. Every stage write … goes through `stagelabels.Enforce` / `EnforceStage`" (`src/pkg/stagelabels`). Agents may add only one issue stage label themselves, `stage/045-needs-decision`. Security-model §6 adds: the gate refuses "Any writer of `stage/*` labels other than `src/pkg/stageengine`; an admission test enforces this." See ADR `src/docs/adr/0025-central-stage-engine.md`.
- **Dashboard view of the same lifecycle**: the Hive activity monitor (`GET /api/stage-tracker`) shows "`Open → Actionable → Claimed → PR in progress → CI / Review → Merge gate → ✓`". There is also a Review pipeline board with columns "unreviewed, reviewing, changes requested, fixing, human hold, approved" (`src/docs/dashboard.md`).
- **Bead (internal) lifecycle**: GitHub issue → scanner files a bead → `bd ready --actor X` → in_progress → PR → merged → `bd close` (architecture.md §7).
- **Website's simplified loop** (hub landing): "01 Issue filed → 02 Triage → 03 Fix agent (isolated worktree) → 04 Coverage gate ('Roughly 1 in 7 agent change requests is rejected here') → 05 Review → 06 Merge ('No human approval needed at L6') → 07 Rerun". README graphic: "scan, claim, work, verify, merge, credit".

### Human-in-the-loop gates

- From `src/docs/security-model.md` §10 "Human in the loop":
  - "**ACMM** is the autonomy dial. Merge permission is not minted below L6. L5 adds a `hold` label on every agent pull request."
  - "**Parking.** An agent that needs a decision labels the item `needs-human` and stops. A person with write access answers with `/hive approve` or `/hive decision <text>`."
  - "**Pull-request release is a GitHub review.** A `requires_human` verdict is cleared only by a trusted merger's Approve review on the current head."
  - "**Owner-only security settings.** Changes to `ioscan`, intent enforcement, review requirements and the agent sandbox require the `owner` role."
  - "Emergency stops, cheapest first: pause one agent, pause one repo, disable automerge per repo, freeze the watchdog fleet-wide, drop the ACMM level."
- "Raising the level is always a human decision." (architecture.md §6). The website says: "the autonomy level never rises on its own. You (the admin) choose to raise it".
- At L6 merges need no human: "Agents open PRs and **auto-merge on green CI**" (architecture.md §6). Exceptions: "cross-repo outreach PRs (target repo not managed by this hive) remain held".
- Self-authorization hold, `github.self_authorization_hold`: "defaults on through ACMM L5 and off at ACMM L6. App-authored PRs whose only tracked rationale is an unacknowledged hive-filed issue receive `hold` until a human signs off on the direction." (src/hive.yaml.example).
- Reporter trust: "The hive automatically works issues only from authors whose GitHub `author_association` is one of: OWNER, MEMBER, COLLABORATOR … Issues from anyone else wait until a maintainer adds the `triage/accepted` label." (GOVERNANCE.md).
- Maintainer slash commands (`src/docs/maintainer-commands.md`): `/hive approve`, `/hive decision <text>`, `/hive decision proceed — <gap>`, `/hive decision exists`, `/hive help`, `/fixed` (alias `/close`), `/reopen`, `/help-wanted`, `/good-first-issue`, `/hacktober-fest`, `/kind`, `/area`, `/assign`, `/unassign`. The command sweep runs about every five minutes, "Hive does not depend on a webhook". The approval commands "On pull requests … are acknowledged but never consumed; release needs a GitHub Approve review." (security-model §7).
- "Humans still merge; what reaches them has passed review and CI. Start at 'open PRs only'; once you trust it, turn the setting up to merge on green, like a merge queue." (README).

### Autonomy / permission model ("you decide how much they may do")

- **The single dial is the ACMM level**, set with the config key **`acmm_level`** (an int 1–6, `src/pkg/config/config.go` l.95; `MinACMMLevel = 1`, `MaxACMMLevel = 6`). `src/hive.yaml.example` shows `# acmm_level: 2`. It can also be set in the dashboard. Each level is a pack (`packs/level-N.yaml`) that assigns each agent a mode and a template. Verbatim per level (src/docs/what-is-hive.md):
  - L1 "Inception (Assisted)": "Advisory beads only."
  - L2 "Advisory (Instructed)": "Observe and report findings as dashboard beads. No GitHub interaction." The reviewer posts COMMENT-only PR reviews.
  - L3 "Quality-Gated (Measured)": "Quality agent opens issues and PRs gated by the literal `hold` level-gate label."
  - L4 "Security-Aware (Adaptive)": "All agents file issues. Quality, sec-check, and CI open PRs gated by `hold`."
  - L5 "Semi-Autonomous (Semi-Automated)": "All agents open PRs gated by `hold`. Humans batch-review and approve."
  - L6 "Autonomous": "Agents open PRs and auto-merge when checks pass."
- Mode-to-capability table (acmm-policy-matrix.md): Advisory = beads only, no GH auth. Measured = issues. Holdgated = issues and PRs, plus `hold`. Full = issues, PRs and auto-merge on green CI.
- Rule: "Advisory agents never get GH auth."
- Per-repo controls (ROADMAP v5, "Per-repo policy scoping"): repo pause (`project.paused_repos`), per-repo agents, `project.repo_policies[].auto_merge: false`, and `project.repo_policies[].self_authorization_hold`. "per-repo ACMM levels were **not** accepted (#6111 on hold, #6235 declined). Hive-wide ACMM remains the ceiling."
- Other autonomy-related keys: `auto_merge.no_ci_ok`; `auto_merge.contributor_lane.{enabled,soak_minutes,require_reviewer_verdict,require_tiers,registry_tiers_sufficient}`; `auto_merge.contributor_tier.auto_promote_after_merged`; `review_gate.mode: off|shadow|enforce`; `intent.enforce`; `review.fix_human_prs`; `project.agent_issue_decision_policy: resolve|escalate`; `release_level_holds: true` (one-off); `ioscan.fail_mode`.
- Hosted wizard: offers L1–L3 at request time, with "L3 — Quality-Gated (Measured)" recommended; "L4–L6 appear as **Available after provisioning**" (src/docs/hosted-hub.md).
- Dashboard roles: `authorized_users` with roles `read`, `read-write`, `merger`, `owner` (security-model §7).
- Contributor tiers: "Relay contributors move from `newcomer` to `contributor` automatically after five completed pull-request tasks, to `trusted` by operator grant, and to `merger` or `advisor` by maintainer decision. Tiers do not decay." (security-model §7). The get-started page instead says "newcomer and progress through contributor → trusted → advisor".
- **Limit, verbatim** (security-model §11): "**The L5 `hold` label is applied by agent policy.** The hard guarantee at L5 is the withheld merge permission, not the label."

## 4. Execution model

- **Where agents run**: "Hive runs as a single container with a Go control plane, an authenticated Node.js gateway, and ttyd for web terminal access." (what-is-hive.md). "Agents run as **tmux sessions** named `hive-<agent>`, one per agent, optionally under per-agent OS users for UID isolation." (architecture.md §2).
  - Deploy targets: Kubernetes (`src/deploy/k8s/deployment.yaml`), Docker Compose (`src/docker-compose.yaml`), Podman Quadlet. The website adds "LXC".
  - Ports: 3001 node proxy, 3002 Go API, 7681 ttyd, 18443 MITM, 18444 inference translator.
- **launchd/systemd units are legacy v1**: the `launchd/` and `systemd/` dirs and `docs/macos.md` are "Legacy v1/systemd documentation … kept for historical context" (docs/LEGACY-v1-architecture.md).
- **Kubernetes Job runtime (opt-in)**: `sandbox.runtime: job` runs sandboxed kicks "as a Kubernetes `Job` in the hive's own namespace", for other OS images or accelerators (src/docs/sandbox-isolation.md "Running sandboxed kicks as Kubernetes Jobs"). Keys: `agent_sandbox.job.workspace_claim`, `agents.<n>.sandbox.job.{node_selector,resources,tolerations,env_from_secrets,volumes,ttl_seconds}`. It needs an RWX PVC and RBAC on `batch/jobs`. The doc calls it "a first slice: one Job per kick".
- **Rootless Podman sandbox (opt-in)**: both `agent_sandbox.enabled: true` and per-agent `sandbox.enabled: true` are required. Other keys: `agent_sandbox.image`, `network_mode: restricted|none` (default `restricted`), `timeout_s: 2700`. A push broker (`pkg/pushbroker`) outside the sandbox scans diffs, "mints a short-lived scoped GitHub App token outside the sandbox, pushes the branch, and opens a PR". The hub-side sandbox is "off by default" (integrations.md).
- **Contributor relay**: the relay runs on the contributor's machine, in container mode (default) or local mode, with a per-backend confinement matrix in sandbox-isolation.md. T3 backends "refuse to launch in local mode unless the operator explicitly opts in" via `HIVE_<BACKEND>_DANGEROUSLY_RUN_UNCONFINED=1`.
- **Isolation, in their own words**:
  - "Hive agents are untrusted code executors … The safe target is therefore **no credentials in the agent sandbox** and a network policy that is as close to default-deny as the configured inference runtime allows." (sandbox-isolation.md).
  - Default isolation is weaker: "**Agents share one container.** Per-user separation is not per-task containers. The sandbox is opt-in and two-gated." (security-model §11).
  - "Each agent runs as its own Unix user (from UID 2001), in its own `tmux` server on its own socket" (security-model §3).
  - Hub-launched Codex uses `--dangerously-bypass-approvals-and-sandbox`, "mirroring Claude's unattended posture" (sandbox-isolation.md).
  - Stronger runtimes are under evaluation: NVIDIA OpenShell and AAIF OpenSandbox in ADR-0026 (Proposed). "No integration exists today." (landscape.md).
- **Short-lived vs long-lived agents: the docs contradict each other.**
  - what-is-hive.md and the website: "**Short-lived agents.** Every task starts a fresh agent with a clean context and ends it. No long-running agent drifting for hours."
  - landscape.md: "Long-lived agents in tmux" and "Queue-depth cadence, long-lived agents".
  - sandbox-isolation.md: "Agents run as long-lived CLI sessions".
  - security-model §3: "Context reset is not process reset: the CLI process and its on-disk session state persist until restart."
  - In practice the default is a persistent CLI process per role, with `/clear` per kick.
- **Credential handling (does the agent hold the GitHub token?)**:
  - Default tmux path: "Hive mints a token per agent matching its mode: advisory agents get read-only tokens, measured agents can write issues, hold-gated and full agents can write code." Token files are mode 0600/0640, per UID.
  - "`/usr/local/bin/gh` is a wrapper that applies per-agent restriction rules and injects the agent's token; agents never pass tokens themselves."
  - "`POST /pulls` and `PUT /pulls/{n}/merge` are denied at the proxy for every mode; agents call `hive-open-pr`, `hive-open-issue`, `hive-merge` and `hive-review`, which drop a request file that Hive processes as the App." (security-model §5).
  - So by default the agent's process tree has a scoped App token file. Opt-in `HIVE_PROXY_INJECT_GH_AUTH=true` makes the token file a placeholder and the proxy swaps in the real token. A default-on version (#9586) was "declined in September 2026".
  - sandbox-isolation.md claims "No agent receives a GitHub token or pushes directly". That conflicts with the per-agent token files above unless it means sandbox or proxy-inject mode only.
  - Inference keys: gateway agents get the placeholder `sk-hive-<agent>`, and the translator attaches the real key server-side. "Agents using cloud CLI backends (Claude, Copilot, Codex, Goose) run with the provider credential you connected, because the CLI needs it." Also "**Cloud CLI credentials are shared with the CLI.**" (§11).
  - Relay: "For each task the hive mints a short-lived, task-scoped GitHub token so the PR can be opened, then it expires." "API keys and CLI logins stay on the contributor's machine. The hive never sees them." (what-is-hive.md).
  - Auth modes: GitHub App preferred; PAT (`HIVE_GITHUB_TOKEN`) is "accepted for lower-autonomy/dev deployments" (UPGRADE.md). README tagline: "agents run as a GitHub App, not your PAT". The README quick start nonetheless uses `HIVE_GITHUB_TOKEN=ghp_...`.
- **Network policy**:
  - "The entrypoint installs an iptables rule redirecting all outbound port-443 traffic through the proxy … This needs `CAP_NET_ADMIN`; without it the spoke refuses to start unless `HIVE_PROXY_ADVISORY_OK=true` is set". "Rootless Podman cannot grant `NET_ADMIN`, so rootless deployments are unsupported for enforcement."
  - "Only `api.github.com` is inspected; other hosts are tunnelled without inspection." "Use Kubernetes NetworkPolicies for full egress control." (security-model §5, §11).
  - Plain-HTTP forwards to private/link-local addresses are refused unless `HIVE_PROXY_ALLOW_PRIVATE_FORWARD=true`.
  - Agent identity at the proxy is "derived from the connection's owning UID (`/proc/net/tcp` → UID → agent name)".

## 5. Money and limits

- **Token budget** (the governor), keys from `src/pkg/config/config.go` `BudgetConfig`: `governor.budget.total_tokens`, `governor.budget.usd`, `governor.budget.period_days` (default 7), `governor.budget.critical_pct` (default 90), `governor.budget.coins.<name>.{tokens_per_coin,usd_per_coin,label,budget}` (Bob coins).
  - "A **7-day rolling token budget** gates kicks: at 90% it warns; on exhaustion it suppresses kicks for all but explicitly-exempt agents." (architecture.md §3).
  - There are per-agent budget exemptions and a `model_lock` that "stops the governor from automatically changing an agent's model under budget pressure" (config.go; settings.md "Budget"). That implies an automatic model-downgrade behavior under budget pressure.
  - Env overrides: `HIVE_BOB_TOKENS_PER_COIN`, `HIVE_BOB_USD_PER_COIN`, `HIVE_BOB_COIN_BUDGET`, `HIVE_BOB_USD_BUDGET`.
- **Provider spending limit** (separate from the budget): detected from the gateway error body. It "withholds every agent kick while it is in force. It does **not** pause agents". Recovery probe: `governor.provider_budget.probe_interval_s` (default 1800) (operator-reference.md "Governor cadence and budget").
- **GitHub API budget governor**: modes `normal`/`conserve`/`critical`, thresholds `github.api_reserve` (800) and `github.api_critical` (250), plus `governor.conserve_interval_multiplier` (2) and `governor.eval_interval_max_s` (1800).
- **Per-kick / per-run limits**:
  - `governor.kick_limits.max_issues` (100) and `max_prs` (50), which cap prompt list size.
  - `agent_sandbox.timeout_s` (2700).
  - Continuous cadence `continuous_cooldown` (60s) and `continuous_budget_pct` (80).
  - The escalation breaker stops after three distinct red commits.
  - The watchdog pauses an agent after five failed restarts.
  - Relay `contribute.max_parallel_fixes` (2) and `contribute.min_focus_window` (30m).
  - Classifier `ioscan.classifier.cli_budget_per_eval: 8`.
  - Claude Managed Agents path: `runs.external.claude_managed_agents.daily_budget_cents: 2500`, with "the durable ledger caps the spoke at USD 25 per UTC day".
- **Cost accounting**: "**Cost** is a list-price estimate, not a billing feed: the token collector scans each backend's **session JSONL** files (plus a live proxy sniff of Copilot's usage block) and multiplies token counts by a dated per-model price table." (architecture.md §9).
  - Endpoints: `/api/cost`, hub `/api/saas/usage`. Code: `pkg/tokens`, `pkg/dashboard/cost.go`, `pkg/hub/usage.go` (src/docs/token-tracking.md).
  - The dashboard Cost panel renders "cost by work item": "This is visibility only: nothing here gates or budgets a kick".
  - Labels are `native` vs `estimated`. A ccusage-based sourcing hybrid is "**Proposed — awaiting maintainer sign-off on #6234/#6242**".
- **Cost claims**: README card "about $2 of agent spend per merged pull request"; "Tracked like CI minutes; each job's cost is on the dashboard."
- Website comparison row: "Transparent AI cost, budgets & local incentives — ✓ Per-model cost, weekly budget, local-model achievements".
- **No money fields for a hosted-hub tenant.** Hosted quota is a count of hives (`SaaSUser.SaaSQuota`, `max_hives`), not money (ROADMAP "Hosted Hive Hub").

## 6. Supported forges, work sources, backends, gateways

- **Forges**: "GitHub is the only forge agents can work against today. The GitLab and Gitea/Forgejo adapters in `src/pkg/forge/` cover reads and core writes (comment, label, hold), and GitLab's can merge. Two governor writes use them, but the GitHub-only enumeration that feeds those writes means they never fire on a non-GitHub hive." (src/docs/integrations.md).
  - Status table: GitHub.com and GitHub Enterprise **Supported**; GitLab, Gitea and Forgejo **Planned** (#14096). Config key `project.forge`; ADR `src/docs/adr/0005-forge-abstraction.md`.
  - The hosted wizard rejects GitLab/Gitea/Forgejo URLs "today" (hosted-hub.md). It supports GitHub Enterprise, e.g. `github.ibm.com`.
  - **The website overstates forge support**: it lists "GitLab" and "Gitea / Forgejo" under "Source control" with "forge-neutral adapters cover GitLab and Gitea / Forgejo issue and change-request flows as they graduate".
  - ROADMAP "Future (post-v5)": "Gitea/Forgejo forge program sequencing is proposed", "Cross-forge orchestration (GitHub, GitLab, Forgejo/Gitea)".
- **Work sources / trackers** (all "Supported"): GitHub Issues (default), GitHub Projects (v2), Linear (read side plus a two-way "agent sessions" integration, `src/docs/linear-agent.md`), Jira Cloud (REST v3) and Jira Data Center/Server (REST v2, PAT or basic auth). Additive sources: `type: run` (Spektacular run stages) and `wavefront` (Crustify C/C++→Rust migration graph, `governor.work_source.wavefront`). Contract: `src/docs/integrations/work-source-providers.md`.
- **Agent CLI backends and tiers** (backend-support-tiers.md; integrations.md):
  - T1 core: `claude`, `litellm`, `copilot`, `codex`, `goose`.
  - T2 confined: `claude`/`litellm`, `codex`, `copilot`, `muse` (sandboxed); `opencode` (deny-listed).
  - T3 experimental: `goose` (local), `agy` (Antigravity), `bob` (IBM), `pi`, `aider`, `kilo`, `omp` (Oh My Pi), `openhands` (legacy CLI, headless-only), `omnigent`.
  - Gemini CLI is "Go-side only" / "hub-managed only".
  - Claude Managed Agents: "Experimental … private self_hosted spoke, report-only, USD 25/day ledger cap".
  - OpenAI Agents API: "Planned" (#14093).
- **Inference gateways**: vLLM (`backend: vllm`), llm-d, LiteLLM, IBM watsonx.ai, OpenRouter, and custom OpenAI-compatible endpoints (`kind: custom`, `/v1/chat/completions`). Providers: Anthropic, OpenAI, DeepSeek. "Jev (TypeSafe AI) · partner · v6 classifier.backend: jev". Routing goes through the in-pod inference translator on :18444 ("Anthropic ↔ OpenAI reroute for gateway backends"). Docs: `docs/inference-backends.md`.
- **External execution hosts**: Flue pilot (`runs.external.flue`, build tag `extwork_flue`, report-only); vibe-kanban (`runs.external.vibe_kanban.enabled`, build tag `extwork_vibekanban`, report-only); gh-aw, as a report-only sample only.
- **Sign-in (hub)**: Microsoft, GitHub, IBM, Google, "plus any other OIDC provider on request".

## 7. Multi-tenancy, multi-repo, multi-user, hosted offering, pricing, business model

- **Multi-repo**: `project.org` plus a `project.repos` list per spoke, with `primary_repo`. The hub coordinates many spokes. A production example is tunaos.org: "Self-hosted hub coordinating two ACMM L5/L6 spokes across 43 tuna-os repositories" (ADOPTERS.md). The scale envelope is in `src/docs/scale-envelope.md`.
- **Single org per spoke.** `project.org` is singular in `hive.yaml`.
- **Multi-user**: dashboard `authorized_users` with `read`/`read-write`/`merger`/`owner` roles, hub OAuth/OIDC login, and contributor-relay identities with tiers.
- **Hosted multi-tenancy** (ROADMAP "Hosted Hive Hub"): "Account creation is OAuth/OIDC-backed and passwordless, new non-admin users have no self-service hosted quota until an admin grants it". "Tenancy is bounded by per-user quota (`SaaSUser.SaaSQuota`), per-cluster `max_hives`, placeholder-pool `pool_min`/`pool_target`". "unconfigured or inactive hosted hives may be reclaimed".
  - Each hosted hive is its own spoke (provisioned via kubectl) under the wildcard `HIVE_HUB_SPOKE_DOMAIN=hive.hivecommons.dev`.
  - Requests are admin-reviewed: "What happens next: an admin reviews your request" (/get-started).
  - The security-model threats list includes "cross-tenant exposure on the hosted hub".
  - "**Hub registration has no review step.** Any spoke with the derived keys can register." (§11). The /get-started page instead says "unauthenticated registration was deliberately removed to prevent registry pollution" and that listing a self-hosted hive requires `HIVE_HUB_SECRET` from the hub operator.
- **Strategy, verbatim**: "**Hosted is the funnel, self-hosted is the destination.** The hosted hub exists to let adopters evaluate and run small hives without infrastructure; larger fleets are expected to graduate to a self-hosted hub (as tunaos.org did)." (ROADMAP).
- **Pricing: none found anywhere.**
  - Neither site has a pricing page. https://hive.hivecommons.dev/pricing returned HTTP 503 with a generic "Hive is restarting" page, which looks like the hub's catch-all, not a pricing page.
  - The hosted service is offered free of charge ("Hosted on our infrastructure — no Kubernetes, no setup"), best-effort, with no SLA.
  - The comparison table row: "Free & open source ✓ Apache‑2.0 · Hive Commons".
  - No paid tier, sponsorship tier or commercial entity was found.
- **Business model / sponsors**: a community open-source project. Infrastructure is donated: "Akamai (Linode) Kubernetes infrastructure donated through the CNCF; Oracle Cloud (OKE) Kubernetes infrastructure donated through the CNCF; Cloudflare DNS, edge and tunnels; GitHub Copilot AI inference donated to CNCF projects through the CNCF; Bluehost domain hosting" (hub landing, "Thanks to the organizations that power Hive Commons"). Schema.org marks these as `sponsor`/`funder`. "TypeSafe AI is a Hive Commons partner."
- **Corporate weight**: three of the five maintainers are IBM (GOVERNANCE.md). Copyright is "The Linux Foundation and Hive contributors". The project was incubated in KubeStellar (CNCF Sandbox).
- **CNCF status**:
  - README: "a Cloud Native Computing Foundation sandbox project candidate … this does not imply CNCF acceptance or endorsement".
  - GOVERNANCE.md says "Hive is a CNCF Sandbox project". That contradicts the README.
  - hivecommons.dev: "Hive Commons has applied to the CNCF Sandbox … the application is in progress". The application is https://github.com/cncf/sandbox/issues/516 "[Sandbox] Hive Commons". On 2026-10-27 it was open with labels `gitvote/passed` and `contribution-agreement/unsigned`.
- **The Commons, leaderboards and achievements (the gamified contributor effort), explained**:
  - Contributors run a relay (`just contribute-hive`, `brew install hivecommons/hive/contribute`, `hive-contribute`) that donates their own CLI subscription or local GPU to other projects' hives.
  - **The Commons** is that contributor's list of subscribed hives (across hubs), ranked, with a routing strategy that picks which hive's queue the next task comes from: `ranked` / `spread` / `neediest`. It is managed via `hivectl hives …`, the TUI, or the loopback web UI `hivectl hives web`.
  - Contribution presets: a publishable YAML recommending hives and repos (`hivectl hives preset adopt|refresh`, CHANGELOG v5.186.0).
  - **Leaderboards**: a cross-hive leaderboard on the hub; per-swarm leaderboards (`/api/leaderboard/swarm`); a "Battle Log" (`/api/leaderboard/battle-log`); and "Hive of the Week", which features a project with a Gource video render (`/api/leaderboard/hive-of-week`, src/docs/hive-of-the-week.md). There is also an "ACMM Leaderboard" of "How projects rank on AI-readiness" (/learn).
  - **Achievements 2.0** ("Shipped on v5", src/docs/design/achievements-2.md, #8832): badges in "four collaboration tiers" meant to make "the best recognition team-heavy, not wallet-heavy". It includes "local-model skill a first-class achievement track" and the guardrail "no addictive loops, no FOMO, no punishment for logging off, and no incentives to spam maintainers". The motivation is quoted as "community inference for open source" (Bluefin discussion https://github.com/ublue-os/bluefin/discussions/4946).
  - Swarm score "rewards software-engineering outcomes: closed issues, merged PRs, completed Spektacular/spec-plan-implement work, local-model-attributed PRs, and completed SDLC objectives … instead of raw inference volume" (src/docs/swarm.md).
  - Contributor "dossiers" and a "Heraldry" card exist. Credly badges are "**Planned feature** … No live Credly API calls" (src/docs/credly-badges.md).
  - Trust tiers are earned through completed tasks (§3). Contributor stories are at https://hivecommons.dev/stories/ .
  - Live hub stats as of 2026-10-01: "public hives online … 26", "agents reported … 99", "PRs reported … 466"; "human PR authors in hivecommons/hive since 2026-07-01: 20".

## 8. Dashboard, Discord, weekly competitor report

- **Spoke dashboard** (src/docs/dashboard.md, 65 KB; served from `src/pkg/dashboard/static/index.html`, port 3001). Sections include:
  - Governor card, Throughput / Delivery SLA, Review pipeline board, Hive activity monitor (the stage tracker), repository cards with issue/PR bands, Cost panel ("cost by work item", "PRs by model" rework evidence), Audit Log, Hive Chat, Knowledge, Project Inception, Campaigns/Runs (v6 Runs pane), Settings tabs (Forge App, Model Gateways, Budget, Repos, Labels, Health, Sensing, Knowledge, Compliance, Security, Appearance themes), an FAQ, and an Übersicht (macOS) widget.
  - Agent cards show the per-agent backend/model and a Login button, and open a web terminal into the tmux pane via ttyd.
  - Live updates use SSE `/api/events`; there is an OpenAPI file at `dashboard/openapi.json`. Terminal twin: `hivectl tui`.
- **Hive activity monitor columns**: "`Open → Actionable → Claimed → PR in progress → CI / Review → Merge gate → ✓`", with optional sounds (a "merge zap").
- **Evidence cards**: the README cards (Accuracy, Security, Cost, Also) come from `src/docs/benchmarks/outcomes-2026-10.md`. On the dashboard, `GET /api/evidence/summary` has an outcome card with an author-kind chart and a control-arm comparison.
  - Verbatim: "This is the **reporting foundation**, not activation of an experiment. Current runtime producers do not yet assign `control_window`" (src/docs/evidence.md).
  - README: "Production data, not a lab run … Reverts are too new to report."
- **Hub dashboard**: My Hives with the version pill and channel switch, fleet view, a release-channel block with a play/pause control for stable promotion, the registry, and the leaderboard.
- **Discord**:
  - (a) A one-way `notifications.discord.webhook` alert channel (ntfy and Slack exist too).
  - (b) A two-way Discord bot in `discord/` (Node; `npm start`; env `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_PRIMARY`, `HIVE_DASHBOARD_URL`). Commands: `!status`, `!governor`, `!kick <agent> [prompt]`, `!scanner`, `!architect`, `!outreach`, …. It "talks to the hive's dashboard API; it does **not** need cluster access" (discord/README.md).
  - (c) Swarm start/end announcements (src/docs/swarm.md).
  - (d) Hosted-hive requests can be mirrored into the community Discord (hosted-hub.md).
  - On v6, `pkg/chat` is a transport-agnostic spine with Discord, Slack (Socket Mode), Microsoft Teams, Matrix and Telegram backends, plus email/ntfy/Pushover/PagerDuty escalation (ROADMAP v6).
  - Community Discord: https://discord.gg/kQbCKGySvp (via https://hivecommons.dev/discord).
- **Weekly competitor report**: `.github/workflows/weekly-competitor-report.md` is a **gh-aw** (GitHub Agentic Workflows) workflow with `engine: id: copilot`, cron `"0 13 * * 1"` (Mondays 13:00 UTC). It is compiled to `weekly-competitor-report.lock.yml`. Verbatim description: "Weekly competitor research, SWOT, and a Top 5 action list for Hive, posted to Discord #related-research and appended to the tracking issue". An optional input opens the Top 5 as `help-wanted` issues labelled `competitor-watch`.
  - Projects it is told to cover: OpenHands, SWE-agent, Devin, the Copilot coding agent, Codex, Claude Code, Sweep, Factory, Jules, Gastown, Dagger agents, Kilo, Cline, Roo Code, Mentat, Aider, GPT-Engineer, Potpie, Agentless, CrewAI and LangGraph.
  - Categories: terminal agent, editor agent, cloud agent, fleet orchestrator, platform.
  - Prompt rule: "Facts only. Every claim has a link. If you find nothing new, say 'no news found'. Never invent news."

## 9. Non-goals and positioning (verbatim)

- **Non-goals** (`ROADMAP.md` "Non-goals (current)"):
  - "**Replacing human judgment.** Agent and reviewer-lane output is advisory wherever a human-approval requirement exists; Hive automates the pipeline around judgment, not the judgment itself."
  - "**A second docs site.** Docs are published by syncing `src/docs/` into the org docs site; this repo deliberately carries no site generator of its own."
- Other stated anti-positions:
  - "Hive is not about replacing humans." (hub landing).
  - "Hive doesn't replace maintainers; it earns its way into the work." (hub landing).
  - "Hive does not join AAIF, seek AAIF membership, or rely on AAIF to host or govern Hive." (what-is-hive.md).
  - "Hive does not implement Symphony's `WORKFLOW.md` or Codex app-server contracts." (landscape.md).
  - "Hive dispatching gh-aw as an external host is **not implemented**" (landscape.md).
  - "**Branch protection is GitHub's.** Hive does not configure or verify it." (security-model §11).
- **Positioning, verbatim**:
  - Category claim: "Hive is an operations plane for fleets of AI agents." (src/docs/landscape.md, "Conducted: 2026-10-23. This document will rot.").
  - Hub landing, "How Hive compares": "The ADLC platform you own outright … Where Hive stands apart: it makes autonomy something a repo earns as its test coverage grows (the six-level ACMM ladder), enforces what agents can do at the network layer rather than on the honor system, and gives you a live dashboard over the whole fleet — not just activity buried in GitHub." (https://hive.hivecommons.dev/). It compares against Fullsend, the GitHub Copilot coding agent, Devin and MS Planner / Jira Rovo: "Competitor rows reflect each vendor's public documentation checked on 2026-09-25; comparisons are our own."
  - **gh-aw**: "gh-aw compiles Markdown plus YAML frontmatter into a normal GitHub Actions workflow: an Actions-native on-ramp, not a fleet scheduler." "Keep existing gh-aw workflows when adopting Hive." Best fit for gh-aw: "A repo on Actions that wants bounded agent jobs"; for Hive: "Operators running continuous work across repos". (src/docs/landscape.md "GitHub Agentic Workflows (gh-aw)").
  - **OpenAI Symphony**: "Symphony is Apache-2.0; its Elixir build is an 'engineering preview for trusted environments'. … Hive borrows the idea of managing work rather than watching every coding turn." When to choose it: "spec-first `WORKFLOW.md`, Codex app-server, one workspace per ticket." (landscape.md "OpenAI Symphony"; also `docs/design/symphony-spec-alignment.md`).
  - **vibe-kanban**: "vibe-kanban is a local kanban board for coding-agent CLIs. It has no issue intake, triage, or admission. Hive has all three but no per-developer board." Hive mirrors its queue onto it one way (`bin/vibe-kanban-mirror.js`) via the vibe-kanban MCP server: "Hive owns admission and acceptance; changes made on this board are not written back." (src/docs/vibe-kanban.md).
  - **Copilot coding agent / Agent HQ**: "**GitHub Copilot coding agent** hands one issue to one hosted agent inside GitHub". Agent HQ is "Orchestrator, GitHub-only, hosted. Copilot stays a Hive backend." When to choose it: "the quickest hosted path for GitHub issues with no separate policy plane." (landscape.md).
  - **Fullsend**: "Fullsend is the closest open-source comparison." "Fullsend is lighter for one repo or org where Actions is already trusted. Hive fits when operators need live fleet visibility, many runtimes, graduated autonomy, hub-managed spokes, contributor compute, or network-level checks." It also admits "Fullsend already ships GitHub, GitLab and Forgejo." (landscape.md).
  - **Devin-class and SWE-agent**: "Hive differs from all three: open-source, self-hosted, fleet-scale, with explicit policy." (landscape.md).
  - **Goose/AAIF**: "Goose runs tasks; Hive sits above it and dispatches work to Goose at fleet scale." (landscape.md).
  - **Claude Managed Agents / OpenAI Agents API**: "Backend or hosting layer, not a work-source orchestrator." (landscape.md).
  - **Work-source agnosticism**, as a differentiator: "Hive is work-source agnostic … Hive states this as a differentiator: the same fleet, policy and dashboard apply whichever tracker holds the work. That claim covers **trackers**, not **forges**." (landscape.md).
  - **"Why not build your own"**: "standing up your own agent loop means re-solving problems Hive already handles." (hub landing video blurb).

## 10. Protocol support

- **MCP**:
  - Server, on the v5 line: the **public knowledge MCP**, `POST /mcp/knowledge`. It is "strictly **read-only**", off by default, switched with `HIVE_PUBLIC_KNOWLEDGE=1` or the dashboard, and needs no credentials (src/docs/public-knowledge-mcp.md).
  - Server, v6 only:
    - **Task-scoped MCP**, `/api/contribute/mcp` (`pkg/taskmcp`), with tools `task_context`, `context_bundle`, `related_work`, `ci_health` and repo tools, for contributor agents (ROADMAP v6; `src/docs/design/task-mcp.md` on v6).
    - **Admin MCP**: `POST /api/admin/mcp` over HTTP JSON-RPC, plus a stdio binary `hive-admin-mcp`. Verbatim: "lets you administer a hive by conversation from any MCP client … pause an agent, approve a plan or change a budget through a two-step confirmation. It is available on the `v6` line only." (`src/docs/admin-mcp.md` on branch v6). The hub landing lists it as "Edge v6 only".
  - Client: agents can be given MCP tools (`type: mcp` tool sources in agent config, `src/docs/agent-configuration.md` l.364). "GitHub MCP write tools are denied for every agent in every mode" (security-model §3). The vibe-kanban mirror is an MCP stdio client of vibe-kanban.
- **ACP (Agent Client Protocol)**: used only as a client probe to list Goose models. `src/pkg/dashboard/cli_models.go` spawns "goose's ACP agent server (`goose acp`, goose >= 1.37): JSON-RPC 2.0 … on stdio", protocolVersion 1, for initialize/session/new/session/close. Agents are not driven over ACP; they are driven by typing into tmux. No ACP mention in the user docs.
- **A2A**: no support. It appears only as prior art in `src/docs/design/external-workflow-admission.md` ("A2A, Nexus, Temporal …", "Prior art from Flue, Nexus/Temporal, Tekton, A2A …"). Absent from code.
- **AG-UI**: no mention anywhere in the repo, docs or sites.
- **OpenTelemetry**: optional and off by default. Verbatim: "Optional OpenTelemetry export is configured with an `otel:` block in `hive.yaml` and is off by default. When enabled, Hive exports OTLP/HTTP spans for governor eval cycles, agent kicks, and recorded lifecycle/PR events; agent spans use GenAI semantic convention attributes such as `gen_ai.system`, `gen_ai.request.model`, and token usage fields … plus Hive attributes like `hive.agent`, `hive.lane`, `hive.acmm_level`, and `hive.governor.mode`." (architecture.md §10). Prometheus `/metrics` is on :3002.
- Other machine surfaces: `crux serve` exposes the agent runtime over "HTTP+JSON under `/v1`" (competitor-report ground truth, hivecommons/crux). CEL triggers (`triggers:` in hive.yaml, src/docs/cel-triggers.md). GitHub webhooks are an accelerator (`/api/webhook/github`); polling is the baseline.

## 11. Licence, governance, contributor agreement

- **Licence**: Apache-2.0 (LICENSE; gh API SPDX `Apache-2.0`). There is a 305 KB `NOTICE`. "Every source repository in the organization is Apache 2.0 licensed, requires DCO sign-off on every commit, and follows the CNCF Code of Conduct." (hivecommons.dev).
- **Governance** (GOVERNANCE.md): "The Hive maintainer committee owns day-to-day decisions for this repository: issue triage, PR review, merge decisions, release readiness, security response coordination, and project-specific policy changes."
  - Maintainers: @clubanderson Andy Anderson (IBM), @hanthor James Reilly (Universal Blue), @Danathar Doug Baggett (independent), @nicholasjackson Nic Jackson (IBM), @kellyaa Kelly Abuelsaad (IBM).
  - "Routine changes use lazy consensus through GitHub review." "Controversial or cross-project decisions may be escalated to the Hive Commons maintainer committee." Breaking changes go "through the supermajority process" (ROADMAP intro).
  - Contributor ladder: "Contributor → Organization Member → Reviewer → Maintainer". Org-level records: https://github.com/hivecommons/.github/blob/main/MAINTAINERS.md .
- **OWNERS**: `approvers` and `reviewers` are both exactly the same five maintainers. "These files MUST agree … CNCF maturity review checks that code ownership matches documented governance roles."
- **Inconsistency**: hivecommons.dev says "Hive is maintained by a three-member Maintainer Committee spanning three organizations", while GOVERNANCE/OWNERS list five people (three IBM). @hanthor and @Danathar were added to OWNERS on 2026-08-28 (/stories/).
- **Contributor agreement**: **DCO only, no CLA** (CONTRIBUTING.md "DCO sign-off": "Every commit must include a Developer Certificate of Origin (DCO) sign-off"). The CNCF sandbox issue carries the label `contribution-agreement/unsigned` (that is the CNCF project contribution agreement, not a contributor CLA).
- Code of Conduct: CNCF CoC (CODE_OF_CONDUCT.md).
- Security reports go through GitHub private vulnerability reporting; ack target "within **5 business days**". The project is enrolled in "Anthropic's OSS Scanner" (SECURITY.md); `security@hivecommons.dev` (hivecommons.dev footer). It has an OpenSSF Best Practices badge (project 14261).
- Community: biweekly meeting "Thursdays 10:00 AM ET"; Google Group https://groups.google.com/g/hivecommons-dev ; YouTube https://youtube.com/@hivecommons ; Substack https://substack.com/@hivecommons .

## 12. Website vs repo contradictions

1. **Hold label**: hivecommons.dev says "below L6, hive-owned PRs are gated with the hive-specific hive-pause label". The repo says level holds use literal `hold` and that `hive-pause/<hive-id>` is a manual hold (acmm-policy-matrix.md "Key Rules").
2. **Forges**: the hub landing lists GitLab and Gitea/Forgejo as source control. The repo marks them Planned and says GitHub is the only working forge (integrations.md).
3. **Agent lifetime**: "short-lived agents" (README, what-is-hive, website) vs "long-lived agents in tmux" (landscape.md, sandbox-isolation.md).
4. **GitHub tokens**: "No agent receives a GitHub token" (sandbox-isolation.md) vs per-agent mode-scoped App token files injected by the `gh` wrapper (security-model §5).
5. **CNCF status**: "a CNCF Sandbox project" (GOVERNANCE.md) vs "sandbox project candidate … does not imply CNCF acceptance" (README). cncf/sandbox#516 is still open.
6. **Maintainer count**: three (hivecommons.dev) vs five (GOVERNANCE.md, OWNERS).
7. **Stale "v2"**: "Hive v2" in the get-started page and in `hive.yaml.example`. The get-started .env path is `.env` while the README uses `src/.env`.
8. **L4**: /learn says L4 is "Still no PRs". The policy matrix lets quality, sec-check and ci-maintainer open hold-gated PRs at L4.
9. **Hub registration**: "Hub registration has no review step" (security-model §11) vs "unauthenticated registration was deliberately removed" (/get-started).
10. **Soak default**: the 095 soak defaults to 30 minutes per the label doc, while `hive.yaml.example` shows `soak_minutes: 120` as a sample.
11. **Spektacular version**: the spektacular.dev header shows v0.19.2; the latest GitHub release is 0.29.0.
