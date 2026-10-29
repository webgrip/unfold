# Design — client-sign-off

Everything here is proposed. No code implements it.

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

Unfold names `client`, and `agency` when the Agency requires its own. These
names live only in Unfold's configuration.

Alternative: enforce in Unfold alone. Rejected, because any other consumer or
a requeue could start the Shift, and ADR-0007's Confirmation names Ploeg.

### D2. Client approval rides on Ploeg's approval, not a store of its own

Unfold keeps no approval state of its own; it reads the recorded approvals
from Work Item detail. One source of truth avoids the two-places problem R22
names for Review.

### D3. Client Sign-off is a new term, not a Verdict

"Verdict" already means a reviewing Run's answer, and "approval" now means
D1's Work Item approval. The working name is **Client Sign-off** (proposed),
with answers "looks good" and "needs changes". The comment key stays
`client-verdict` as the brief named it; it is renamed with the term if the
owner picks another (open question 1).

### D4. Head binding and dismissal from delivery facts

Unfold stores each sign-off with `changedPaths.headSha` read fresh
(`workItemFacts(id, true)`). The submit names the head the person saw, so a
push between reading and clicking is refused rather than silently signed.
Dismissal is computed on every facts read: a stored sign-off whose head is not
the current head becomes dismissed and stays so, which handles a force-push
back to the signed commit. This mirrors a forge's "dismiss stale approvals".

Alternative: dismiss on a forge webhook. Rejected: Unfold has no forge
webhook of its own, and the facts are the record Unfold already trusts.

### D5. Sign-off Paths live in the Client Profile

The Client Profile already holds the Client's Definitions of Ready and Done.
Sign-off Paths are globs per repository, matched with the same glob rules as
`.unfold/attention` Attention Paths. Coverage is reported, never assumed: a
truncated or missing path list never yields "whole change". Who writes the
globs is open question 2.

### D6. The comment follows the Agent Trace comment

A `ClientSignOffComments` class with the same source interface as
`AgentTraceComments` (`factsSupported`, `workItemFacts`,
`putPullRequestComment`), the flag `client.verdict-comment` evaluated per Team
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
- [Sign-off Paths drift from the repository layout] → Coverage lists
  uncovered paths, so a stale glob shows up as a partial sign-off.
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

## Open Questions

These wait on the owner.

1. **Name and weight of the Client Sign-off.** Is "Client Sign-off" the term,
   or "Client Verdict" or "Client Approval"? (Verdict and approval already
   mean other things.) Is it only input to the Agency's Acceptance, as the
   domain model says today? May an Agency require a current, whole-change
   sign-off before Acceptance? If yes, the only way Unfold can hold back a
   merge is a commit status, such as `unfold/client-sign-off`, that the Agency
   makes required in its branch rule. That would also change the Acceptance
   definition, which counts a merge and ten working days of silence.
2. **Who defines the Sign-off Paths.** The Agency admin per Client and
   repository; the Client, with Agency approval; or derived from CODEOWNERS
   with a Client team. And does "no Sign-off Paths" mean the Client covers
   nothing (this design) or everything?
3. **Client-view copy.** Dutch and English wording for the answers, the
   "Agency decides" line, the dismissal notice and the empty states, with the
   Agency's brand first. Which language is the default per Client, and may
   the Agency rewrite the copy?
4. **Agency approval default.** This design defaults to Client approval only.
   Should a new Client start with both required?
