# Client sign-off: an Agency's Client approves ready work and signs off its pull request

## Why

[ADR-0007](../../../docs/adr/adr-0007-clients-approve-ready-work.md) decided
that a Client approves its Ready work before a Shift spends on it, and
[ADR-0008](../../../docs/adr/adr-0008-every-pull-request-gets-a-preview-environment.md)
that the Client judges the change on a Preview Environment. None of it is
built. Today only the Agency's own people approve a proposed Work Item, and
nothing records what a Client thought of the pull request.

This is the capability that sets Unfold apart. Other agent products let the
developer, or the AI itself, approve. GitHub Copilot's "approvals" are an agent
approving a pull request. None of them lets the Agency's Client approve. This
change borrows the mechanics that make a forge approval trustworthy: the
approval is bound to the head commit, a new push dismisses it, and it covers
only the paths its owner may judge. Here they apply to the Client's answer,
and the Agency keeps Acceptance.

Application: `apps/unfold`, plus one generic contract in Ploeg that lands in
ploeg-hq first. This is slice P2.0 of the agency offering. No ticket is filed
for it yet; task 1.1 files one.

## What Changes

All of it is proposed. Nothing in this change is implemented, and every
requirement in `specs/client-sign-off/spec.md` is proposed behaviour. Client
Sign-off and Sign-off Paths are proposed terms. The spec assumes ADR-0017's
Tenant and Client scoping and does not restate it.

- **P2.1 Client approves Proposed work.** A user with a client membership
  (ADR-0017) approves or rejects the proposed Work Items of its own Client,
  and only those. The Agency may approve on the Client's behalf and may
  require its own approval as well (ADR-0007).
- **A generic Ploeg contract, upstream.** An Operator Consumer names the
  approvals a proposed Work Item requires. Ploeg records each approval, and
  Admission refuses to open a Shift until every required approval is
  recorded. The contract carries no Unfold words. It is what ADR-0007's
  Confirmation needs: a Ploeg admission test.
- **P2.2 Client Sign-off core.** A new proposed term, **Client Sign-off**: a
  Client user's answer on one of its Work Item's pull requests, either "looks
  good" or "needs changes", with a note. It is bound to the pull request's
  head commit, dismissed by a new push, and limited to the Sign-off Paths in
  the Client Profile. The head commit and the changed paths come from Ploeg's
  delivery facts (`apps/unfold/src/cards/facts.ts`).
- **P2.3 Sign-off route and control.** An HTTP route and a page control
  record a Client Sign-off. Behind the proposed flag `client.verdict-comment`,
  Unfold writes it into the pull request through Ploeg's keyed pull request
  comment (Ploeg ADR-0079) as key `client-verdict`, following the pattern of
  `apps/unfold/src/agent-trace-comments.ts`.
- **P2.4 Client view.** A read-only page for a Client user: its Work Items,
  their pull requests and Client Sign-offs. It shows the Agency's price and
  hides Unfold's own charge.
- **P2.5 Signed preview link.** A link that opens one Preview Environment for
  one Client and expires with the preview. It depends on ADR-0008's previews,
  which are not built.

## Capabilities

### New Capabilities

- `client-sign-off`: how a Client approves its proposed Work Items, signs off
  their pull requests, follows them in the client view and opens their
  previews.

### Modified Capabilities

None. `openspec/specs/` holds no capability these requirements change.

## Non-goals

- **Client acceptance.** The domain model forbids the phrase: Acceptance is
  the Agency's decision (ADR-0006, R11). A Client Sign-off is input to it,
  unless the owner decides otherwise (open question 1).
- **Unfold contacting a Client.** No email, chat or forge mention reaches a
  Client from Unfold (ADR-0007, R15). The Agency passes on links and
  questions.
- **A forge review by the Client.** The Client never gets a forge account, and
  the Client Sign-off is not a forge approval. It never counts towards a
  branch rule's required approvals.
- **Quotes and prices.** Drafting and storing a Quote belongs to Refinement
  and billing (ADR-0006). The client view shows a price only when one
  exists.
- **Building Preview Environments.** ADR-0008's preview deploy is its own
  change. P2.5 only signs a link to a preview that exists.
- **Tenant and Client scoping.** The P1 slices of ADR-0017 (VIK-1876,
  VIK-1877, VIK-1878, VIK-1740) build it. This change depends on them and does
  not repeat them.
- **Client steering, cancelling or Asks.** ADR-0031 leaves Client influence on
  running work for a later decision.

## Impact

- `apps/unfold/src`: a Client Sign-off store, the approve and sign-off routes,
  the comment writer, the client view route, the signed preview link, and a
  new entry in `flag-registry.json`.
- `apps/unfold/public`: the sign-off control on the Work Item page and the
  client view, with workbench stories for every state.
- `apps/unfold/docs/contracts/`: the new routes.
- `docs/domain/model.yaml`: the proposed terms Client Sign-off and Sign-off
  Paths, and Sign-off Paths as a part of Client Profile.
- Ploeg (ploeg-hq): required approvals on a proposed Work Item, then a
  `ploeg`-scoped commit that moves Unfold's pin.
- No new runtime dependency and no model call. Nothing here spends money
  except that approving a Work Item lets Ploeg admit its Shift.
