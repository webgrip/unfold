# Tasks — ci-integration

All tasks are open. Markers: **[owner]** waits on an owner decision,
**[Ploeg]** waits on a ploeg-hq release.

## 1. Decisions

- [ ] 1.1 File an epic and one ticket per slice on the ClickUp board, and add their ids to the proposal
- [ ] 1.2 **[owner]** Accept or amend ADR-0054, ploeg-hq ADR-0189 and ADR-0190
- [ ] 1.3 **[owner]** Answer design.md open questions 1 and 2

## 2. Ploeg (ploeg-hq, lands first)

- [ ] 2.1 **[Ploeg]** ADR-0189: wait for a re-run on a forge without re-run, CI-parked items recover (#408)
- [ ] 2.2 **[Ploeg]** ADR-0190 slice 1: jobs, required checks and cause classes; new close reasons
- [ ] 2.3 **[Ploeg]** ADR-0190 slice 2: the log excerpt in the fix round
- [ ] 2.4 **[Ploeg]** ADR-0190 slice 3: the CI facts read and the three actions
- [ ] 2.5 **[Ploeg]** Release, then a `ploeg`-scoped commit moves Unfold's pin

## 3. Unfold

- [ ] 3.1 Reason copy for every new close reason in `public/core/reasons.js` (ships with 2.2; needs no new route)
- [ ] 3.2 `PloegPort.ci` and the three actions; the demo adapter shows a fixture marked as a demo
- [ ] 3.3 The CI panel on the Work Item page, behind `work.ci-panel`
- [ ] 3.4 Notifications for a CI park and for a red base branch
- [ ] 3.5 `unfold_get_ci`, `unfold_rerun_ci`, `unfold_ignore_check`, `unfold_mark_check_flaky`, and the Agents window
- [ ] 3.6 Tests for every scenario in `specs/ci-integration/spec.md`
