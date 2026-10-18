# Tasks — add-review-walkthrough

## 1. Decisions

- [x] 1.1 Application ADR 0054 (proposed) with its index row
- [x] 1.2 Domain term Walkthrough, glossary regenerated
- [ ] 1.3 The owner accepts or rejects Ploeg ADR-0125 (ploeg-hq #185) and ADR 0054 (VIK-2226)

## 2. Ploeg (ploeg-hq, lands first)

- [ ] 2.1 Walkthrough contract, worker checks, storage and operator API (VIK-2228)
- [ ] 2.2 The reviewing Run checks each screenshot (VIK-2229)
- [ ] 2.3 Release, then a `ploeg`-scoped commit moves Unfold's pin

## 3. Unfold application

- [ ] 3.1 Parse `walkthrough` from Ploeg Runs; a Ploeg without it still parses (VIK-2230)
- [ ] 3.2 Image route with permission and Run-ownership checks (VIK-2230)
- [ ] 3.3 Tick store and routes (VIK-2230)
- [ ] 3.4 "What it looks like" and "Try it yourself" with workbench stories for every state (VIK-2230)
- [ ] 3.5 Approve nudge in the page and in `unfold_approve_work` (VIK-2231)
- [ ] 3.6 Browser test: tick, reload, approve through the nudge

## 4. Agents and deployment

- [ ] 4.1 Headless browser in the workspace image and a capture skill (VIK-2232)
- [ ] 4.2 homelab-cluster PR: `walkthrough.enabled` for bronze after the release (owner merges)

## 5. Gates

- [ ] 5.1 `mise run verify` and `mise run docs-check`, output in the pull request
