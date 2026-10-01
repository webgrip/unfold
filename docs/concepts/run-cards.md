---
type: explanation
audience: [owner, operator, contributor, agent]
owner: unfold
last_verified: 2026-10-01
verified_by: "built parts read against Ploeg ADR-0045, ADR-0046, ADR-0047 and ADR-0049, Vloer ADR 0026, apps/ploeg/pkg/store/card.go and apps/vloer/public/cards on development @ 810c97a; binders, packs and seasons read against Vloer ADR 0029 and apps/vloer/src/{collection,packs,season}.ts on feat/vloer-binder-packs; proposed parts checked against the owner's design page and card contracts of 2026-10-01; the Vloer collection was run in its demo browser flow"
---

# Run Cards

A **Run Card** is the record of one Work Item's change and its life in production. It shows who carried the change, what its Runs cost, which pull requests it took, how review and CI went and where it is deployed. Over time it is meant to show how well the change held up. It makes caring about a change visible, and it is meant to be fun.

**Most of this page is a proposal.** Ploeg already assembles a card for every Work Item and Vloer draws it, with days live and a finish. Rarity is an open decision. Everything else below is labelled **Proposed** and is not built. The [glossary](../reference/glossary.md) defines each **bold** term.

## A record of a change, not a score of a person

The research behind Run Cards draws one line ([gamification evidence](../research/2026-10-01-run-cards-gamification-evidence-and-law.md)):

* A card that records a change and how it holds up in production makes people care about their changes.
* A card that scores a person, through ranks, totals or streaks, makes people game it. In a Dutch company it also needs the works council's consent, and at scale a data protection impact assessment (DPIA).

So every number on a card describes the change. The person appears only as its **Steward**, the one who answers for it. Four consequences follow:

* **Ownership comes from signing, provenance and mending, not from points.**
* **Card state never gates anything.** Grade, rarity and finish never change what Ploeg authorizes, budgets or merges. A card reports outcomes; it does not decide them.
* **Nothing on a card is bought, traded or tied to pay.** Card data is never used in pay or performance reviews.
* **Nobody is ranked.** No shared view totals card data per person.

## What is built and what is proposed

The first three build phases are merged on `development`: P0 keeps the facts a card needs, P1 puts the card on the Work Item page, and P2 adds life in production. Their ADRs still have the status `proposed`. Later phases (cracks and mends, epics, all skins and full ceremony) are not started. The Vloer side of Binders, Packs and seasons is built against fixtures, waiting for Ploeg's card list.

| Part | State | Where it is recorded |
| --- | --- | --- |
| Ploeg keeps every usage figure a harness reports, and every merge and review fact a forge reports | Built; its ADR is still proposed | [Ploeg ADR-0045](../../apps/ploeg/docs/adrs/0045-keep-run-usage-and-merge-facts.md) |
| One card per Work Item, assembled from stored facts: state, Plays, Steward (fallback rule), Roster (merger and reviewer), agent crew, totals, events, diff size and CI | Built; ADR proposed | [Ploeg ADR-0046](../../apps/ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md) |
| Card style chosen per Work Target (`cardStyle`) | Built; only the Vloer Native skin exists | Ploeg ADR-0046, Vloer ADR 0026 |
| A generic deploy endpoint, deployments per environment and the release time | Built; ADR proposed | [Ploeg ADR-0047](../../apps/ploeg/docs/adrs/0047-ploeg-learns-where-a-merged-change-is-deployed-from-a-generic-deploy-endpoint.md) |
| Usage so far while a Run is running | Built; ADR proposed | [Ploeg ADR-0049](../../apps/ploeg/docs/adrs/0049-a-run-card-reads-the-gateway-for-usage-so-far-while-a-run-is-running.md) |
| The `<unfold-card>` runtime, the Vloer Native skin, the card on the Work Item page, days live, the finish ladder and a demo card | Built; ADR proposed | [Vloer ADR 0026](../../apps/vloer/docs/adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md) |
| Rarity | **Open**; Ploeg sends `null` | |
| Binders, Packs with published odds and stored cosmetic pulls, the pack ceremony and team season pages | Vloer side built against the card contract and fixtures; ADR proposed; Ploeg's card list built in parallel | [Vloer ADR 0029](../../apps/vloer/docs/adrs/0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md) |
| Grade, condition (Cracks and Mends), level, Gates and Bounces, Roster roles and copies, the Steward rule, Set Cards, themes, more skins, the effects director, retention | **Proposed** | This page |

