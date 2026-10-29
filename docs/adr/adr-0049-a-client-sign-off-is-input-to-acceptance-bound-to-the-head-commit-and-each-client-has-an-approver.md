---
status: proposed
date: 2026-10-29
decision-makers: Ryan Grippeling
---

# A Client Sign-off is input to Acceptance, bound to the head commit and the whole change minus the Agency's exclusions, and each Client has an Approver

## Context and Problem Statement

[ADR-0007](adr-0007-clients-approve-ready-work.md) decided that a Client approves its Ready work before a Shift spends on it, and that a Client's objection to a preview is something the Agency decides against the Acceptance Conditions. Nothing records what a Client thought of the pull request itself, and ADR-0007 assumes the Client is always the party that approves. The [client-sign-off change](../../openspec/changes/client-sign-off/design.md) left four questions to the owner, who answered them on 29 October 2026. What is a Client's answer on a pull request called, what does it weigh, what does it cover, and who approves a Client's proposed work?

## Decision Drivers

* Acceptance is the Agency's decision and charges the Delivery Fee ([ADR-0006](adr-0006-the-ticket-is-the-billing-unit.md), R11). A Client's answer must not be mistaken for it.
* An answer that outlives the change it judged is worse than none. A forge dismisses a stale approval on a new push, and Clients deserve the same rule.
* An Agency should get a useful sign-off with no setup, and keep the paths a Client should not judge, such as infrastructure, out of it.
* Ploeg knows no Client, Agency or Sign-off ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)). Whatever Ploeg must do is a generic contract.
* The party that pays for and approves work is not always the Client: a main contractor or a reseller may sit in front of it.

## Considered Options

For the scope of a Sign-off, the owner chose from five options:

1. The whole pull request diff, with no setup
2. Exclusion globs the Agency sets per Client and repository in the Client Profile
3. A repository file such as `.unfold/sign-off.yml`, or Client handles in `CODEOWNERS`
4. Change categories (UI, copy, content, prices, email) from path globs and labels, with the judge only advising
5. A commit status `client-sign-off` that the Agency may make required in branch protection, through a generic Ploeg keyed commit status contract

For the name, the candidates were Client Sign-off, Client Verdict and Client Approval.

## Decision Outcome

Chosen option: "**Client Sign-off, input to Acceptance, scoped by options 1, 2 and 5 with the best part of 3 and 4, and an Approver per Client**", because they keep Acceptance with the Agency, give a sign-off that cannot claim a change it never saw, and work without setup.

1. **Name.** The term is Client Sign-off, with the answers "looks good" and "needs changes". Verdict already means a reviewing Run's answer, and approval means a Work Item approval in Ploeg.
2. **Weight.** A Client Sign-off is input to the Agency's Acceptance, never Acceptance, a Review or a Verdict. It merges nothing, approves nothing in the forge, changes no Ploeg state, starts no Run and charges nothing. A per-Agency option to require a current Sign-off before Acceptance is proposed and needs its own decision, because it changes the Acceptance definition.
3. **Head binding.** A Sign-off is bound to the pull request's head commit from Ploeg's delivery facts. A submit that names another head is refused. A new head dismisses the Sign-off, and a return to the signed commit does not revive it.
4. **Scope.** By default a Sign-off covers every path the pull request changes at its head. The Agency may set exclusion globs per Client and repository in the Client Profile. A repository file may propose exclusions versioned with the code, but the Client Profile wins on a conflict, and the file holds globs only, never a Client's identity. Each Sign-off stores the scope it was given, and a truncated or missing path list never counts as the whole change.
5. **Enforcement, optional.** An Agency may make a `client-sign-off` commit status required in its branch protection. Unfold writes it through a generic keyed commit status contract that Ploeg does not offer yet; that part waits on its own Ploeg ADR, written in Ploeg's words.
6. **Later.** Change categories such as UI, copy, content, prices and email, computed from globs and labels on top of the same scope, with the judge only advising. Proposed and future.
7. **Approver.** Each Client has one Approver: the party whose approval its proposed Work Items need. It is the Client unless the Agency sets it to itself or to the party in front of the work that pays for it, such as a main contractor or a reseller. Unfold names that approval to Ploeg under a generic approval name; Ploeg never learns who the Approver is.

Whether the Approver of a Quote is also the bill-to party of its Work Item is an idea for the owner's pricing design, not part of this decision.

Not implemented yet. The first slice records a Sign-off with its head and scope behind a flag that is off by default, and only Agency people record one, on the Client's behalf, until Client memberships ([ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)) exist.

### Consequences

* Good, because the word Sign-off tells a Client and an Agency apart from Acceptance and from a reviewing Run's Verdict.
* Good, because the whole-change default needs no setup, and exclusions are where the Agency already keeps a Client's rules.
* Good, because the Approver covers main contractors and resellers without a second kind of Client.
* Bad, because a Sign-off that only informs Acceptance cannot stop a merge until the commit status exists.
* Bad, because the repository file and the Client Profile are two places for exclusions; the Client Profile winning keeps them from disagreeing silently, and every Sign-off lists what it left out.
* Neutral: the comment on the pull request names the Client, never a person, so an Agency that does not want its Client named on the forge keeps that flag off.

### Confirmation

Confirmed for parts 1 to 4 when Unfold's tests show that a Sign-off on a head other than the current one is refused, that a new head dismisses a stored Sign-off for good, that the scope is the changed paths minus the exclusion globs with a profile-kept path staying covered, and that no Sign-off changes Ploeg state. Part 5 is confirmed by a Ploeg admission of the keyed commit status contract and an Unfold test that writes `client-sign-off` on the head. Part 7 is confirmed with ADR-0007's own Ploeg admission test, once Unfold names the Approver's approval.

## Pros and Cons of the Options

### The whole diff only (option 1)

* Good, because it needs no setup.
* Bad, because a Client would sign off infrastructure and CI files it cannot judge.

### Agency exclusion globs (option 2)

* Good, because the Agency already owns the Client Profile.
* Neutral, because globs drift from the repository; the stored scope makes that visible.

### A repository file or Client handles in CODEOWNERS (option 3)

* Good, because a file is versioned with the code it describes.
* Bad, because Client handles in `CODEOWNERS` put Client identities in the repository. Only the globs-only file is kept, and the Client Profile wins over it.

### Change categories (option 4)

* Good, because "copy" and "prices" are what a Client thinks in.
* Bad, because categories need a classification Unfold does not have; it is kept for later on top of the same scope.

### A required commit status (option 5)

* Good, because it is the only way Unfold can hold back a merge without merging rights.
* Bad, because it needs a new Ploeg contract.

## More Information

* Design and requirements: the [client-sign-off change](../../openspec/changes/client-sign-off/design.md) and its [spec](../../openspec/changes/client-sign-off/specs/client-sign-off/spec.md).
* The keyed pull request comment the Sign-off is written with: [Ploeg ADR-0079](../../apps/ploeg/docs/adrs/0079-run-cards-belong-to-the-consumer-and-ploeg-supplies-delivery-facts.md).
* 2026-10-29: proposed.
