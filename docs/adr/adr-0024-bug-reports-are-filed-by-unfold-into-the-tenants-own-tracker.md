---
status: accepted
date: 2026-10-05
decision-makers: Ryan Grippeling
---

# Bug reports are filed by Unfold into the tenant's own tracker

## Context and Problem Statement

Unfold has no way to report a problem from inside it. Error screens offer "Try again" or "Check the server log", the contributing guide points at a renamed repository, and there are no issue templates. The owner wants reporting as easy as Marker.io: an annotated screenshot plus the technical context, landing in the tracker without copying anything by hand. How does a report get from an Unfold screen into a tracker, and which tools does it use?

This covers the Unfold web application and its VS Code extension. Design detail is in [RFC-0002](../design/rfc-0002-report-a-problem.md); the tool comparison is in the [research record](../research/2026-10-05-product-insight-tooling.md).

## Decision Drivers

* Reports must land in Forgejo and Vikunja, the trackers Unfold runs on, and later in GitHub, GitLab and ClickUp.
* Unfold's CSP is `'self'` only, and VS Code webviews allow neither network access nor `display-capture`.
* Screens show clients' code, diffs and pull-request text.
* The person reporting should see and control everything that is sent.

## Considered Options

* Unfold captures in the browser and its server files into the tenant's tracker
* Marker.io with a webhook relay to Forgejo and Vikunja
* Sentry's User Feedback widget, self-hosted or on its EU region
* An open-source widget such as BugDrop or FasterFixes

## Decision Outcome

Chosen option: "Unfold captures in the browser and its server files into the tenant's tracker", because it is the only option that reaches Forgejo and Vikunja directly, keeps the CSP unchanged, works in VS Code webviews and keeps client code out of third-party services.

* A "Report a problem" button in the shell and a palette command, in the web app and the VS Code extension.
* The screenshot is a DOM rasterisation with an MIT library (`@zumer/snapdom`, or `html-to-image` as fallback). It is not a screen capture. Regions marked `data-private` (code, diffs, pull-request text, prompts, logs, secrets) are blurred before the person sees them.
* An in-house annotation canvas: box, arrow, text, blur and undo. marker.js is not used because of its licence.
* Attachments: recent console errors, failed requests without headers, query strings or bodies, and the ids and versions on screen. A masked 60-second replay is added only where the tenant has replay switched on. Each attachment can be unticked.
* Unfold's server stores the report first, then files it into the tenant's report target:
  * Forgejo: `issueCreateIssue`, then `issueCreateIssueAttachment`.
  * Vikunja: `PUT /projects/{id}/tasks`, then `PUT /tasks/{id}/attachments`.
  * Failed filings are retried for 24 hours.
* Nothing is captured in the background.

Accepted on 2026-10-05. Not implemented yet.

### Consequences

* Good, because a report arrives as a normal issue or task with its files, in the tracker the team already works in.
* Good, because the person sees exactly what is sent, and private regions are blurred by default.
* Good, because building `createIssue` per provider gives Unfold a tracker write path it lacks today.
* Bad, because Unfold maintains a screenshot pipeline and an annotation canvas instead of buying them.
* Bad, because a DOM rasterisation can miss some rendering, such as cross-origin images or canvas content, which a screen capture would show.

### Confirmation

A browser test files a report into a Forgejo fixture and a Vikunja fixture and asserts the issue, the attachments and the URL shown. A screenshot test asserts that a diff region is blurred. A component test fails if a component that renders code or pull-request text lacks `data-private`.

## Pros and Cons of the Options

### Unfold captures in the browser and its server files into the tenant's tracker

* Good, because it meets every driver.
* Bad, because it is build work.

### Marker.io with a webhook relay to Forgejo and Vikunja

Marker.io SRL is in Brussels and stores data in AWS Ireland.

* Good, because it has the most polished capture and annotation, with console, network and replay.
* Bad, because it needs `style-src 'unsafe-inline'`, a third-party frame and four connect origins.
* Bad, because it cannot run in VS Code webviews.
* Bad, because it has no Forgejo or Vikunja integration, so a relay would still be needed.
* Bad, because console, network, replay and webhooks start at US$ 149 a month (annual).

### Sentry's User Feedback widget, self-hosted or on its EU region

* Good, because it attaches errors and a replay, and masks all text by default.
* Bad, because its screenshot uses `getDisplayMedia`, which fails in webviews, and its editor only highlights and hides.
* Bad, because it has no Forgejo or Vikunja integration (see [gitea#34371](https://github.com/go-gitea/gitea/issues/34371)).
* Bad, because self-hosting needs 16–32 GB of RAM under the FSL licence.
* GlitchTip and Bugsink, the lighter Sentry-compatible servers, drop feedback screenshots and replays.

### An open-source widget such as BugDrop or FasterFixes

* Good, because they show the shape of a small reporter.
* Bad, because they are young (39 to 151 stars), integrate only with GitHub, Linear or Jira, and some are AGPL.

## More Information

* 2026-10-05: proposed with [ADR-0023](adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md) and [ADR-0025](adr-0025-unfold-asks-one-ease-question-on-anomalies-and-a-random-baseline.md); design in [RFC-0002](../design/rfc-0002-report-a-problem.md).
* 2026-10-05: accepted by the owner as proposed, together with the open questions of RFC-0002 answered as proposed.