To make a project count days live from real deploys, see [Send deploys from a pipeline to Ploeg](../../apps/ploeg/docs/how-to/send-deploys-from-a-pipeline.md). Until a project reports deploys, the release counts from the merge, and the card says so.

## The unit: one card per Work Item

The owner decided the unit on 2026-10-01.

* **One card per Work Item.** A Work Item that bounces three times in test produces four pull requests. Four cards would split one feature's story, cost and bugs, so the card is the Work Item.
* **Its pull requests are Plays.** Each pull request attaches as a numbered **Play** (for example #57, then #61 after the first bounce, then #64). Cost and lines are summed across Plays. The Runs of each Play appear on the back as the crew.
* **An epic is its own Set Card** (Proposed). An epic Work Item gets a **Set Card** whose children are Run Cards, numbered 1/5 to 5/5. Ploeg reads no tracker parent relations yet, so this needs an ingest change first.
* **Chores are tokens** (Proposed). A chore such as a dependency bump gets a minimal frame and stacks in the Binder; volume earns nothing.
* **Failures are scuffs, not separate cards** (Proposed). A failed Shift scuffs its Work Item's card. A Work Item never delivered is shelved as withdrawn. A sprint or a release is a page, not a card.

Ploeg derives the card's state today: `drafting` before the first pull request, `in_review` while one is open, `merged`, `closed` or `withdrawn` ([ADR-0046](../../apps/ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md)).

## Five axes

Collectible games keep *what a card is* apart from *what it earned*; mixing them causes inflation and grind ([trading-card design](../research/2026-10-01-run-cards-trading-card-design.md)). A Run Card has five axes, each with its own visual channel.

### Rarity: open

**Rarity** says how exceptional the change is, apart from how well it was done (Grade) and how long it has held up (Finish). It is cosmetic only. **The owner has not decided it.** Ploeg sends `rarity: null`, and nothing may depend on it.

The current proposal:

* **Rarity means challenge.** It is fed by facts the developer does not control afterwards: the complexity and risk of the code touched, its reach (modules, repositories, migrations, API), novelty and estimate versus actual. Lines, cost and time are excluded because they are easy to pad.
* **Two moments.** At mint the card lies face down with a glow predicted from what is known up front. At release it turns over to its rarity from the real data. That is deterministic, never a gamble.
* **Tiers are percentiles per project and season:** Token (chores), Common, Uncommon (top 40 %), Rare (top 15 %), Epic (top 5 %) and Legendary (top 1 %). Fixed thresholds apply while a project has fewer than about 30 cards. A Set Card's rarity comes from completing its set.
* Special printings mark genuinely rare events rather than tiers: 1st Edition, Black Label, Keystone and Untouched.

Still open: challenge alone, or a mix of challenge and quality; reveal at release or at acceptance; comparison per project or per Team.

### Finish: built

A **Finish** is earned by staying live in production. Vloer computes it from Ploeg's release time and ignores the `finish` Ploeg sends ([Vloer ADR 0026](../../apps/vloer/docs/adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)):

| Days live | Finish |
| --- | --- |
| under 7 | matte |
| 7 | foil |
| 30 | holo |
| 90 | prism |
| 180 | gilded |
| 365 | infinity |

Days live are whole days since the first production deploy of the latest merged Play. When the repository has never reported a production deploy, they count from the merge, and the card reads "counted from merge · no deploy signal" ([Ploeg ADR-0047](../../apps/ploeg/docs/adrs/0047-ploeg-learns-where-a-merged-change-is-deployed-from-a-generic-deploy-endpoint.md)). Each step adds one visual layer and never replaces the project's art, and the finish advances on its own, so nobody grinds for it.

### Grade: proposed

A **Grade** works like a graded slab: 1 to 10 in half steps, computed as 0.40 reliability + 0.25 durability + 0.20 delivery + 0.15 review.

* **Provisional cap.** While a card is under 180 days live, its grade is capped at 9. A 10 is possible only once it is Proven.
* **Labels.** Black Label is 10 on all four subgrades. Gold Label is an overall 10.
* **Qualifiers** name one honest defect instead of hiding it: `RV` reverted, `HF` hotfixed, `OB` over budget, `RT` retried Run, `MN` manual takeover.
* **Versioned formula.** The formula carries a version, and its inputs are printed on the back, so a grade is an attested fact rather than an opinion. A formula change never silently re-grades old cards.
* **Bounces.** Only defect and unknown bounces count against delivery (see [Gates and bounces](#gates-and-bounces)).

### Condition: Cracks and Mends (proposed)

Wear runs from factory new to battle-scarred. A confirmed defect gives the card a **Crack**. Its fix, a **Mend**, fills the crack with gold seams that stay forever: kintsugi. A mended card looks more distinguished than an untouched one, but its reliability ends slightly lower, so repair is celebrated and shipping bugs still never pays. Code deliberately replaced later retires with honours and loses nothing.

**A Crack is an inquiry, not a verdict.** Automatic bug-to-change tracing (SZZ) is right only about 64 to 73 % of the time per commit, and much less per pull request. A large share of bugs have no causing change at all ([game theory](../research/2026-10-01-run-cards-game-theory.md)). So the owner decided that a Crack happens **only with human confirmation**:

1. When a bug Work Item is fixed, Ploeg proposes the likely causing changes.
2. The fixer names the cause. "Requirement changed" marks the card Evolved and leaves no Crack, and so does "environment".
3. A second person who is not the Steward confirms. The Steward has 5 working days to dispute, and a rotating referee settles disputes.
4. The triager sets severity S1 to S4 (weights 4, 2, 1 and 0.25). At most three cards share a bug, as primary or contributing.
5. Weight is full for 0 to 180 days live, half for 181 to 365, and history only after that.
6. Discovery factor: self-reported 0.5, discovered 1.0, concealed 1.5. Self-reporting is the best move whenever there is a real chance of being found.
7. A Mend by the Steward counts 0.5 and by someone else 0.75. Whoever mends another person's card becomes a co-signer. A Mend is confirmed when the bug closes and nothing cracks again within 30 days.

Reporters, menders and Stewards all get visible credit. A team that feels safe reports more errors, so Cracks per team should *rise* after rollout. That is a good sign, and the team page should say so.

### Level: proposed

XP follows a log curve over days in production, reaching full value at 180 days, scaled by Size × risk (risk 1 to 1.75). Small bonuses come from pull request, CI, review and merge events. Levels need 25·n² XP, so each level takes longer. Accrual pauses while a Crack is unmended. XP is never spent, and nothing is tradeable. A reviewer who leaves a substantive review gets 25 % of the card's XP as an assist and never takes Cracks. A Steward's weekly Size points have diminishing returns (100 %, then 50 %, then 25 %).

## Life in production

Proposed lifecycle: drafted (a Run is live) → opened (pull request) → signed (approved) → merged → deployed → Provisional (0 to 29 days) → Settled (30 to 179 days) → Proven (180 days and more). At any point a card can become Retired (code replaced on purpose), Withdrawn (pulled for product reasons, no Crack) or Emeritus (the Steward left; the card stays).

## Gates and bounces

*Proposed.* A card moves through environments, and rejections knock it back.

* **Gates come from the tracker.** Each project maps tracker statuses to **Gates** (development, test, acceptance, production), plus the deploy endpoint per environment. Gates differ per agency and client, so the mapping is configuration.
* **A Bounce moves backwards.** A **Bounce** is a move from a later Gate back to an earlier one, such as "In test" back to "In progress", with a reason: defect, requirement, misunderstood, environment or unknown.
* **Reasons matter more than counts.** Only defect and unknown Bounces touch the Grade. A requirement change or a misunderstanding points at the process, never at the developer. Before acceptance the same card continues as Evolved; after acceptance a linked sequel card starts.
* **A new front stat** reads, for example, "Test 2 · Acc 1 bounces".
* **The moments shift.** Merging to development becomes a minor moment. Accepted and released become the major ones.
* **Silence and skips.** No answer within 10 working days counts as silent acceptance, as the glossary's Acceptance rule says. A hotfix straight to production gets its own small card, marked as a stage skip.

## Roles, copies and the Steward

*Proposed, except where marked built.* One card has many holders. Everyone involved holds a **copy** marked with their role, and the **Roster** on the card lists them all:

| Copy | Highlights |
| --- | --- |
| Developer (Steward and co-developers) | Plays, rework, time to acceptance |
| Reviewer | Review depth; findings that turned out to matter |
| QA | Defects caught before production, counted only when the developer confirms them |
| PO | Requirement stability: Evolved count, Bounces from unclear criteria |
| Client | Accepted first time, time to accept, days live; shown at team level |
| Agent crew | The credit line on every copy; never a Steward |

**Shared fate.** When the card cracks, every copy cracks. When it is mended, every copy gets the gold seams and names the mender. That makes QA, the PO and the reviewer care about production too, and keeps the Crack on the change instead of on a person.

**The Steward rule (proposed).** The Steward is the developer who carries the Work Item: the tracker assignee at release, handed over explicitly when needed. It falls back to the person who merged, then to the approver, and bot logins never count. The Steward answers for the change while it runs and has first right to mend it. It must be one name, so someone is told when the card cracks. A card without a Steward is an Orphan that anyone on the Roster may adopt within 14 days. Signing asks what was checked (tests read, behaviour run, risk areas), so the human is not made answerable for code they barely touched.

**Built today:** the Steward is whoever merged the latest merged Play, otherwise the last approver. The Roster lists humans with the roles merger and reviewer ([ADR-0046](../../apps/ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md)).

## Packs

*Proposed.* Once per sprint, each person opens a sprint **Pack**: the ceremony that hands them the cards they earned that sprint.

* **The contents are earned.** A Pack holds exactly the cards the person holds a copy of from that sprint. Nothing in it is random except its cosmetics.
* **Random pulls are cosmetic only.** Opening may give a card one cosmetic variant: a foil pattern, alternative art, full art or a gold signature. The draw uses a recorded seed, so it can be replayed and audited.
* **The odds are published** in the product before anyone opens a Pack.
* **No purchase, no re-roll, no trade.** A Pack cannot be bought or opened again for a better pull, and neither it nor a variant can be given away.
* **One Pack per person per sprint.**
* **Pulls never change a Grade, a Rarity or any metric**, and never anything Ploeg authorizes, budgets or merges.

The loot-box rulings in Belgium and the Netherlands concerned packs bought with money ([trading-card design](../research/2026-10-01-run-cards-trading-card-design.md)). A Pack that nobody can buy, with cosmetic pulls and published odds, is built to stay clear of them. An agency should still have its counsel review it.

Vloer implements this proposal against fixtures ([Vloer ADR 0029](../../apps/vloer/docs/adrs/0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md)):

* **Period.** A Pack covers an ISO week by default, and a Team can set its sprint length and start date instead, which answers what a Pack covers for a team that does not work in sprints.
* **Contents.** A Pack holds each card with a moment in its period: minted, merged, released, a finish step crossed, cracked or mended.
* **Opening.** Packs seal when their period ends, open in order and never expire.
* **The pull.** A card is pulled once, in its first Pack, with HMAC-SHA256 over the person, the Work Item and the Pack, and Vloer stores the result.
* **What a pull gives.** The pull picks the foil pattern and may add alternate art, a full-art frame or a gold signature. The earned finish still decides how much of the card the pattern covers.

## Who sees what

The owner decided visibility on 2026-10-01:

* **Binders are private.** A person's **Binder**, their collection of cards, is visible only to them. They may share single cards. There is no manager view of an individual's Binder.
* **Team pages are for the team.** Every aggregate is at team or service level.
* **Clients see team aggregates only:** stewardship, cost and mend status at team level, never a named individual's history.

The [works council and DPIA pack](../reference/run-cards-works-council-pack.md) turns this into a visibility matrix, a data inventory and a sample consent request.

## Guardrails

* **Never rank people.** No leaderboards, no "top Stewards", no per-person totals of level, Cracks, grade, cost or lines in any shared view.
* **Not for appraisal.** A written clause in the product terms and the works council pack says card data is never used in pay or performance reviews.
* **Grades describe changes.** No AI-derived score ever attaches to a person. Under the EU AI Act, AI that evaluates workers' performance is high-risk.
* **Short person link** (proposed default). The Steward's identity is pseudonymised after 12 months (configurable) or when the person leaves. The record of the change stays.
* **No streaks, no "days since last crack", no automatic Cracks, no refunds triggered by Cracks, no skins that hide Cracks.**
* **Trial it like an experiment.** Run it for more than 10 weeks. Judge it by surveys on ownership and care and by team rework and change fail rates, never by card counts. Teams can switch cards off.

## Looks and motion

A **Skin** changes how a card looks and moves, never its numbers or where they sit, so any card reads the same anywhere. A Work Target picks its skin in Ploeg's `cardStyle`. Vloer Native is the only skin built; Holo Rarity, Loot Drop, Arcade Cabinet, Ticker Terminal and Mission Patch are proposed, with per-client themes on top. Proposed ceremony rules scale effects inversely to how often an event happens. They cap full-screen moments at one per 10 minutes and never interrupt typing. Every effect can be skipped, and flashes stay within WCAG limits, with no red flashes ([holo and game feel](../../apps/vloer/docs/research/2026-10-01-run-card-holo-and-game-feel.md)).

## Decisions

| Question | Status | Answer |
| --- | --- | --- |
| Unit | Decided | One card per Work Item; pull requests are Plays; an epic is its own Set Card |
| Cracks | Decided | Only with human confirmation |
| Deploy signal | Decided, built | A generic "commit is live in environment" endpoint; merge as the fallback |
| Card style | Decided, built | On the Work Target; per-client themes on top of skins |
| Visibility | Decided | Binders private; team pages for the team; clients see team aggregates only |
| Rarity | Open | See [Rarity: open](#rarity-open) |
| Steward and roles | Proposed | Role copies with shared fate; the Steward is the developer carrying the Work Item |
| Gates and bounces | Proposed | Tracker-status mapping per project plus the deploy endpoint |
| Packs | Proposed; Vloer side built | Earned, cosmetic-only pulls, published odds, one per person per period (an ISO week, or a Team's sprint) |

No product-level ADR records the guardrails yet; this page states them. The decided parts are recorded in the Ploeg and Vloer ADRs above.

## Research

* [Trading-card design](../research/2026-10-01-run-cards-trading-card-design.md): rarity versus finish, the graded slab, epics as sets.
* [Gamification evidence, ownership and law](../research/2026-10-01-run-cards-gamification-evidence-and-law.md): the guardrails.
* [Game theory and mechanism design](../research/2026-10-01-run-cards-game-theory.md): the rules and the Crack flow.
* [Metrics catalogue](../../apps/ploeg/docs/research/2026-10-01-run-card-metrics-catalogue.md): about 115 candidate numbers with source, cost and gameability.
* [Holo, foil and game feel](../../apps/vloer/docs/research/2026-10-01-run-card-holo-and-game-feel.md): rendering, ceremony, accessibility and performance.
