# Run cards: game theory and mechanism design

Status: research record, 2026-10-01. It informs the proposed [Run cards](../concepts/run-cards.md) and is not current guidance. Everything here is a proposal; what Ploeg actually stores is in [Ploeg ADR-0045](../../apps/ploeg/docs/adrs/0045-keep-run-usage-and-merge-facts.md) to [ADR-0047](../../apps/ploeg/docs/adrs/0047-ploeg-learns-where-a-merged-change-is-deployed-from-a-generic-deploy-endpoint.md).

**Question.** Which rules make each player's self-interested best move also the behaviour Unfold wants? The players are developers (stewards and approvers), reviewers, the AI agents, team leads and agency Clients.

**Method.** Each candidate metric and reward was checked for how it is gamed, who is hurt and what counters it, against mechanism-design and incentive literature, SZZ accuracy studies and safety-reporting practice. Scoring formulas were then derived and checked for equilibrium effects.

**Limitations.** The formulas are uncalibrated first guesses. Lazear and Rosen's tournament papers are cited from memory without a verified link. The brief was written while the product was called Glide, and assumed one card per merged pull request.

**Terms.** *Mechanism design* is choosing a game's rules so self-interest produces the wanted behaviour. *Goodhart's law*: a measure that becomes a target stops measuring. *Incentive-compatible*: telling the truth is each player's best strategy. *Moral hazard*: a protection that makes people careless. An *equilibrium* is a state where no player gains by changing strategy alone.

## Five principles

