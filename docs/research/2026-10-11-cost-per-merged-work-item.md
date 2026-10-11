# Cost per merged Work Item on homelab, 29 September to 11 October 2026

Date: 11 October 2026, read-only on Ploeg's database on homelab (Ploeg 0.2.0-rc.16), against `origin/development` at `078cc17f`. This is the evidence for spike [VIK-1617](https://vikunja.webgrip.dev/tasks/1617). It tests the planning numbers in [ADR-0006](../adr/adr-0006-the-ticket-is-the-billing-unit.md#decided-numbers) against measured cost, and belongs to the models and Team shape record ([Unfold #333](https://forgejo.webgrip.dev/webgrip/unfold/pulls/333)). Nothing is decided here; the sample is too small to change a number.

> **Method.** The query in [evidence/2026-10-11-cost-per-merged/query.sql](evidence/2026-10-11-cost-per-merged/query.sql) reuses the shared settle CTE and the K2 run cost from [the KPI page](../reference/kpis.md), on every Shift opened since 29 September 2026, when spend started to settle from the gateway. A Run's cost is its reconciled spend, else its observed spend, else its settled usage, as K2 defines it; Ask Runs are left out. A Work Item counts as **merged** when Ploeg recorded "pull request merged" after one of its Shifts settled, and it is counted once however many Shifts it took. All spend of a Work Item counts, including Shifts that failed. Every Run in the window has settled spend (`runs_unsettled` is 0). Raw output: [per Shift](evidence/2026-10-11-cost-per-merged/per-shift.txt) and [per Work Item](evidence/2026-10-11-cost-per-merged/per-work-item.txt).

## Verdict

- Bronze in its current setup (DeepSeek V4.1 Flash builds, GLM 5.3 Flash reviews) spent **US$ 1,04 per merged Work Item**, failures included, on 6 Work Items of which 3 merged. That is well inside ADR-0006's €4 launch gate per delivered S.
- A Work Item costs bronze about **US$ 0,52** on average, two to three times the US$ 0,15 to 0,23 per S Shift the economics drill-down estimated from list prices, because Shifts run fix Rounds and some Work Items need more than one Shift.
- No Shift hit its budget (0 of 20), against an assumed cap-hit rate under 15 %.
- Silver cannot be judged: its builder changed from Claude Sonnet 5 to `deepseek-chat` to Fireworks inside the window, which is why Runs need to record their configuration ([VIK-2027](https://vikunja.webgrip.dev/tasks/2027)).
- **The sample is far below 20 settled Shifts per configuration.** At bronze's recent pace of about one Work Item every two days, 20 Work Items on the current setup are expected around 8 November 2026 if nothing changes.

## Per Team

Amounts are US$, settled.

| Team | Work Items | Shifts | Spend | Reached review | Merged | Per merged Work Item | Per Work Item |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bronze, all setups | 8 | 11 | 5,50 | 6 | 4 | 1,37 | 0,69 |
| bronze, current setup | 6 | 6 | 3,13 | 4 | 3 | 1,04 | 0,52 |
| silver, mixed setups | 4 | 9 | 14,01 | 2 | 2 | 7,00 | 3,50 |

Per Shift, bronze spent US$ 0,53 at the median and US$ 0,87 at p90 against an US$ 8 pool; silver US$ 1,39 and US$ 2,34 against US$ 6. One bronze Work Item from 11 October (#186) is still awaiting review, so bronze's merged count can still rise.

## Against the planning numbers

| Assumption | Where | Measured | Holds? |
| --- | --- | --- | --- |
| An S Shift on open-weight models costs about US$ 0,15 to 0,23 | economics drill-down | US$ 0,52 per bronze Work Item, current setup | no, 2–3× higher |
| 55 % delivery rate for planning | ADR-0006 | bronze 3 of 6 merged (50 %), silver 2 of 4 | not testable at n = 6 |
| 60 % of S tickets delivered at €4 or less per delivered S | ADR-0006 launch gate | US$ 1,04 per merged bronze Work Item | cost side yes; delivery side unknown |
| Shifts that hit the pool or a Role cap stay under 15 % | VIK-1617 | 0 of 20 | yes |

The Work Items were not sized, so "S" is assumed, not measured ([VIK-1622](https://vikunja.webgrip.dev/tasks/1622) adds the Size).

## Where the money went in bronze

| Role | Settled model | Runs | Cost | Input tokens | Output tokens |
| --- | --- | --- | --- | --- | --- |
| builder | DeepSeek V4.1 Flash | 8 | 2,57 | 116,3 M | 1,1 M |
| reviewer | GLM 5.3 Flash | 5 | 0,56 | 13,2 M | 0,2 M |

The builder reads about 100 tokens for every token it writes, so cached-input pricing, not output price, drives its cost. Four Shifts in the window ended as "run stuck" (three bronze, one silver) and four silver Shifts because the writer kept failing; each needed a person, whose time costs more than the tokens and is outside this measurement.

## Verification still owed

The owner checks two rows of this file against the K2 and K5 panels of the "Glide — Loop" dashboard for the same window, as VIK-1617 asks.
