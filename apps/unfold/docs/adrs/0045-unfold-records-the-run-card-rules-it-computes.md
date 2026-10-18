---
status: accepted
date: 2026-10-14
decision-makers: Ryan Grippeling
review-by: 2027-01-14
---

# Unfold records the Run card rules it computes

## Context and Problem Statement

Six Ploeg ADRs held the rules of a Run card:

* [Ploeg ADR-0046](../../../ploeg/docs/adrs/0046-a-run-card-is-assembled-per-work-item-from-stored-facts.md): one card per Work Item, its pull requests as Plays;
* [Ploeg ADR-0050](../../../ploeg/docs/adrs/0050-a-run-cards-grade-is-a-versioned-formula-over-stored-facts.md): the grade formula;
* [Ploeg ADR-0052](../../../ploeg/docs/adrs/0052-a-crack-needs-the-fixer-and-a-second-person-and-ploeg-only-proposes-candidates.md): cracks, mends and the grade's reliability;
* [Ploeg ADR-0055](../../../ploeg/docs/adrs/0055-ploeg-keeps-one-card-comment-with-a-static-card-image-on-the-pull-request.md): the card comment on the pull request;
* [Ploeg ADR-0056](../../../ploeg/docs/adrs/0056-a-run-cards-rarity-is-its-challenge-predicted-at-mint-and-frozen-at-release.md): rarity;
* [Ploeg ADR-0061](../../../ploeg/docs/adrs/0061-a-run-cards-grade-penalizes-rework-not-review-and-says-which-inputs-it-missed.md): grade formula 2026.3.

[System ADR-0030](../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md) moved every card concept into Unfold, on top of the delivery facts Ploeg supplies ([Ploeg ADR-0079](../../../ploeg/docs/adrs/0079-run-cards-belong-to-the-consumer-and-ploeg-supplies-delivery-facts.md)). [Ploeg ADR-0080](../../../ploeg/docs/adrs/0080-ploeg-keeps-no-run-card-code-and-removes-it-in-one-release.md) then rejected the six ADRs, because Ploeg no longer keeps card code. System ADR-0030 records who owns the rules, not what they are. The rules were ported to TypeScript with identical behaviour and now live only in code (`apps/unfold/src/cards/`).

Where is the live decision record of how a card is assembled, graded, tiered, cracked, mended and collected?

## Decision Drivers

* A rule that changes a grade or a tier needs a decision record a reviewer can hold the code against.
* The rules are already built and match Ploeg's last release field for field; recording them must not change them.
* Unfold's ADR ledger is where Unfold's decisions live; the system and Ploeg ledgers point here.

## Considered Options

* A new Unfold ADR that records the rules as built in `apps/unfold/src/cards/`
* Re-accept the rejected Ploeg ADRs
* Leave the rules in code and in the [Run Cards](../../../../docs/concepts/run-cards.md) concept page

## Decision Outcome

Chosen option: "A new Unfold ADR that records the rules as built in `apps/unfold/src/cards/`", because the rules are Unfold's (system ADR-0030), Ploeg's ledger must not describe code Ploeg no longer has, and a concept page explains but does not decide. The owner accepted it on 2026-10-14.

The rules below are the ones the code applies. A change to any of them needs a new formula version where one exists, and an amendment or a new ADR.

### Assembly

[`assemble.ts`](../../src/cards/assemble.ts) `assembleCard` builds one card per Work Item from Ploeg's delivery facts and Unfold's card store, each time it is read.

