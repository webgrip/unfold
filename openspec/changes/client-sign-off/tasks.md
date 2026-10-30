# Tasks — client-sign-off

Tasks 1.2 to 1.4 are done; the others are open. Markers: **[owner]** waits on
an owner decision (design.md Open Questions), **[Ploeg]** waits on a ploeg-hq release, **[P1]** waits on the
ADR-0017 Tenant and Client slices (VIK-1876, VIK-1877, VIK-1878, VIK-1740),
**[ADR-0008]** waits on Preview Environments.

## 1. Decisions and vocabulary

- [ ] 1.1 File the P2.0 epic and one ticket per slice P2.1 to P2.5 on the Unfold board, and add their `VIK-<id>` to the proposal
- [x] 1.2 **[owner]** Answer open questions 1 to 4 (answered 2026-10-29, design.md Decisions recorded)
- [x] 1.3 Write the system ADR for the Client Sign-off's name, weight, head binding, scope and the Approver (proposed), with its index row, and run `python3 scripts/validate_adr_consistency.py .`
- [x] 1.4 Add Client Sign-off, Sign-off Paths and Approver to `docs/domain/model.yaml` as proposed, extend Client Profile, and run `mise run domain`
- [ ] 1.5 **[owner]** Decide whether an Agency may require a current Client Sign-off before Acceptance (design.md open question 1)

## 2. Ploeg contract (ploeg-hq, lands first)

- [ ] 2.1 **[Ploeg]** Open the ploeg-hq OpenSpec change for required approvals from design.md D1, in Ploeg's words only
- [ ] 2.2 **[Ploeg]** Admission test: a Work Item with a required approval cannot enter a Shift through approve, requeue or a direct Shift open until it is recorded at the current revision
- [ ] 2.3 **[Ploeg]** Release, then a `ploeg`-scoped commit moves Unfold's pin

## 3. P2.1 Client approves Proposed

- [ ] 3.1 **[P1] [Ploeg]** Approve and reject routes for a Client user, checking Tenant and Client before any Ploeg call; 404 outside them
- [ ] 3.2 **[P1] [Ploeg]** Per-Client Approver (the Client by default, or the Agency, or a main contractor or reseller) and the Agency's optional own approval, named to Ploeg as `approver` and `agency` when work is proposed
- [ ] 3.3 **[Ploeg]** Approve on the Client's behalf, recorded as such, in the page and in `unfold_approve_work`
- [ ] 3.4 HTTP tests: another Client's Work Item and a Work Item with no Client answer 404 and call no Ploeg; a replayed approval reports the current state; an old Ploeg hides the control

## 4. P2.2 Client Sign-off core

- [x] 4.1 Sign-off store: Work Item, pull request, head commit, person, time, answer, note, scope, dismissal and withdrawal; the Client column joins at **[P1]**
- [x] 4.2 Head binding from `workItemFacts(id, true)`; refuse a submit whose head is not current
- [x] 4.3 Dismissal on every facts read, never revived by a return to the signed commit
- [x] 4.4 Scope rule: the whole change minus the Client Profile's exclusion globs per repository, with truncated and missing lists, stored with each sign-off
- [x] 4.5 Unit tests for every scenario in the spec's head, dismissal and coverage requirements
- [x] 4.6 Repository file seam (`.unfold/sign-off.yml`, globs only): its exclusions apply unless the Client Profile keeps the path; tested, behind the flag
- [ ] 4.7 **[Ploeg]** Commit status `client-sign-off` through a generic keyed commit status contract in ploeg-hq (its own Ploeg ADR, in Ploeg's words); until then a tested seam that writes nothing
- [ ] 4.8 Later, proposed: change categories (UI, copy, content, prices, email) from globs and labels on the same scope, the judge advising only

## 5. P2.3 Sign-off route and control

- [ ] 5.1 Sign-off route with object authorization and a confirmation of the text agreed to; `admin` and `operator` only until **[P1]** adds Client users
- [ ] 5.2 Sign-off control on the Work Item page for Client users, and the Agency reviewer's view of the current sign-off, with workbench stories for every state
- [x] 5.3 Flags `client.sign-off` and `client.sign-off-comment` in `src/flag-registry.json` (permission, default off, per Team)
- [x] 5.4 Comment writer on Ploeg's keyed comment as key `client-sign-off`, following `agent-trace-comments.ts`; tests for unchanged text, restart and a failed write
- [x] 5.5 Contract entry for the new routes in `apps/unfold/docs/contracts/`

## 6. P2.4 Client view

- [ ] 6.1 **[P1]** Client view projection from an allow-list: no Token Charge, Delivery Fee, US dollar spend, models, transcripts or named Agency people
- [ ] 6.2 English copy, Agency brand first, Agency override per Tenant; translations and a default language per Client in the Client Profile later
- [ ] 6.3 Page, workbench stories and a browser test that a Client user sees only its own Work Items

## 7. P2.5 Signed preview link

- [ ] 7.1 **[ADR-0008]** Signed link per Tenant, Client and preview, expiring with the preview
- [ ] 7.2 **[ADR-0008]** Tests for an ended preview and a tampered link

## 8. Gates

- [ ] 8.1 `mise run verify` and `mise run docs-check` from the repository root, output pasted in each pull request
