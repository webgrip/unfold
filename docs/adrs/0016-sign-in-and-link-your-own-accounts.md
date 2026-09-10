# 0016 — People sign in with the estate and link their own accounts

Date: 2026-09-10. Status: proposed; nothing implemented.

## Context

Running a session on a private repository today needs an administrator to list the repository in the profile, seed a forge token and a tracker token into a vault or a shell, name them in `agentEnvironment`, and write a crew whose writer pushes and opens the merge request from inside the sandbox with that token. A session cannot exist without a repository or a crew, and a tracker source cannot load without its token. That is Ploeg's model, where an unattended dispatcher acts under service credentials an operator provisions once, transplanted onto a workbench a person signs into. It showed the moment a second estate was added: the two tokens the profile expected did not exist in the second estate's vault, the launcher refused to start, and the person at the keyboard could do nothing about it without an administrator ([live operation](../operations/live.md)).

The estate already has the pieces a person-centred model needs. Authentik issues OIDC identities at both estates; GitLab, Forgejo and ClickUp all offer OAuth 2.0 authorization for third-party applications; Vikunja issues personal tokens. [Platform and governance](../design/platform-and-governance.md) already proposes the OIDC login and calls the local password a compatibility path. the second estate's own rule is that agents act as a named human ([acme ADR 0033](https://gitlab.com/acme/internal/platform/-/blob/main/docs/adr/adr-0033-agents-act-as-a-named-human.md)). [ADR 0006](0006-trusted-verifier-and-publisher.md) wants publication out of the sandbox and into a trusted publisher; nothing says that publisher cannot be the control plane acting as the signed-in person.

## Decision

Out of the box, a person signs in with the estate's OIDC provider, types an objective, runs a session, reviews the candidate and downloads it. No repository, tracker, crew choice or forge write is required for that path; a session without a repository gets an empty workspace, and a plain delivery crew is the default.

Linking is how a person adds the rest, from their own profile page, and every link is theirs:

- A forge link (GitLab, Forgejo) is an OAuth authorization with `read_api`, `read_repository` and `write_repository`, or a pasted personal token where OAuth is not available. The refresh and access tokens are stored per user, encrypted with a server key held by the control plane, revocable from the same page, and never exported to a sandbox.
- A tracker link (ClickUp, Vikunja) is the same for tickets. A source without a link shows nothing; it never fails the profile.
- Repositories are discovered from the person's forge link. Administrator-listed repositories remain as estate defaults and as the place where `executionOwner: ploeg` marks the unattended lane.

The control plane does the forge work with the person's link, never the sandbox. The clone of a private repository runs in the existing clone step with a token minted for that operation; the agent container starts after it and holds only its inference key. After review, "Open merge request" is a workbench action: the control plane pushes the candidate's branch and opens the request as the signed-in person, records both in the session's event log, and writes the link back to the ticket if one is linked. The candidate manifest keeps recording publication as not performed by the session, because it was performed by the person through the workbench.

Estate secrets shrink to what the installation itself needs: the LiteLLM minting credential, the OIDC client, and the key that encrypts links at rest. `tokenEnv` on task sources stays only for sources an estate runs as a service, such as a Ploeg-owned lane.

## Consequences

A new person is productive after one login. Every forge and tracker write carries a human identity, which is the audit trail acme and webgrip both ask for, and the sandbox holds no credential that can reach a forge, which removes the compatibility-mode caveat from ADR 0006 for interactive sessions. The cost is a real identity layer: an OIDC flow for the browser and the editor, a links table, an OAuth application registered per forge and tracker at each estate, and a server key in OpenBao. A linked token acts with the person's full rights, so the workbench must confine itself to the repository the session named and log every write, and revoking a link must stop any session using it. The merge-request crew in the acme profile becomes unnecessary once the publish action exists.

## Reconsider when

A forge or tracker withdraws OAuth for third-party applications, in which case pasted tokens carry that provider; the estate adopts a workload identity broker that can mint forge tokens for a named person, in which case links become brokered rather than stored.

## Sequence

1. PV-082: OIDC login for the browser and the editor, local password kept as bootstrap.
2. PV-083: per-user links with GitLab OAuth first, encrypted at rest, revocable.
3. PV-084: sessions without a repository, repositories discovered from the link, private clone through the clone step.
4. PV-085: "Open merge request" as a workbench action acting as the person, with ticket write-back.
5. ClickUp and Vikunja links, then `tokenEnv` retired for interactive sources.
