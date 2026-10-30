# Design — client-sign-off

Everything here is proposed. The owner answered the open questions on
2026-10-29; D3, D5, D9 and D10 record those answers, and
[Decisions recorded](#decisions-recorded-2026-10-29) lists them. Only P2.2's
core (task group 4) is being built, behind a flag that is off by default.

## Context

- [ADR-0007](../../../docs/adr/adr-0007-clients-approve-ready-work.md) decides
  that a Client approves its Work Item and price before a Shift, that the
  Agency may approve on its behalf or require its own approval too, and that
  Unfold never contacts a Client. Its Confirmation is a Ploeg admission test
  that does not exist.
- [ADR-0017](../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)
  defines the client membership and says a Client user reaches only its
  Client's Work Items. Its P1 slices (VIK-1876, VIK-1877, VIK-1878, VIK-1740)
  are in progress; this change builds on them.
- Ploeg ADR-0031 already holds Run-created Work Items as `proposed` and offers
  `POST work-items/{id}/approve` and `/reject`. One approval queues the item.
  There is no notion of *which* approval, and nothing stops an Operator
  Consumer from queuing work a Client never saw.
- Ploeg ADR-0079 gives consumers a keyed pull request comment
  (`PloegClient.putPullRequestComment` in `apps/unfold/src/ploeg.ts`), and
  per-Work-Item delivery facts with `pullRequests[].headSha` and
  `changedPaths { headSha, truncated, paths }`
  (`apps/unfold/src/cards/facts.ts`).
- `apps/unfold/src/agent-trace-comments.ts` is the template for a comment
  Unfold keeps on a pull request: flag per Team, fresh facts, newest open pull
  request, digest to skip unchanged text.
- The domain model forbids "client acceptance" and keeps one Review per Work
  Item (R22). Verdict is Ploeg's word for a reviewing Run's answer.

## Goals / Non-Goals

Goals: a Client approves its own proposed work and Ploeg enforces it; a
Client's answer on the pull request that cannot outlive the change it judged
or claim paths it may not judge; a client view and preview link that keep the
Agency between Unfold and its Client.

Non-goals: see the proposal. In short, no client acceptance, no forge account
for Clients, no Quotes, no previews, no Tenant scoping of its own.

## Decisions

### D1. The Ploeg half is a generic required-approvals contract

ADR-0007's Confirmation needs Ploeg to refuse the Shift, because Ploeg is the
Authority (ADR-0002) and Unfold's checks are only the first line (ADR-0017).
Ploeg never knows its consumer, so the contract is about named approvals, not
Clients. This is the brief for the ploeg-hq change, written in Ploeg's words:

> **Required approvals on a proposed Work Item (proposed).**
> An Operator Consumer that admits or creates a proposed Work Item may name
> the approvals it requires: a list of one to four approval names, each 1 to
> 32 lowercase identifier characters, chosen by the consumer. Ploeg stores the
> names on the Work Item and does not interpret them.
> `POST /api/v1/operator/work-items/{id}/approve` takes an optional
> `approval` name and a `commandId`; it records that approval with its actor,
> acting user, attribution and the Work Item's current revision, and audits
> `work_item.approval_recorded`. A replayed `commandId` returns the first
> result. The Work Item is queued only when every required approval is
> recorded against its current revision. A new revision of the Work Item
> clears recorded approvals and audits `work_item.approvals_cleared`.
> Admission refuses to open a Shift for a Work Item with a missing required
> approval, answering `409 approval_required` with the missing names, and
> reserves nothing. A Work Item without required approvals behaves as today.
> Confirmation: an admission test that a Work Item with a required approval
> cannot enter a Shift, through approve, requeue or a direct Shift open,
> until that approval is recorded at the current revision.

Unfold names `approver` for the approval of the Client's Approver (D9), and
`agency` when the Agency requires its own as well. These names live only in
Unfold's configuration; Ploeg never learns what an Approver or a Client is.

Alternative: enforce in Unfold alone. Rejected, because any other consumer or
a requeue could start the Shift, and ADR-0007's Confirmation names Ploeg.

### D2. Client approval rides on Ploeg's approval, not a store of its own

Unfold keeps no approval state of its own; it reads the recorded approvals
from Work Item detail. One source of truth avoids the two-places problem R22
names for Review.

### D3. Client Sign-off is the name, and it is input to Acceptance

Decided by the owner on 2026-10-29. The term is **Client Sign-off**, with the
answers "looks good" and "needs changes". "Verdict" already means a reviewing
Run's answer and "approval" means D1's Work Item approval, so neither is used
for it. Its weight is unchanged: a Client Sign-off is input to the Agency's
Acceptance, never Acceptance itself (R11, R22). The pull request comment key is
`client-sign-off`.

Proposed, not decided: a per-Agency option to require a current Client
Sign-off before Acceptance. It would change the Acceptance definition, which
counts a merge and ten working days of silence, so it needs its own decision.
The commit status in D5 is how it would be enforced.

### D4. Head binding and dismissal from delivery facts

Unfold stores each sign-off with `changedPaths.headSha` read fresh
(`workItemFacts(id, true)`). The submit names the head the person saw, so a
push between reading and clicking is refused rather than silently signed.
Dismissal is computed on every facts read: a stored sign-off whose head is not
the current head becomes dismissed and stays so, which handles a force-push
back to the signed commit. This mirrors a forge's "dismiss stale approvals".

Alternative: dismiss on a forge webhook. Rejected: Unfold has no forge
webhook of its own, and the facts are the record Unfold already trusts.

### D5. Sign-off Paths: the whole change minus the Agency's exclusions

Decided by the owner on 2026-10-29: options 1, 2 and 5 below, with the best
part of 3 and of 4.

1. **Default: the whole change.** With no setup, a Client Sign-off covers
   every path the pull request changes at its head (`changedPaths`).
2. **Agency exclusions.** The Agency sets exclusion globs per Client and
   repository in the Client Profile, such as `infra/**` or `.forgejo/**`.
   Excluded paths are listed as not covered.
3. **A repository file may propose exclusions.** A file such as
   `.unfold/sign-off.yml` holds exclusion globs that are versioned with the
   code. The Client Profile wins on a conflict: a path the Client Profile
   keeps is covered even when the file excludes it. The file holds globs only,
   never a Client's name or identity.
4. **Enforcement is optional.** A commit status `client-sign-off` that the
   Agency may make required in its branch protection. It needs a generic Ploeg
   keyed commit status contract and waits on that Ploeg ADR.
5. **Later: change categories.** Categories such as UI, copy, content, prices
   and email, computed from globs and labels on top of the same scope. A
   judge may only advise on them. Proposed and future.

Coverage is reported, never assumed: a truncated or missing path list never
yields "whole change". The scope is a rule over the changed paths, so a later
part adds to the rule and needs no store migration: a stored Sign-off keeps
the scope it was given.

The five options the owner chose from, with the boundary each one draws.
Ploeg knows no Client, Agency or Sign-off; it offers only generic contracts.

| Option | What it is | Where it lives | Ploeg's part |
|---|---|---|---|
| 1 | The whole pull request diff, no setup | Unfold, from delivery facts | None beyond today's `changedPaths` |
| 2 | Agency exclusion globs per Client and repository | Unfold's Client Profile | None |
| 3 | A repository file such as `.unfold/sign-off.yml`, or Client handles in `CODEOWNERS` | The Agency's repository, read by Unfold | A generic read of a file at the head, if Unfold cannot read it otherwise. Client handles in `CODEOWNERS` were rejected: they put Client identities in the repository |
| 4 | Change categories from path globs and labels, the judge only advising | Unfold | None |
| 5 | A commit status `client-sign-off` the Agency may make required | The forge, written through Ploeg | A generic keyed commit status contract, a sibling of ADR-0079's keyed pull request comments, written in Ploeg's words only |

The recommendation was 1 + 2 + 5; the owner added the repository file from 3
and the categories from 4 as optional and later parts.

### D6. The comment follows the Agent Trace comment

A `ClientSignOffComments` class with the same source interface as
`AgentTraceComments` (`factsSupported`, `workItemFacts`,
`putPullRequestComment`), the flag `client.sign-off-comment` evaluated per Team
(`kind: permission`, default off, `client: false`), a digest to skip unchanged
text, and no timer loop. It writes on a sign-off, on a dismissal and after a
restart when the stored text differs. It names the Client, not the person,
because the pull request is visible to everyone with forge access and R18
keeps named people out of Client-facing views in both directions.

### D7. The client view is a projection, not a filter

The client view is built from an allow-list, like the Work Item Brief
(ADR-0031), not by hiding fields from the Agency's page. The Brief carries
spend in US dollars, which the client view must not show, so the client view
uses its own projection and takes the Agency's price only from a Quote.

### D8. The preview link is signed by Unfold and served by Unfold

An HMAC over Tenant, Client, preview id and expiry, with a per-Tenant key.
Expiry is the earlier of the preview's deletion and its idle limit. Unfold
never sends the link; the Agency copies it from its own page or the Client
finds it in the client view. Whether the link alone is enough or the Client
must also be signed in is part of P2.5's design once previews exist.

## Restart, retry and cancel

- An approval is the only action here that leads to spend. Its retry is safe
  through D1's `commandId`; Unfold reports the current state on a replay.
- A Client cannot cancel, steer or requeue. Rejecting a proposed Work Item
  closes it in Ploeg as today and releases its allotted budget.
- A sign-off changes no Run or Work Item state. A restart re-derives
  dismissals and comment text from the store and fresh facts, and the keyed
  comment makes a repeated write harmless.

## Risks / Trade-offs

- [A Client reads "looks good" as accepted] → The control, the client view
  and the comment all say that the Agency decides.
- [Exclusion globs drift from the repository layout] → Every Sign-off
  lists the paths it left out, so a stale glob shows up as an unexpected
  list for the Agency to fix.
- [Client-written notes are untrusted input] → A note is shown, never put in
  a prompt, until a decision says otherwise (ADR-0007's injection concern).
- [Facts lag a push] → Submit names the head, so a lag can refuse a sign-off
  but never bind one to the wrong commit.
- [The forge comment leaks Client identity to forge readers] → It names the
  Client only; an Agency that does not want that keeps the flag off.

## Migration Plan

Nothing to migrate. Each slice ships behind its own flag, default off, and
P2.1 stays off until the pinned Ploeg carries D1. Rollback is turning the
flag off; stored sign-offs stay.

### D9. Each Client has an Approver

Decided by the owner on 2026-10-29. The **Approver** (proposed term) is the
party that approves a Client's proposed Work Items. By default it is the
Client. An Agency may set it, per Client, to itself or to the party that sits
in front of the work and pays for it, such as a main contractor or a reseller.
The Approver's approval is the one Unfold names to Ploeg as `approver` (D1);
the Agency's own additional approval stays optional (ADR-0007). An approval
recorded by someone other than the Approver is recorded on its behalf, as
ADR-0007 already allows for the Agency.

Proposed idea for the owner's pricing design, not a decision: the party that
approves a Quote could be the bill-to party of that Work Item. The owner is
still designing pricing, so nothing here builds anything about money.

### D10. Client-view copy is English first

Decided by the owner on 2026-10-29. The client view's copy is English for
now; translations come later. Once they exist, the Client Profile sets each
Client's default language. The Agency's brand shows first, and the Agency
may override the copy.

### D11. Only Agency people record a Sign-off until Client memberships exist

Until ADR-0017's Client memberships and `tenancy.enforce` are in place, the
P2.2 core lets only an `admin` or `operator` record or withdraw a Client
Sign-off, on the Client's behalf. The route checks the person's role in one
place, which is the seam a Client user's check replaces. P2.2 does not scope by
Tenant or Client itself.

## Decisions recorded 2026-10-29

The owner answered the four open questions. System
[ADR-0049](../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md)
(proposed) records answers 1, 2 and 4.

1. **Name and weight.** Client Sign-off; input to the Agency's Acceptance,
   never Acceptance (D3). A per-Agency option to require it is proposed.
2. **Sign-off Paths.** The whole change minus the Agency's exclusion globs in
   the Client Profile, an optional repository file whose exclusions the
   Client Profile overrides, an optional commit status waiting on a Ploeg
   contract, and change categories later (D5).
3. **Client-view copy.** English for now, translations later with a default
   language per Client, Agency brand first, Agency may override (D10).
4. **Who approves.** An Approver per Client, the Client by default (D9).

## Open Questions

1. **Requiring a Sign-off before Acceptance.** Proposed per-Agency option
   (D3); it changes the Acceptance definition and needs its own decision.
2. **The commit status contract.** Its shape is for ploeg-hq to decide in
   its own ADR (D5 part 4).
3. **Change categories.** Which categories, from which globs and labels, and
   how the judge's advice shows (D5 part 5).
4. **The Approver and the Quote.** Whether the Approver is the bill-to party
   is part of the owner's pricing design (D9).
