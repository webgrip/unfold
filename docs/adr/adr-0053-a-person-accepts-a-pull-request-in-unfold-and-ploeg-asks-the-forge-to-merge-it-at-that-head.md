---
status: proposed
date: 2026-11-01
decision-makers: Ryan Grippeling
---

# A person accepts a pull request in Unfold, and Ploeg asks the forge to merge it at that head

## Context and Problem Statement

Acceptance is the Agency's decision that a pull request delivers its Work Item: an explicit approval, a merge, or ten working days without a decision ([glossary](../reference/glossary.md#acceptance), [ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md)). Unfold shows a Work Item's pull request, its checks, the reviewing Run's Verdict and its cost, but the person then has to leave Unfold and merge on the forge. Nothing in Unfold records the Acceptance itself, and the only Acceptance Unfold sees is the merge Ploeg reports afterwards ([Ploeg ADR-0059](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0059-delivery-facts-come-from-the-forge-never-from-the-agents-outcome.md)).

On 1 November 2026 the owner asked to accept in Unfold, so that Ploeg asks the forge to merge, or to merge once its checks pass. That changes two rules Unfold states today: "Unfold never merges" ([who Unfold is for](../concepts/who-unfold-is-for.md), [users and journeys](../concepts/users-and-journeys.md)) and "Accept never merges" for a Session's candidate ([application ADR 0040](../../apps/unfold/docs/adrs/0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md)).

Who performs the merge, under which identity and protection, what happens when checks are still running, and what does the person's click mean?

## Decision Drivers

* A person decides. An agent never merges its own work, and a Verdict is Evidence, never Acceptance ([glossary](../reference/glossary.md#verdict)). [ADR-0047](adr-0047-unfold-describes-a-repository-with-the-ai-codebase-maturity-model-and-delivers-at-level-5.md) rejected merges without a person for that reason.
* The forge stays the authority over what may merge: branch protection, required checks and required approvals apply unchanged.
* An Acceptance must not outlive the change it judged. A Client Sign-off is bound to the head commit for the same reason ([ADR-0049](adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md)).
* Ploeg is the only engine and holds the forge connections ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)); Ploeg knows no consumer, so its half is a generic contract in Ploeg's words.
* No lock-in ([ADR-0050](adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md)): the merge is the forge's own merge API under the forge's own branch protection, whichever agent or person wrote the change, and merging on the forge directly keeps working and still counts as Acceptance.
* Every action names its person, channel and confirmation ([ADR-0037](adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)).

## Considered Options

For who merges, the owner chose from:

1. Ploeg merges with its own merge identity, through a generic merge contract an Operator Consumer calls
2. Unfold merges with the person's own forge sign-in
3. Unfold merges with a bot token of its own

For checks that are still running: the forge's own "merge when checks succeed"; refusing until checks pass; or Ploeg waiting and merging itself. For the merger the forge shows: the merge identity with the person in a commit trailer, or the person. For the merge method: the repository's default, or always squash.

## Decision Outcome

Chosen option: "**Ploeg merges with its own merge identity at the head the person accepted, through the forge's own protection and auto-merge**", because it keeps forge credentials out of Unfold, keeps the person's decision and the forge's rules separate, and adds no merge logic the forge already has. The owner answered on 1 November 2026: 1A, 2A, 3A, 4A, 6A.