* **Plays.** The Work Item's pull requests, ordered by number, at most 50.
* **State.** `withdrawn` when the Work Item is withdrawn, `drafting` without a Play, `in_review` while a Play is open, `merged` when the last Play merged or one merged and the Work Item is done, `closed` otherwise (`cardState`).
* **Release.** The first deploy of the latest merged Play to the release environment: `cards.rules.repositories.<repo>.releaseEnvironment`, default `production`. When the repository never reported that environment, the release counts from the merge. When it did report it and no deploy carried the change, the card has no release (`releaseOf`).
* **Steward.** The human who merged the latest merged Play. Without one, the human who approved last. Forge bot logins (`cards.rules.bots` and the facts' bot logins) never count.
* **Roster.** Every human merger and reviewer. The person who moved the Work Item out of the test gate is `qa`, and out of acceptance is `acceptor`. Whoever mended a crack on someone else's card is `cosigner`.

### Grade

[`grade.ts`](../../src/cards/grade.ts) `computeGrade` grades the change from 1 to 10 in half steps (ties round up). Every read uses formula **2026.3** (`currentGradeFormula`). Formulas 2026.1 and 2026.2 are kept and computable, but no card is graded under them.

* **When.** No grade until a human approved or requested changes on a Play, or a Play merged.
* **Weights.** Reliability 40 %, durability 25 %, delivery 20 %, review 15 %.
* **Reliability.** 10 minus the summed weight of the card's counting cracks. A revert counts as at least weight 2. A card with a crack in warranty (full or half) or a revert has reliability at most 9.5.
* **Durability.** `6 + 4·√(min(1, daysLive/180))`, minus 2 per revert and 1 per hotfix. A hotfix is a merged fix of a counting crack's bug that carries one of the Team's `hotfixLabels` (default `hotfix`).
* **Delivery.** 10, minus 1 when spend is over the authorized budget by up to a quarter and 2 beyond that, 1.5 per defect or unknown bounce, 1 per Play after the first, and 0.5 per failed or stuck Run.
* **Review.** 10 minus 1 per rework round. A rework round is a distinct (Play, head commit) on which a human requested changes. Approvals and comments lower nothing.
* **Missing inputs.** When the budget share or the bounces are unknown (no cost reported, or the board maps no gates), the input is listed under `missing` and its subgrade is capped at 9. `evidenceComplete` says whether nothing was missing.
* **Provisional.** Until the card has been live 180 days, `provisional` is true and the overall grade is capped at 9.
* **Labels.** A card that is not provisional and misses no input is `black` when all four subgrades are 10, and `gold` when the overall grade is 10.
* **Qualifiers.** `RV` reverted, `HF` hotfixed, `OB` over budget, `RT` a failed Run.

### Gates and bounces

[`gate.ts`](../../src/cards/gate.ts) `walk` reads the gate moves in Ploeg's facts: development, test, acceptance and done, in that order. Ploeg records each move and its bounce reason.

* A move back to an earlier gate is a **bounce**, with a reason: `defect`, `requirement`, `misunderstood`, `environment` or `unknown` (no reason recorded).
* Only `defect` and `unknown` bounces count against delivery and against right first time.
* A `requirement` bounce out of acceptance or done marks the card **evolved**.
* A board's `cards.rules.boards.<provider:scope>.gates` maps tracker statuses to gates. Unfold uses it only to place a status move that Ploeg sent without a gate in the flow figures.

### Cracks and mends

[`cracks.ts`](../../src/cards/cracks.ts) `CrackWorkflow` runs every step in one store transaction and writes an audit row.

* **Candidates.** Unfold lists earlier merged Plays of the bug's Team that touched a file the bug's fix touched, within a year before the bug was raised. It ranks them by shared files, then newest first ([`service.ts`](../../src/cards/service.ts) `crackCandidates`). It never turns a candidate into a crack.
* **Propose.** The fixer names the card and the Play. The Play must have merged before the bug Work Item was created. The fixer sets severity S1 to S4 and a share, primary or contributing. Discovery is `self` when the proposer is the steward, `concealed` only when the steward merged the bug's fix, and `discovered` otherwise. A reverted card's crack is at least S2. A bug cracks at most three cards, and a card once per bug.
* **Confirm.** A second person, neither the steward nor the proposer, confirms the crack and may correct its severity and share.
* **Dispute.** The steward may dispute a confirmed crack within five working days (Monday to Friday, UTC). The crack keeps counting while disputed.
* **Resolve.** A referee decides a disputed crack: `upheld` confirms it again, `unlinked` takes it off the card. The referee took no part in the crack, and must be on the Team's `referees` list when the Team names one. The decision is final.
* **Evolved.** Someone other than the steward may record that the requirement changed. A proposed attribution becomes `evolved`, and the card is marked evolved without a crack.
* **Weight.** severity (S1 4, S2 2, S3 1, S4 0.25) × share (primary split evenly over the bug's counting primary cracks, contributing 0.25) × discovery (self 0.5, discovered 1, concealed 1.5) × warranty × mend. Warranty is 1 when the bug was created within 180 days of the card's release, 0.5 within 365, and 0 after that. A confirmed mend is 0.5 when it was the steward's and 0.75 otherwise.
* **Mend.** When the bug's pull request merges, every counting crack of that bug records the mend. A sweep confirms a mend once it has stood 30 days, the bug Work Item is done and the crack still counts. It reopens the mend when another crack on the card, proposed within those 30 days, was confirmed or disputed. A mended card stays below a card that never cracked.

### Rarity

[`rarity.ts`](../../src/cards/rarity.ts) scores challenge under formula **2026.1**: `100 × (0.30 reach + 0.25 sensitive + 0.20 novelty + 0.25 size)`, to one decimal.

* **Reach.** Modules touched, plus 3 per repository beyond the first, saturating at 12.
* **Sensitive.** Files on sensitive paths, saturating at 8. The paths come from `cards.rules.repositories.<repo>.rarity`: `sensitivePaths` (default migrations, SQL, schemas, protobuf, OpenAPI, Dockerfile, Helm and CI workflows) plus `attentionPaths`.
* **Novelty.** The share of touched files that no other merged change touched in the 180 days before.
* **Size.** Counted lines, saturating at 2000. Lockfiles, generated and vendored files (`sizeExclude`) don't count.
* **Predicted and revealed.** A card is predicted once a Run started, and a predicted score adds 10 when the card is in a set. At release the score is revealed, tiered and frozen once in Unfold's store ([`assemble.ts`](../../src/cards/assemble.ts) `rarity`, `rarityRecord`). A frozen tier never changes.
* **Tiers.** Each cohort is one repository and one UTC quarter. Below 30 cards, fixed thresholds apply: legendary 85, epic 70, rare 55, uncommon 35. From 30 cards, percentiles apply: above 99, 95, 85 and 60.
* **Set.** An epic's card whose set is complete shows as legendary.
* **Switch.** Rarity is off by default (owner decision 2026-10-17, see the update below). `cards.rules.rarity: true` shows it to everyone. `cards.rules.rarity: false` turns it off, and Unfold neither computes nor freezes it. Left unset, Unfold computes and freezes rarity, and the `cards.rarity` feature flag, off by default, decides per person whether a card shows it ([`settings.ts`](../../src/cards/settings.ts) `rarityShown`, [`ploeg.ts`](../../src/ploeg.ts) `useRarity`).

Rarity is cosmetic: no grade, pull or Ploeg decision reads it.

### Sets

[`assemble.ts`](../../src/cards/assemble.ts) `set` builds an epic's set from the tracker parents in Ploeg's facts.

* A Work Item is a member when its parent link was first seen no later than its first Shift.
* Members are ordered by first Shift (members without a Shift last), at most 100.
* A set is complete when every member is merged, has been live 30 days, and carries no counting crack without a confirmed mend.

### Collection

[`packs.ts`](../../src/packs.ts) and [`collection.ts`](../../src/collection.ts) implement [Unfold ADR 0029](0029-binders-packs-and-pulls-collect-run-cards-privately-and-fairly.md).

* A person holds a copy of every card whose roster names one of their logins, or whose steward is a login the administrator mapped to them.
* A binder is read only by its owner.
* A pack covers the Team's sprint (`cards.teams.<team>`) or an ISO week. It holds every card with a moment in that period, and opens once the period ends.
* A pull is HMAC-SHA256 over person, Work Item and pack, drawn from published odds version 2026.1. No grade, rarity or finish changes a pull's odds.

### Style and comment

* **Style.** `cards.rules.repositories.<repo>.style` names a skin and an optional theme, and replaces Ploeg's `cardStyle`. The default skin is `default`, which the browser draws as Unfold Native ([Unfold ADR 0026](0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md)).
* **Comment.** When an operator turns on `cards.publishPullRequestComment` and a Team turns on `pullRequestComment`, Unfold keeps one `run-card` comment on the latest merged Play through Ploeg's keyed comment. It holds a static card image and a summary table. Unfold edits it at a merge, a release, a new finish or a mend ([`service.ts`](../../src/cards/service.ts) `publishComment`). That image shows no rarity and no flow figures.

### Consequences

* Good, because every rule that moves a grade or a tier has a live record in the ledger of the application that runs it.
* Good, because the rejected Ploeg ADRs stay history, and readers are sent here.
* Bad, because this record repeats constants that the code also holds; a change must update both.
* Neutral, because flow, pull request, CI and change figures stay in [Ploeg ADR-0057](../../../ploeg/docs/adrs/0057-a-run-cards-flow-figures-come-from-every-recorded-tracker-status-and-a-team-calendar.md) and [ADR-0058](../../../ploeg/docs/adrs/0058-a-run-cards-pull-request-ci-and-change-shape-figures-are-read-from-the-forge-and-kept-per-play.md), both proposed. This ADR does not take them over.

### Confirmation

* [`test/cards-grade.test.ts`](../../test/cards-grade.test.ts), [`test/cards-rarity.test.ts`](../../test/cards-rarity.test.ts), [`test/cards-gate.test.ts`](../../test/cards-gate.test.ts), [`test/cards-cracks.test.ts`](../../test/cards-cracks.test.ts), [`test/cards-assembly.test.ts`](../../test/cards-assembly.test.ts) and [`test/cards-service.test.ts`](../../test/cards-service.test.ts) pin the constants above. Ploeg's Go tests serve as golden fixtures.
* The replay of Ploeg's assembled cards (`apps/unfold/scripts/card-golden`) must match Unfold's assembly field for field.
* A pull request that changes a weight, penalty, cap, threshold or rounding rule adds a formula version and amends this ADR.

## More Information

* Carries over the rules of Ploeg ADR-0046, 0050, 0052, 0055, 0056 and 0061, as ported under system ADR-0030. Where those ADRs differ from the code, this ADR follows the code.
* Differences from the Ploeg ADRs:
  * Ploeg ADR-0050 said a later formula is computed only for cards read after it ships. Unfold grades every card under the current formula when it is read.
  * Ploeg ADR-0052 had Ploeg propose crack candidates. Unfold now proposes them.
* 2026-10-14: accepted by the owner, and recorded from `apps/unfold/src/cards/` on `development`. It left one question open: the concept page and the glossary said rarity is off unless `cards.rules.rarity` turns it on, while `resolveCardRules` turned it on unless the setting was `false`.

## Update 2026-10-17: rarity is off by default, behind a feature flag

The owner decided on 2026-10-17 that Run card rarity is off by default and behind a feature flag. That answers the open question above. How a card's rarity is shown now:

| `cards.rules.rarity` | `cards.rarity` flag | Computed and frozen | Shown |
| --- | --- | --- | --- |
| unset (the default) | off (the default) | yes | no |
| unset | on for a person | yes | to that person |
| `true` | any | yes | to everyone |
| `false` | any | no | to nobody |

* **Configuration decides when it is set; otherwise the flag decides.** A deployment that wrote `true` or `false` keeps the behaviour it chose. A deployment that wrote nothing, such as the homelab, stops showing rarity until someone turns the flag on. The flag is a release flag in [`flag-registry.json`](../../src/flag-registry.json), offered in Labs and to be removed by 2027-01-17. An administrator can roll it out, override it or let people opt in ([ADR 0043](0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md)).
* **Hidden is not deleted.** While rarity is hidden, Unfold still predicts it and freezes the revealed tier at release, as before. Every card a person reads (the card route, the binder, packs and Team pages) has `rarity: null` until the flag is on for them. Turning the flag on shows the tiers frozen while it was off. A tier frozen before this change stays in the store.
* **Evaluated on the server.** `PloegClient` drops the rarity before a card leaves the server, so a person whose flag is off never receives it. The pull request comment already showed no rarity.
* **Confirmation.** [`test/cards-service.test.ts`](../../test/cards-service.test.ts) pins the four rows above against the card route and the store. The `rarity` browser flow checks the demo hides rarity by default, shows every tier once the flag is turned on under Labs, and hides it again on Default.
