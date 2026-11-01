# Tasks — accept-and-merge

All tasks are open. Markers: **[owner]** waits on an owner decision,
**[Ploeg]** waits on a ploeg-hq release, **[homelab]** is a
`webgrip/homelab-cluster` pull request the owner merges.

## 1. Decisions

- [ ] 1.1 File an epic and one ticket per slice below on the ClickUp board, and add their ids to the proposal
- [ ] 1.2 **[owner]** Accept or amend ADR-0053 and ploeg-hq ADR-0188
- [ ] 1.3 **[owner]** Decide automatic acceptance (design.md open question 1)

## 2. S1 — Ploeg merges on Forgejo (ploeg-hq, lands first)

- [ ] 2.1 **[Ploeg]** Merge contract on the operator API and ploeg-mcp, merge permission, forge port capability and Forgejo adapter, as ploeg-hq ADR-0188 says
- [ ] 2.2 **[Ploeg]** Release, then a `ploeg`-scoped commit moves Unfold's pin

## 3. S2 — Accept and merge in Unfold

- [ ] 3.1 Acceptance store keyed on Work Item and head commit, with person, channel, confirmation, time, merge state and refusal reason
- [ ] 3.2 `POST /api/ploeg/work-items/:id/accept` with the head, checked in `auth.ts` like approve, recorded in `action-records.ts`; 409 on a stale head and 403 without permission, both before any Ploeg call
- [ ] 3.3 `DELETE /api/ploeg/work-items/:id/accept` cancels a Merging request through Ploeg
- [ ] 3.4 `PloegPort` gains the merge and cancel calls; the demo adapter answers from fixtures and never pretends a merge
- [ ] 3.5 Work Item page and Now: Accept and merge with the confirmation of design.md D6, the Merging state, Cancel merge and each refusal reason
- [ ] 3.6 A forge merge completes or creates the Acceptance (design.md D8); billing reads the store
- [ ] 3.7 Flag `work.accept-merge`, off by default
- [ ] 3.8 Tests for every scenario in `specs/accept-and-merge/spec.md`
- [ ] 3.9 Security controls of design.md D10: sign-in age, notifications on every merge request, merge and refusal, no action for an Ask, a Run or an agent session; tests for each

## 4. S3 — homelab

- [ ] 4.1 **[homelab]** A Forgejo merge identity for `webgrip/unfold` with write and no admin rights, its token in OpenBao, ploegd's merge credential from an ExternalSecret, and `development`'s branch protection allowing merges only to that identity and people, so the agents' identity cannot merge
- [ ] 4.2 **[homelab]** Unfold's Operator Consumer gets the merge permission for its Teams; turn the flag on for the owner

## 5. S4 — other channels

- [ ] 5.1 `unfold_accept_work` in the MCP server with the confirmation of ADR-0037
- [ ] 5.2 Accept and merge in the Agents window

## 6. Docs, when S2 ships

- [ ] 6.1 Amend "Unfold never merges" in `docs/concepts/who-unfold-is-for.md`, `docs/concepts/users-and-journeys.md`, `apps/unfold/docs/product/at-a-glance.md` and `apps/unfold/docs/operations/working-from-clickup.md`
- [ ] 6.2 The board section of `docs/contributing/way-of-working.md`: accept in Unfold moves the card to Done