1. **The game is a mirror, not a wage.** When only some of a job can be measured, strong incentives on the measured part pull effort from the rest, and weak or no incentives can be optimal ([Holmström & Milgrom 1991](https://www.sfu.ca/~allen/HolmstromMilgrom.pdf); [Kerr, "On the folly of rewarding A while hoping for B"](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Motivation/Kerr_Folly_of_rewarding_A_while_hoping_for_B.pdf)). Cards never feed pay, promotion or reviews. In the Netherlands a system that can monitor performance also needs works-council consent ([WOR art. 27](https://wetten.overheid.nl/BWBR0002747/)).
2. **Reward outcomes measured late and hard to fake.** Survival in production without defects others find is hard to fake; volume, speed and lines are easy. Those are shown, never scored.
3. **Separate the steward from their own measurement.** The steward never decides whether a bug links to their card.
4. **Make honesty the cheapest strategy.** Self-reported cracks cost less than discovered ones, like the limited immunity of aviation's reporting system ([FAA/NASA ASRS](https://en.wikipedia.org/wiki/Aviation_Safety_Reporting_System)). No "zero incidents" counters: OSHA warns they suppress reporting ([OSHA memos, AIHA summary](https://www.aiha.org/news/osha-clarifies-its-position-on-incentive-programs-and-drug-testing)).
5. **Rank nobody; compare a card with its own expectation.** Tournaments invite sabotage, here pinning bugs on rivals (Lazear & Rosen 1981; Lazear 1989).

A penalty can turn into a price: a fine for late daycare pickup *increased* lateness ([Gneezy & Rustichini 2000](https://rady.ucsd.edu/_files/faculty-research/uri-gneezy/fine-price.pdf)). A crack must read as history, in the blameless-postmortem stance ([Google SRE, postmortem culture](https://sre.google/sre-book/postmortem-culture/)).

## How each metric is gamed

**Scored** feeds XP, grade or rarity; **shown** is a fact without score; **crew** is scored only on the agent Team's stats; **team** only at team level; **dropped** is not used.

| Metric or reward | Gamed by | Counter | v0.1 |
| --- | --- | --- | --- |
| Card count | approving trivial changes; splitting | XP from Size points fixed before work; weekly diminishing returns; zero-XP maintenance cards | Shown |
| Signing | avoiding it through silent Acceptance; adopting only survivors | an unsigned change becomes an **Orphan**, a team stat; adoption within 14 days, XP from adoption on | Team |
| Survival XP | changing dead code; delaying deploys; blocking refactors | only production-deployed days count; log curve with a cap; replaced code **retires** with no loss | Scored |
| Cracks | under-linking, relabelling, quiet fixes; pinning bugs on rivals; "we don't crack each other" | automatic candidates plus the fixer's answer; steward never confirms own link; self-report halves the cost, concealment adds half; dedicated fix pull requests | Scored |
| Mends | crack farming | a mend restores most but never all; gold is cosmetic; confirmed after 30 days without re-crack; same-person crack and mend within 7 days counts as rework ([DORA metrics history](https://dora.dev/insights/dora-metrics-history/)) | Scored |
| Rarity | minimum-qualifying farms; nomination swaps; retroactive epics | ex-ante difficulty, long survival, thresholds from last season, public capped nominations, epics declared before work | Scored |
| Grade | early top grades on trivial work; lenient reviewers | no top grade before 180 days; reliability risk-adjusted; review weighted lowest | Scored |
| Level | grinding volume | quadratic level curve, Size caps, weekly damping | Derived |
| Cost | cheapest model, fewer review Rounds | scored only for the agent crew, per accepted and surviving Size point; shown for humans in nl-NL, two decimals | Crew |
| Budget share | inflating the Size; stopping early | the Client approves the Size; team Size calibration; survival, not spend, drives XP | Crew, team |
| Tokens | either direction | display only | Shown |
| Lines changed | padding or avoiding deletions | never scored; counted like the Diff Limit; a cosmetic "Lighter" stamp for net deletions | Shown |
| Review findings | nitpick inflation, "finding laundering" | only findings acted on count, capped | Scored, low |
| CI result | deleting or weakening tests; an agent patching the evaluator ([METR 2025](https://metr.org/blog/2025-06-05-recent-reward-hacking/)) | record the test delta; test removal needs reviewer acknowledgement; card scores never reach an agent's objective | Scored, crew |
| Time to merge | rubber-stamping or sitting on pull requests | review latency is a team stat; review quality falls above about 400 lines and 500 lines an hour ([SmartBear](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/)) | Team |
| Regressions | reclassifying as new bugs | regressions are cracks; a revert is a high-confidence candidate; "requirement changed" is **Evolved**, decided by the confirmer | Scored |
| Streaks | weekend token work; hiding incidents | **no streaks** ([Moldon, Strohmaier & Wachs, ICSE 2021](https://arxiv.org/abs/2006.02371)) | Dropped |
| Reviewer assists | drive-by approvals; approval rings | assists need a substantive review; additive 25 % of card XP; reciprocity shown as a flag | Scored |
| AI crew stats | tuning the Team manifest to the stat | outcome-based stats per manifest version, never injected into prompts | Crew |
| Epics as sets | declaring after the fact; padding | declared before the first child Shift, at least 3 children and 6 Size points | Scored |
| Team sets | free-riding; hiding cracks to save the set | a crack shows until mended but never voids a set | Team |
| Skins | a skin that hides cracks | crack and mend overlays are universal | Cosmetic |
| 1-of-1 nominations | swapping | one per person per season, none for yourself, public | Scored |
| Client-facing stats | the agency hides cracks; a Client over-attributes for a Reversal | Clients see team aggregates; a Reversal may *propose* a crack, a crack never refunds | Team |

## Attribution: tracing a bug to a change fairly

### What the research says about SZZ

SZZ blames the lines a fix deletes or modifies at the fix's parent to find candidate bug-inducing commits ([Śliwerski, Zimmermann & Zeller, MSR 2005](https://www.st.cs.uni-saarland.de/papers/msr2005/)). Accuracy is mediocre and worse per pull request:

* Against 1,930 developer-named links, the best F-measure was about 61 % (R-SZZ), precision 64 to 66 %, about 67 to 73 % when candidates committed after the bug report are dropped ([arXiv 2102.03300](https://arxiv.org/abs/2102.03300); code: [pyszz](https://github.com/grosa1/pyszz)).
* At pull-request level at Mozilla, precision fell to 0.19 and recall to 0.49; over 20 % of links cannot be recovered ([arXiv 2209.03311](https://arxiv.org/html/2209.03311v1)).
* In the Linux kernel, 17.5 % of fixes are "ghost commits" that only add lines and cannot be traced ([arXiv 2308.05060](https://arxiv.org/abs/2308.05060)).
* Only about half of commits identified as fixes really were ([arXiv 1911.08938](https://arxiv.org/pdf/1911.08938)); 33.8 % of "bug" reports were not bugs ([summary](https://bertrandmeyer.com/2013/05/19/reading-notes-misclassified-bugs/)); severity labels are unreliable ([Tian et al., EMSE 2016](https://link.springer.com/article/10.1007/s10664-015-9409-1)); 33 % of bugs surface only in later versions ([Chen et al., MSR 2014](https://petertsehsun.github.io/publication/msr2014/)).

**SZZ may propose a link but never applies a crack on its own.**

### The flow (proposed)

1. **Trigger:** a merged fix for a bug or incident Work Item, a production revert, or a failed post-deploy check.
2. **Candidates:** an R-SZZ-style pass that ignores cosmetic changes, drops candidates merged after the bug report, maps commits to pull requests and ranks them by blamed share. Ghost fixes propose the last change to the enclosing function at low confidence. A revert is a high-confidence candidate by itself.
3. **The fixer is asked** "which change introduced this?", with candidates prefilled. "Requirement changed" gives **Evolved** and no crack.
4. **Confirmation** needs the fixer and one other person who is not the steward. It records whether the bug broke the original Acceptance Conditions or a correctness floor (crash, data loss, security, regression), the same definition of "defect" a Reversal uses.
5. **The steward has 5 working days** to accept or dispute; silence accepts.
6. **A rotating referee** settles disputes within 5 working days. Losing a dispute adds no penalty.
7. **The record is append-only**; an unlinked crack stays as "unlinked by referee".

**Split blame:** a link is **primary** or **contributing**. Necessary primary causes share equally (Shapley-style); contributing links take a fixed 0.25 share and show as a hairline. At most 3 cards per bug; beyond that the bug is systemic, a team-level event. **AI-written code:** the approver answers for it, and the crack is also recorded on the agent crew's stats, never in a way that lets the human off and never fed to the agent.

**Warranty window** from the first production deploy: full weight for 0 to 180 days, half for 181 to 365, history only after that.

**Severity**, set by the triager: S1 = 4 (outage, data loss, security), S2 = 2 (major function broken, production revert), S3 = 1 (minor, with a workaround), S4 = 0.25 (cosmetic). A declared incident, a production revert or a confirmed Reversal is at least S2.

### Why self-reporting wins

Let *p* be the chance a hidden link is found anyway. For an S3 bug the steward later mends: self-reporting costs 1 × 0.5 × 0.5 = 0.25 for certain; hiding costs 0.5 × *p* in expectation. Honesty wins whenever *p* ≥ 0.5. With the concealment factor of 1.5, hiding costs 0.75 *p*, so honesty wins from *p* ≥ 0.33. Commit-level recall of 0.6 to 0.7 plus the fixer's answer and revert detection puts *p* above 0.5 for most bugs. In a repeated game, being caught hiding once costs more than any single crack.

## Scoring design

* **XP curve:** log in production days, reaching full value at 180 days, a tail to 1.25 at 365, then flat. Linear rewards sitting still; decay feels like loss. A rolling 90-day **Form** number shows recent activity without decay.
* **Risk adjustment**, like a hospital's standardised mortality ratio: base value B = Size points × R, with R from 1.00 to 1.75 (+0.25 each for an Attention Path, a hotspot, ≥ 3 modules). Crack cost is divided by R, so expected grade is the same for risky and safe work. Calibrate R from data later.
* **Volume damping:** within 7 days, the first 10 Size points count fully, the next 10 at half, the rest at a quarter.
* **Grade, four subgrades:** reliability 40 % (crack weight × discovery × mend, divided by R), durability 25 % (survival), delivery 20 % (first-pass CI, fix Rounds, budget, unacknowledged test removal), review 15 % (acted-on findings, Attention Path acknowledgement, resolved AI findings; self-merged without review scores low). No top grade before 180 days.
* **Mended versus never cracked:** for an S3 bug, reliability is 100 never cracked, 95 self-reported and mended by the steward, 90 discovered and mended by the steward, 85 mended by someone else, 80 unmended, 70 concealed. A mended card stays slightly below an untouched one, so farming loses; the gap is small enough that hiding never pays.
* **No streaks.**
* **Team versus individual:** cards and stewardship are individual; sets, season goals and every speed or flow metric are team-level; no individual leaderboards.
* **Epics as sets:** complete when every child is Settled (30 days live) with no unmended primary crack; a Legendary set card lists contributors by Size share; a 20 % set bonus is shared by Size.

## Rarity

Earned, never random: ex-ante difficulty the steward does not control, long survival and scarce peer recognition. Thresholds are published per season from the previous season's distribution and are not zero-sum within it.

| Tier | Criteria | Target share |
| --- | --- | --- |
| Common | merged and signed | the rest |
| Uncommon | Settled, a good grade, Size M or higher risk | about 30 % |
| Rare | Proven (180 days), a high grade, high base value | about 10 to 15 % |
| Epic | Rare criteria plus Size L with high risk | about 3 % |
| Legendary | a completed set, or the capstone child that closed it | per set |
| 1-of-1 Keystone | the most-nominated card per team per season | one |

Cosmetic overlays, not tiers: **Kintsugi** (mended), **Holo** (365 days), **Firefighter** (a Proven fix for an S1 crack on someone else's card), **Lighter** (net-negative diff). Nothing is tradeable: trading would create a market for dumping risky stewardship. When someone leaves, their cards become **Emeritus** and the team adopts them.

## Reviewers, agents and Clients

* **Reviewers** earn assists for substantive reviews and never take cracks; their assist XP pauses while a card is cracked, so they share the reason to mend.
* **AI crew stats**, per Team manifest version: cost per accepted and surviving Size point, first-pass CI, fix Rounds, budget share, risk-adjusted crack rate, reviewer calibration, test-removal incidents. Never fed into a prompt or objective. The agent is never a steward.
* **Clients** see team aggregates and each Delivery's card without the steward's name unless the agency turns that on. Cards and billing stay separate: a crack never refunds anything.

## Equilibrium

| Behaviour | Pushed toward | Wanted? |
| --- | --- | --- |
| Change size | small to medium | yes |
| Volume | up to review capacity, then stop | yes |
| Risky work | roughly neutral | yes, if R is calibrated |
| Linking honesty | self-report when *p* ≥ 0.5 | yes |
| Mending | fast steward mends, confirmed after 30 days | yes |
| Tests | more tests; removal flagged | yes |
| Refactoring | neutral to positive | yes |
| Ownership | some aversion to signing | **no**: watch the Orphan count first |
| Collusion | tacit pacts, approval rings | **no**: links come from automation and the fixer, referees are third parties |

The equilibrium is a team that ships review-sized changes, takes on hard work, reports its own defects and mends them quickly. The two pressures to watch are **ownership aversion** and **attribution fatigue**. If the game starts to feel like a wage, lower its weight rather than add rules.

## Data each rule needs (as found on 2026-10-01)

| Input | In Ploeg then? |
| --- | --- |
| Steward, reviewers, merge time and commit | partly; [ADR-0045](../../apps/ploeg/docs/adrs/0045-keep-run-usage-and-merge-facts.md) since adds them |
| Size, Shift Budget, cost, tokens, Rounds, Verdicts, findings | yes (Size is proposed) |
| Files, modules, lines, Attention Paths | no; [ADR-0046](../../apps/ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md) since adds diff counts |
| CI first pass, test delta | no; ADR-0046 since adds the combined commit status |
| Production deploy containing the merge | no, the biggest gap; [ADR-0047](../../apps/ploeg/docs/adrs/0047-ploeg-learns-where-a-merged-change-is-deployed-from-a-generic-deploy-endpoint.md) since adds it |
| Bug severity, epic membership | no |
| Fix → candidate changes, hotspots | no |

Suggested order: deploy events and diff stats, then attribution, then reliability, mends and sets, then rarity and seasons. Each is its own Ploeg ADR; Vloer only displays.

## Where the design departed from this record

The owner's later decisions, recorded on the [Run cards](../concepts/run-cards.md) page, changed several points:

* The unit is the ticket (Work Item), not each merged pull request; pull requests are plays.
* The grade is 1 to 10 in half steps, capped at 9 while Provisional, instead of 0 to 100 with letters.
* Levels need 25·n² XP instead of 100·n².
* The proposed steward is the developer carrying the ticket (the tracker assignee at release), with the merger and then the approver as fallbacks.
* Personal binders are private. The per-person stewardship stats this record suggested for a profile (mend rate, candor, dispute rate) appear in no shared view.
* Sprint packs add cosmetic random pulls, earned and never bought; rarity itself stays deterministic.
