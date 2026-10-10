---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
review-by: 2026-10-31
---

# Unfold traces bugs to Run cards under an administrator-mapped forge login

## Context and Problem Statement

Ploeg's ADR-0052 (proposed in Ploeg pull request #109, "A crack needs the fixer and a second person, and Ploeg only proposes candidates") lets people trace a bug Work Item back to the Run card whose play caused it. Ploeg lists candidate plays, the fixer proposes a crack, a second person who is neither the card's steward nor the proposer confirms it, the steward may dispute within five working days, and a referee who took no part decides. Anyone but the steward may instead mark the bug as a changed requirement, which gives the card `evolved` and no crack. Ploeg's [ADR-0051](../../../ploeg/docs/adrs/0051-delivery-gates-are-mapped-per-board-from-tracker-statuses.md) adds delivery gates to the card and ADR-0053, proposed in the same pull request, adds sets.

Every attribution step names a person in `X-Ploeg-Actor` or `X-Ploeg-Acting-User`, and Ploeg compares that name, ignoring case, with the card's steward and the proposer. The steward is a forge login. Unfold signs people in under its own account ids, which are not forge logins. ADR-0052 says Unfold must send the forge login. Which login does Unfold send, and how does the Work Item page offer the flow without promising steps Ploeg will refuse?

## Decision Drivers

* Every mutation needs an authenticated identity and object authorization ([AGENTS.md](../../AGENTS.md)).
* The four-eyes rule is the point of the flow. Whatever Unfold sends as the person must not be something that person can change at will.
* Ploeg is authoritative. The browser may only hide steps Ploeg would refuse and explain why.
* A crack is an inquiry, not a verdict. The page states the rules in plain words.
* A deterministic demo says it is one and invents no model calls or spend ([Unfold ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md)).

## Considered Options

* An administrator maps Unfold accounts to forge logins in `ploeg.forgeLogins`
* Each person sets their own forge login in Settings, like the card logins proposed for binders
* Unfold sends its own account id and leaves the mapping to Ploeg

## Decision Outcome

Chosen option: "An administrator maps Unfold accounts to forge logins", because it is the only option where the name Ploeg compares with the steward is not chosen by the person being compared.

1. **Identity.** `ploeg.forgeLogins` in the server configuration maps an Unfold account id to a forge login, validated like Ploeg's actor names. [`PloegClient.forgeLogin`](../../src/ploeg.ts) reads it, and in the demo the account id stands in. Unfold sends that login as both `X-Ploeg-Actor` and `X-Ploeg-Acting-User`. A person without a mapping can read attributions but takes no step, and the page says an administrator must add the login. Self-declared logins, such as the card logins that Unfold ADR 0029 proposes for binders in a parallel change, are never used for attribution. Once a login is verified, for example through a linked forge account, `forgeLogin` can read it.
2. **Proxy routes.** `GET /api/ploeg/work-items/:id/crack-candidates` and `GET /api/ploeg/work-items/:id/cracks` read Ploeg's lists for a Work Item in the caller's Teams; the second also returns who the caller is in the flow. `POST /api/ploeg/work-items/:bug/cracks` proposes and `POST /api/ploeg/work-items/:bug/evolved` marks a changed requirement, both after checking that the bug and the card are in the caller's Teams and the same Team. `POST /api/ploeg/work-items/:id/cracks/:crack/(confirm|dispute|resolve)` acts on one attribution after Unfold finds it among that Work Item's attributions in the caller's Teams. Viewers get 403. Unfold checks severity, share, discovery, the resolution and the 2000-character note and reason before anything reaches Ploeg. Ploeg's refusal codes come back as `crack_<code>` with Ploeg's own sentence when it is plain bounded text, and Unfold's otherwise.
3. **Trace this bug.** The Work Item page shows the panel only when Ploeg listed candidates or attributions for that Work Item, so a Work Item that is not a bug shows nothing. It lists the attributions on the bug, Ploeg's candidates with their shared files, and the bugs already traced to the Work Item as a card. [`public/core/attribution.js`](../../public/core/attribution.js) mirrors Ploeg's rules to decide which of Propose, Confirm, Dispute, Resolve and Requirement changed to offer, and says why a step is not offered. A candidate does not name its card's steward, so the play's merger stands in for the warning that a proposal will count as self-reported. Each step opens a dialog that checks its fields, and the result is announced in the panel.
4. **Card display.** The card model reads `gates`, `evolved`, `set`, the 2026.2 grade inputs, the cracks' weight, warranty and mend confirmation, and the `cosigner` role, and keeps each absent for an older Ploeg. Unfold Native's front gains a gates strip with bounce markers, a right-first-time chip and crack, evolved and set chips; the back gains Gates, Grade, Condition and Set tabs. The forge face adds a Gates row and prints the set position beside its set symbol.
5. **Demo.** Bug Work Item DEMO-24 has three candidates, a confirmed crack on DEMO-18 that the demo operator, as its steward, may dispute, and a proposed crack on DEMO-21 that the demo operator may confirm. Epic DEMO-25 has a set of five. Demo steps apply the same rules, keep nothing, and say "Demo: Ploeg recorded nothing."

### Consequences

* Good, because nobody can confirm their own proposal or dodge the steward check by changing a setting.
* Good, because the page offers only steps Ploeg would take, and says why the others are missing.
* Bad, because an administrator must maintain the mapping, and a person without one cannot take part until then.
* Bad, because the merger stands in for the steward on candidates, so the self-reported warning can be wrong when the steward is an approver. Ploeg records the real discovery.
* Bad, because a bug whose fix shares no file with an earlier play shows no panel, and its cause cannot yet be proposed from the page by hand.

### Confirmation

Proposed. The Unfold side is implemented against Ploeg pull request #109's contract and fixtures. It is confirmed when a live Ploeg with the crack API records a proposal and a confirmation from two mapped accounts through Unfold.

In `apps/unfold`, `mise exec -- npm test` pins it: [`test/cracks.test.ts`](../../test/cracks.test.ts) covers the card fields and their absence, sign-in, the request header, viewers, accounts without a mapping, input checks, Team scope for the bug, the card and the attribution, the forge login as the actor, Ploeg's refusals and the demo's rules; [`test/attribution.test.mjs`](../../test/attribution.test.mjs) covers the mirrored rules, the panel, the dialogs and the card display. `mise exec -- npm run test:browser` ([`scripts/browser/trace.mjs`](../../scripts/browser/trace.mjs)) checks the gates strip, the Condition and Set tabs, the epic's children and the demo Confirm and Propose flow at desktop and phone widths.

## Pros and Cons of the Options

### Each person sets their own forge login

* Good, because nobody waits for an administrator.
* Bad, because a person could set the steward's login to dispute, or switch logins between proposing and confirming.

### Unfold sends its own account id

* Good, because nothing needs configuring.
* Bad, because Ploeg compares the actor with a forge login, so every steward check passes and the four-eyes rule is gone, as ADR-0052's consequences warn.

## More Information

* 2026-10-01: proposed with the Unfold side implemented against Ploeg pull request #109, while ADR 0029 (binders and packs) was proposed in parallel with self-declared card logins.
* 2026-10-10: [root ADR-0030](../../../../docs/adr/adr-0030-run-cards-are-an-unfold-domain-on-top-of-ploegs-delivery-facts.md): the crack workflow runs in Unfold. Unfold checks each step's rules, as Ploeg did, under the same administrator-mapped forge login, keeps cracks and their audit trail in its own store and imports the cracks Ploeg recorded once. With an older Ploeg the steps still go to Ploeg.
