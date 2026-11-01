# Accept and merge: a person accepts a pull request in Unfold, and Ploeg asks the forge to merge it

## Why

A Work Item's pull request is reviewed in Unfold, but accepting it means
leaving Unfold and merging on the forge. Unfold records no Acceptance of its
own; it only learns of the merge afterwards from Ploeg's delivery facts. On
1 November 2026 the owner asked to accept in Unfold so that Ploeg asks the
forge to merge, or to merge once its checks pass, and the tracker card moves
to Done on its own.

Application: `apps/unfold`, plus one generic contract in Ploeg that lands in
ploeg-hq first (ploeg-hq ADR-0188, proposed). The decision is
[ADR-0053](../../../docs/adr/adr-0053-a-person-accepts-a-pull-request-in-unfold-and-ploeg-asks-the-forge-to-merge-it-at-that-head.md),
proposed. No ticket is filed yet; task 1.1 files them.

## What Changes

All of it is proposed; nothing is built.

- **Accept and merge** on a Work Item whose pull request waits for review: on
  the Work Item page, Now, the Agents window and the MCP tool
  `unfold_accept_work`. The confirmation shows the head commit, checks, the
  reviewing Run's Verdict, spend and, for a quoted Work Item, the Delivery
  Fee.
- **An Acceptance record** in Unfold, bound to the head commit, naming the
  person, channel and confirmation. It is an audit event and the Delivery
  Fee's billing event. A later forge merge of the same head is the same
  Acceptance.
- **Ploeg merges** at that head with its own merge identity, through the
  forge's branch protection, using the forge's "merge when checks succeed"
  for what Ploeg's own CI gate does not count, such as a required review. Unfold shows **Merging** and **Cancel merge** meanwhile,
  and the refusal reason when the forge refuses.
- **Homelab**: a merge identity for `webgrip/unfold` on Forgejo, in its
  `development` branch protection's merge allow-list, held only by ploegd.
- **Docs**: "Unfold never merges" becomes "a person accepts in Unfold or on
  the forge; the forge merges under its own protection" when the first slice
  ships.

Not in this change: automatic acceptance without a person's click (the owner
left it open), and forges other than Forgejo until Ploeg's adapters have the
capability.

## Capabilities

### New Capabilities

- `accept-and-merge`: accepting a Work Item's pull request at its head, and
  following the merge Ploeg asks the forge for.

### Modified Capabilities

- None yet; the Work Item page, Now and the Agents window gain an action.

## Impact

- `apps/unfold`: a new route and action next to approve, reject and cancel; an
  Acceptance store; the `PloegPort` gains the merge call; the Work Item page,
  Now, the Agents window and `unfold_accept_work`.
- Ploeg (upstream): a merge contract on the operator API and ploeg-mcp, a
  merge permission for Operator Consumers, and a forge port capability;
  Forgejo first.
- `webgrip/homelab-cluster`: the merge identity's secret and the Operator
  Consumer's merge permission.
