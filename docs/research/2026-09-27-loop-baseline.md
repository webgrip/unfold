# Loop baseline, 27 September 2026

Date: 27 September 2026, against Ploeg 0.4.0-rc.2 as deployed that day. This is a record, not current guidance. The measures are defined in [KPIs](../reference/kpis.md); the next measurement follows [run a pilot batch](../how-to/run-a-pilot-batch.md).

The loop has not run unattended since 27 August, and as deployed it cannot take a Glide Work Item. Of 17 pull requests agents opened, 6 were merged, all from July, before the Shift engine. No Shift has ever settled as ready for review, and spend was recorded for 3 of 56 unattended Runs.

## Method

Read-only queries on the Ploeg database (`work_items`, `shifts`, `agent_runs`, `run_llm_accounts`, `audit_log`, `work_item_reviews`), the live HelmRelease values, `ploeg-config`, ScaledJob annotations and ploegd logs. Pull request state came from the Forgejo API for the public `webgrip/ploeg`; for the private `webgrip/erfbeeld` and `webgrip/ploeg-bench-world`, merge status comes from git ancestry only. The LiteLLM spend log was not read, so historical spend is incomplete. Five operator-owned Unfold sessions are excluded. Amounts are in US dollars, LiteLLM's unit. No Work Item was dispatched and nothing was spent.

## Headline

| Measure | Value |
| --- | --- |
| History | 25 Work Items (20 unattended), 19 Shifts (13 unattended), 62 Runs, 24 July to 11 September |
| Agent pull requests opened | 17 (ploeg 11, erfbeeld 5, ploeg-bench-world 1) |
| Merged | 6, all before the Shift engine |
| Merged without owner commits | 3 of 17 opened (18 %), 3 of 6 merged (50 %) |
| Shift-era pull requests merged | 0 of 9 |
| Cost per merged pull request | Not computable. 0 of 56 unattended Runs have an LLM account; US$ 0,24 is recorded in total |
| Review Rounds per Shift | 2 (builder, then reviewer). No reviewer ever requested changes, so there were 0 fix Rounds |
| Owner review | 0 formal reviews; fix-up commits (gofmt, test fakes, migration dedupe) on 3 of 6 merged pull requests |
| Shifts ready for review (K1) | 0 of 13. Single-writer Shifts settled `done` and approved reviews settled `needs_human`; `8af4b75` fixes this but no Shift has run since |
| Shift duration | median 18,7 minutes, longest 7 hours 57 minutes |
| Pull request open to merge | 4,7 to 15 hours on ploeg, about 7 days on erfbeeld |

Unattended Run outcomes (56): 21 opened a pull request, 19 found no change needed, 8 failed, 4 lost their lease, 2 failed on infrastructure and 2 got stuck. Shift close reasons (13): plan exhausted 6, review approved 4, Run stuck 2, writing Run failed repeatedly 1.

## Failure modes

1. **The loop is disconnected in production.** Tracker project Ploeg (10) routes to the archived `webgrip/ploeg`, and no route names `webgrip/glide`. Project De Vloer (14) routes to `homelab-cluster`. Projects 3, 5, 9, 10, 14 and 50 have no assignment webhook, so assignments there never dispatch. The bronze builder and reviewer ScaledJobs carry `autoscaling.keda.sh/paused: "true"` from a postRenderer patch, and bronze is the only Team with a builder and a reviewer. The default Team, copper, runs `cat` and settles Work Items as `done` with nothing changed.
2. **Worker infrastructure.** 8 of 22 Shift-era Runs failed on infrastructure: three lost leases (one Shift ran almost 8 hours), a LiteLLM key-mint failure, a clone failure, and a reviewer image without `opencode`.
3. **Unmeasured quality and spend.** The agent reviewer approved every pull request it read, yet the owner fixed formatting and tests on half the merged ones: checks a verification gate in the worker would catch. Spend is unrecorded for unattended Runs, and one blocked account (Run 124) logs an unresolved settlement every 30 seconds.

Most historical Work Items were synthetic smoke tasks. About six were genuine work, and the four genuine merged ones were Ploeg's own July fixes on the silver Team.

## Not measured

Historical LiteLLM spend, the open or closed state of private-repository pull requests, and owner review minutes (KPI D2 has no source).

## To take the next baseline

Route Vikunja project 10 to `webgrip/glide` on `development`, register its assignment webhook, unpause or replace the bronze workers, confirm Glide's verification runs offline in the worker image, then run the pilot batch.
