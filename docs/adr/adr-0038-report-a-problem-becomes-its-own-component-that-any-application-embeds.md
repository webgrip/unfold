---
status: accepted
date: 2026-10-18
decision-makers: Ryan Grippeling
---

# Report a problem becomes its own component that any application embeds

## Context and Problem Statement

[ADR-0024](adr-0024-bug-reports-are-filed-by-unfold-into-the-tenants-own-tracker.md) put Report a problem inside Unfold: the browser captures an annotated screenshot with private regions blurred, and Unfold's server files it as an issue or task in the tenant's tracker and follows it until it is fixed ([RFC-0002](../design/rfc-0002-report-a-problem.md)). It shipped that way in October 2026.

Two things have changed since. The homelab's RFC [Trackers are a port](https://forgejo.webgrip.dev/webgrip/homelab-cluster/src/branch/main/docs/techdocs/docs/rfc/rfc-tracker-port.md), accepted in part on 2026-10-17, makes Ploeg own tracker access for work and lets Unfold talk only to Ploeg. Report a problem is the reason Unfold still writes to trackers itself, through its own adapters in `apps/unfold/src/tasks.ts` (`createIssue`, `attachToIssue`, `readIssueState`, `commentOnIssue`). And the other applications the owner builds, Erfbeeld first, want the same reporter. Where does Report a problem live?

## Decision Drivers

* Unfold should talk to trackers only through Ploeg for work, so its own tracker adapters can go.
* Filing a bug report is not agent work. Ploeg authorizes, budgets and runs agent work and should not gain a feedback job.
* Other applications need the same reporter without depending on Unfold.
* ADR-0024's privacy rules stay: nothing captured in the background, private regions blurred, the person sees and controls everything sent, nothing leaves the install except to the tenant's tracker.

## Considered Options

* Its own component that any application embeds, filing through the shared tracker contract
* Keep it in Unfold on Unfold's own tracker adapters
* File reports through Ploeg

## Decision Outcome

Chosen option: "Its own component that any application embeds", because it is the only option that removes Unfold's tracker adapters without giving Ploeg a job that is not agent work, and it gives every application the same reporter.

* The reporter is two parts: a browser part (the dialog, the DOM screenshot, markup, the console and request buffers, the draft and the follow-up view) and a small server part that stores a report, files it, retries for 24 hours and follows the issue.
* The reporter knows nothing about Unfold, Ploeg or the application that embeds it. The application gives it a report target, a signed-in person and the private-region selector (`[data-private]` in Unfold).
* It files through the tracker contract of the homelab RFC: providers that declare the `create` capability, held to the same conformance suite as Ploeg's providers. Forgejo and Vikunja first, as today.
* Unfold embeds it and keeps the top-bar button, the `!` shortcut and the palette command. Its behaviour for people does not change.
* ADR-0024's capture, privacy and attachment rules carry over unchanged. Only the owner of the code and the tracker adapters move.
* Where the code lives, the package format and how the server part runs (in the embedding application's process or as its own service) are settled in the build ticket, before any code moves.

### Consequences

* Good, because Unfold loses the last reason it writes to trackers directly, which the homelab RFC needs for Unfold to talk only to Ploeg.
* Good, because Erfbeeld and later applications get the same reporter, with the same privacy rules, without depending on Unfold.
* Good, because it is the first consumer of the tracker contract that is not Ploeg, which tests that the contract is general.
* Bad, because a second deliverable needs its own release, versioning and Renovate pin in each application.
* Bad, because the move touches a shipped feature, so it needs a regression check on Unfold's current behaviour first.

### Confirmation

Accepted, not implemented. It is confirmed when Unfold files a report through the embedded reporter into the Forgejo and Vikunja fixtures with the same browser tests ADR-0024 names, `apps/unfold/src/tasks.ts` no longer contains the issue-filing functions, and a second application files a report with the same component.

## Pros and Cons of the Options

### Keep it in Unfold on Unfold's own tracker adapters

* Good, because nothing moves.
* Bad, because Unfold keeps a second set of tracker adapters next to Ploeg's, with its own credentials.
* Bad, because other applications cannot use the reporter without Unfold.

### File reports through Ploeg

* Good, because Ploeg already holds tracker providers and credentials.
* Bad, because Ploeg would gain a job that is not agent work, against Ploeg's own scope.
* Bad, because every application that wants a reporter would need a Ploeg install.

## More Information

* 2026-10-18: decided by the owner (option A of homelab VIK-2142), from the homelab RFC Trackers are a port, decision 2.