1. **Accept and merge.** On a Work Item whose pull request waits for review, a person who may accept chooses **Accept and merge** in Unfold: on the Work Item page, Now, the Agents window or the MCP tool `unfold_accept_work`. Before confirming they see the head commit, the checks, the reviewing Run's Verdict, the spend and, when the Work Item has a Quote, the Delivery Fee. The label says what happens; the Session candidate's **Accept** of application ADR 0040 keeps its name and its meaning.
2. **Acceptance is recorded by Unfold**, bound to the pull request's head commit from Ploeg's delivery facts, with the person, the channel, the confirmation and the time. It is an audit event and, for a quoted Work Item, the event that charges the Delivery Fee. A merge that happens anyway is the same Acceptance, counted once.
3. **Ploeg merges** through its generic merge contract (ploeg-hq ADR-0188, proposed): Unfold names the Work Item, the head commit and the person; Ploeg asks the forge to merge with a merge identity that only ploegd holds and that no Run ever receives. The forge refuses when the head moved, so a push after the click is never merged on the strength of it.
4. **Checks still running** become the forge's own "merge when checks succeed" (Forgejo `merge_when_checks_succeed`, GitHub auto-merge, GitLab merge when pipeline succeeds). Ploeg only takes a merge for a Work Item that awaits review, which under Ploeg ADR-0119 means its CI already passed; the forge's auto-merge then covers what Ploeg's gate does not count, such as a required review. Unfold shows the Work Item as **Merging** and offers **Cancel merge** until the forge merges or refuses.
5. **The forge decides.** Branch protection, required checks and required approvals apply as they would to a person; Ploeg never merges as an administrator. A refusal comes back with its reason: the head moved, checks failed, a conflict, a protection rule, or no permission.
6. **The merger is the merge identity**, and the merge commit names who asked without naming a person (point 8). Where a merge method writes no commit message, Ploeg's comment on the pull request and its audit row carry it. The repository's own default merge method applies.
7. **Security first (owner, 1 November 2026).** Accept and merge needs a sign-in at most 15 minutes old; an older one asks the person to sign in again before the confirmation. Unfold's Operator Consumer gets Ploeg's `merge` permission only for the Teams an installation names. Every merge request, merge and refusal notifies the Work Item's people and the installation's owner on their notification channels. The MCP tool acts only after the person confirms in the client; a client that cannot show the confirmation gets a link to Unfold, never a merge. Unfold never offers the action to an agent, an Ask or a Run. Ploeg adds its own controls: it refuses when the agents' identity can merge the base branch, rate-limits merges and has a kill switch (ploeg-hq ADR-0188).
8. **Names stay out of git.** The merge commit carries Ploeg's pseudonymous person id, the merge request id and, as `Merge-Request-Ref`, a link to the Acceptance in Unfold. Unfold passes the person's display name only for Ploeg's comment on the pull request, which can be erased; a commit cannot.
9. **Not decided: automatic acceptance.** Whether a rule may accept on a person's behalf, for example a docs-only change with green checks and an approving Verdict, is left open. Nothing in this decision merges without a person's click.

The rule "Unfold never merges" becomes "a person accepts in Unfold or on the forge; the forge merges under its own protection". Unfold still never deploys to production. The concept pages change when the first slice ships, not before.

### Consequences

* Good, because review, Acceptance and the merge happen in one place, and the ClickUp or Vikunja card moves to Done through the existing delivery facts.
* Good, because the head binding makes an Acceptance mean exactly the commit the person saw.
* Good, because Unfold holds no forge write credential; the merge identity lives with Ploeg's other forge connections.
* Bad, because a forge account or App with merge rights now exists outside a person's hands. The forge's branch protection, a merge identity that no Run receives, the head binding and the Operator Consumer's merge permission limit it; a leaked operator token could still merge any pull request its Team scope reaches, which is why the action asks for confirmation every time.
* Bad, because Unfold's two Accepts (a Session candidate and a pull request) need distinct labels; **Accept and merge** carries the difference.
* Neutral: forges without auto-merge, or an Agency that prefers to merge on the forge, keep today's path. A merge on the forge still counts as Acceptance.

### Confirmation

Confirmed when Unfold's tests show that an Acceptance on a head other than the current one is refused and calls no Ploeg, that a person without the accept permission gets 403 and calls no Ploeg, that a confirmed Acceptance calls Ploeg's merge contract with the accepted head and the person, that a Ploeg refusal leaves the Work Item in review with the reason shown, and that a merge on the forge after an Acceptance in Unfold records one Acceptance, not two. Ploeg's half is confirmed by its own record's tests (ploeg-hq ADR-0188).

## Pros and Cons of the Options

### Ploeg merges with its own merge identity (option 1)

* Good, because Ploeg already holds per-repository forge connections and learns merges from forge webhooks.
* Good, because one contract serves every Operator Consumer and every forge adapter.
* Bad, because Ploeg gains a write path it did not have; it is a new capability of its forge port, refused where an adapter lacks it.

### Unfold merges with the person's forge sign-in (option 2)

* Good, because the forge shows the person as the merger.
* Bad, because Unfold would hold every person's forge token and a second forge client next to Ploeg's.

### Unfold merges with its own bot token (option 3)

* Bad, because it puts a forge write credential in Unfold and splits forge knowledge across two systems.

### Refusing until checks pass, or Ploeg waiting and merging

* Refusing makes the person come back for every slow pipeline.
* Ploeg waiting rebuilds the forge's auto-merge and keeps a merge pending in Ploeg's state instead of the forge's.

## More Information

* Design and requirements: the [accept-and-merge change](../../openspec/changes/accept-and-merge/design.md) and its [spec](../../openspec/changes/accept-and-merge/specs/accept-and-merge/spec.md).
* Ploeg's half: [ploeg-hq ADR-0188](https://github.com/ploeg-hq/ploeg/pull/406), proposed: `POST /api/v1/operator/work-items/{id}/merge` with `headSha` and `whenChecksPass`, `DELETE` to cancel, the Operator Consumer permission `merge`, the forge capability `pull_request_merger`, and the refusals `head_changed`, `checks_failed`, `conflict`, `protection`, `not_mergeable` and `forbidden`.
* 2026-11-01: proposed; the owner answered the design questions 1A, 2A, 3A, 4A and 6A and left automatic acceptance open.
