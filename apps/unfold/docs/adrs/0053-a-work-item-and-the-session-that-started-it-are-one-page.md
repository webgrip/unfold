---
status: proposed
date: 2026-10-18
decision-makers: Ryan Grippeling
review-by: 2027-01-18
---

# A Work Item and the session that started it are one page

## Context and Problem Statement

On 2026-10-18 the owner looked at the Work Item layouts in Labs (Thread, Night cockpit, Logbook and three more) and said they did not understand why a session and a Work Item are two pages, and that the layouts they liked had lost the logs. Asked for one page out of everything.

Since managed execution, every session someone starts in Unfold runs in Ploeg as a Work Item ([system ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md), [ADR-0044](0044-sessions-run-in-ploeg-with-a-harness-chosen-per-session-and-interaction-kept.md)). So one piece of work had two pages: `#session/<id>` with the questions, permission requests, Pause, Resume, Cancel, changes, checks, budget and review; and `#work/<id>` with the Runs, the flight, the Asks and the context. The layouts drew each Run as a ticket whose "Open the Run" link pointed at a Run list they no longer had, so the transcript and the pod logs were unreachable from them.

## Decision Drivers

* A person follows one piece of work in one place, whatever started it.
* The logs of a Run are where a person checks what the agent did; they sit with the Run, not on another page.
* No new contract: the session routes and Ploeg's Work Item routes stay as they are.
* The current page stays for everyone until the owner promotes the new one.

## Considered Options

* **One Work Item page, the `work.layouts` Labs flag: the unified layout grows the session's parts and the Run bodies, and a session link opens its Work Item**
* Keep two pages and link them better
* Keep six layouts and add logs to each

## Decision Outcome

Chosen option: "**one Work Item page**", because the Work Item is the unit Ploeg runs and every session that runs has one, so the Work Item page can carry everything the session page did. The other five layouts are removed; their best parts stay on the one page: the flight on a dark ground (Night cockpit), the log with clock times and the spend tape (Logbook), and the conversation entries and intent bar (Thread).

On the page, each Run in the log opens in place to the same body the current page shows: its account, failure, health, findings, what the agent did (Ploeg's transcript) and its pod logs. The Run that works now is open. When an Unfold session started the Work Item, the page loads that session (`attachSession` in `public/views/session.js`) and shows its questions, permission requests, delivery and review above the flight, its Pause, Resume, Cancel and Export in the header, its evidence (activity, gateway calls, changes, checks and hand-off) as an Evidence view beside Log, Brief and Trace, and its budget, repository hand-off, tool approval and details beside the views. `#session/<id>` opens `#work/<id>` once Ploeg has admitted the session; a session without a Work Item yet, or a standalone demo session, keeps its own page.

### Consequences

* Good, because a person never has to know which of two pages holds a control.
* Good, because the logs are back, next to the Run they belong to.
* Bad, because the page now loads the session's history and event stream as well as Ploeg's detail.
* Neutral, because behind a Labs flag the current Work Item page and the session page stay what everyone else sees.

### Confirmation

`test/live-work.test.mjs` checks that every started Run is asked for its body, the working Run opens, each Run of a machine-ended burst opens on its own, and a session's parts render with no link to a separate session page. On 2026-10-18 the page was checked in headless Chromium against `npm run demo` with the flag on: a running Work Item opens its working Run with "What the agent did" and "Pod logs", and a session whose binding was stubbed to a demo Work Item redirected to that Work Item and showed its review, evidence, budget and hand-off with no script error. Not checked: a real Ploeg-bound session (the unified demo needs PostgreSQL, not installed here).

## More Information

### Choices to re-check

* Promote the page to everyone and retire `#session/<id>` and the current Work Item page once the owner has used it.
* The session's Activity view and Ploeg's transcript show the same agent work from two records; once the page is promoted one of them can go.
