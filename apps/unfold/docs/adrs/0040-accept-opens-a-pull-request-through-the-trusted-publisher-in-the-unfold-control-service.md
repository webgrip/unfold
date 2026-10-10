---
status: accepted
date: 2026-10-11
decision-makers: Ryan Grippeling
review-by: 2027-01-11
---

# Accept opens a pull request through the trusted publisher in the Unfold control service

## Context and Problem Statement

[ADR 0019](0019-verify-canonical-candidates-outside-agent-workspaces.md) reconstructs one canonical commit for a completed candidate, verifies it outside the agent's workspace and lets Ploeg approve it and reserve its publication. [ADR 0006](0006-trusted-verifier-and-publisher.md) asks for a separate trusted publisher that holds the Git write capability. Nothing builds that publisher: Accept on a verified, approved candidate records a review note, and a person still pushes the commit and opens the pull request by hand ([candidate delivery](../contracts/candidate-delivery.md#publication-boundary)).

Where does the publisher run, which identity pushes, and what does Accept mean?

## Decision Drivers

* An agent workspace never holds a forge write credential, so a stale or compromised Run cannot publish.
* One canonical commit is checked, approved and published; nothing reconstructs another on the way.
* A crash or a lost response never pushes twice, opens two pull requests or pushes without Ploeg's authorization.
* Merge, required forge checks and release stay with the forge and a person.
* System [ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md) retires the application's engine, so the publisher must not add execution to it.

## Considered Options

* A trusted publisher in the Unfold control service, pushing as a dedicated Forgejo user
* A publisher inside Ploeg, beside its own publication path
* A forge CI job that publishes on a signal from Unfold
* Give the Run a short-lived write token and let it push

## Decision Outcome

Chosen option: "A trusted publisher in the Unfold control service, pushing as a dedicated Forgejo user", because the control service already holds the canonical commit, the verifier receipt and the approval, and it is the one process ADR 0019 already trusts outside the workspace.

* **Placement.** The publisher is a module of the Unfold server. It runs only in the control service, never in a Run, a workspace or a sandbox, and never executes candidate hooks.
* **Identity.** It pushes and opens pull requests as the Forgejo user `unfold-publisher`, whose token has the `write:repository` scope only. The token's environment variable is never the Ploeg consumer token and never reaches an agent environment; configuration that would put it there is rejected.
* **Accept.** Accept on a verified candidate approves exactly that canonical commit, asks Ploeg to reserve its publication, pushes the commit to a new branch and opens one pull request against the approved base. The pull request names the Work Item, the candidate, receipt and approval, the commit and policy hashes, the verifier and the person who accepted. Accept never merges: merge stays human, on the forge.
* **Authority.** Only Ploeg's first accepted reservation grants the push. Each phase is persisted before its external effect. A replayed reservation, a branch holding another commit or a pull request that cannot be found positively ends in a state a person resolves, never in a second push.
* **Scope.** The publisher serves Unfold candidates, which the application's engine produces. It is transitional and retires with that engine ([ADR 0023](0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)); Ploeg's own publication path then serves every Work Item.

### Consequences

* Good, because Accept ends in a reviewable pull request instead of a hand-made push.
* Good, because the write credential lives in one process that agents cannot reach, and its scope cannot touch settings, teams or other users.
* Good, because the existing reservation and publication barrier in Ploeg decide every push, so a crash cannot duplicate one.
* Bad, because the control service gains a forge credential and an external effect it must reconcile after a restart.
* Bad, because the publisher is built for a path that retires with the engine, and its code is deleted then.
* Bad, because `write:repository` lets the publisher push any branch of a repository the user can reach; branch protection on the forge, not the token, keeps it off protected branches.

### Confirmation

Accepted, not implemented. It is implemented when:

* a publish test against a fake Forgejo and a fake Ploeg ends published with exactly one push and one pull request created, and a replayed reservation never pushes;
* the same tests cover a lost reservation response, a crash after the push, a lost pull request response and a foreign commit on the branch;
* configuration tests reject a publisher token variable that is the Ploeg consumer token or appears in the agent environment;
* the deployed `unfold-publisher` token has `write:repository` and nothing else.

## Pros and Cons of the Options

### A publisher inside Ploeg

* Good, because publication would sit beside the reservation that authorizes it, and Ploeg outlives the engine.
* Bad, because Ploeg does not hold Unfold's canonical commit or verifier evidence, so the candidate would cross another boundary before it is published.

### A forge CI job that publishes on a signal from Unfold

* Good, because it reuses the forge's isolation and identity, which ADR 0006 prefers.
* Bad, because the reservation, the persisted phases and the reconciliation would be split across a workflow run and Unfold, and a lost dispatch is hard to tell from a slow one.

### Give the Run a short-lived write token

* Good, because no new service holds a credential.
* Bad, because the agent controls the workspace that pushes, which is the fencing ADR 0006 rules out.

## Re-evaluation triggers

* The application's engine is deleted, so no Unfold candidate remains to publish: retire the publisher.
* Ploeg's publication path can take an Unfold canonical commit and its receipt: move the publisher to Ploeg.
* Forgejo offers a token scope narrower than `write:repository` that can still push a branch and open a pull request.
* The forge CI can supply the same identity, evidence and fencing guarantees (the ADR 0006 trigger).

## More Information

* [Candidate delivery contract](../contracts/candidate-delivery.md)
* [ADR 0006](0006-trusted-verifier-and-publisher.md) states the trust boundary; [ADR 0019](0019-verify-canonical-candidates-outside-agent-workspaces.md) the verification it publishes.
* Work: [epic VIK-1977](https://vikunja.webgrip.dev/tasks/1977); the publisher is [VIK-1980](https://vikunja.webgrip.dev/tasks/1980).

### History

* 2026-10-11: accepted. The owner decided on 2026-10-10 that Accept opens a pull request through a trusted publisher in the Unfold control service, pushing as the dedicated Forgejo user `unfold-publisher` with `write:repository`, never from a Run, and on 2026-10-11 to build it although it retires with the engine ([VIK-1979](https://vikunja.webgrip.dev/tasks/1979)).
