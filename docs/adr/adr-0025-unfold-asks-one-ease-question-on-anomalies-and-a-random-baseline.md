---
status: accepted
date: 2026-10-05
decision-makers: Ryan Grippeling
---

# Unfold asks one ease question on anomalies and a random baseline

## Context and Problem Statement

The owner wants short questionnaires that start on certain paths and anomalies, for example when someone undoes an action or an item they resolved comes back. The [KPI proposal](../reference/kpis.md) also asks for a monthly 1–5 check on review effort. Unfold has no way to ask anything today. What should Unfold ask, when, how often, and with which tool?

This covers the Unfold web application and its VS Code extension. Design detail is in [RFC-0003](../design/rfc-0003-one-question-surveys.md); the tool and method comparison is in the [research record](../research/2026-10-05-product-insight-tooling.md).

## Decision Drivers

* The triggers depend on Unfold's own state, which no survey tool can see.
* Answers must join to the event and Work Item that triggered them.
* People must not be pestered: one question, rarely, and a permanent way out.
* Caps must hold across browsers, devices and VS Code webviews.
* Triggered answers skew negative, so they need a baseline to mean anything.

## Considered Options

* Unfold's own one-question prompt, with triggers and caps on the server
* Formbricks community edition, self-hosted, fired from Unfold's code
* PostHog surveys in headless mode
* A periodic survey by email or form, outside the product

## Decision Outcome

Chosen option: "Unfold's own one-question prompt, with triggers and caps on the server", because the triggers already live in Unfold's server, the prompt needs no CSP exception, and server-side caps work in every client.

* **The question.** One question in Single Ease Question form: "Overall, how difficult or easy was it to …?", on 7 points from Very difficult to Very easy, plus an optional line of text. The task after "to" changes per trigger.
* **The prompt** is docked, not modal. It says why it was asked, and offers "Don't ask me again", "Not now" and "Send".
* **Triggers:**
  * after an undo;
  * when an item the person resolved comes back within 7 days;
  * after a burst of link-outs;
  * after rejecting a suggested verdict;
  * the first time the Needs you list is cleared;
  * the monthly review check for K6.
* **Baseline.** A random 2 % of people per week are asked the same question after an ordinary action, at most once per 12 weeks.
* **Caps on the server:**
  * one prompt per person per 14 days;
  * one per trigger per 90 days;
  * "Not now" counts as shown;
  * "Don't ask me again" stops all prompts until the person turns them back on.
* **Reporting.** Results are reported per trigger with their n, next to the baseline, and are never pooled into one score. Groups under 5 people are suppressed. Answers are never used to assess individual people.

Accepted on 2026-10-05. Not implemented yet.

### Consequences

* Good, because each answer is tied to what just happened, so a low score points at a specific screen and path.
* Good, because the baseline separates "this path is hard" from "people answer low when something went wrong".
* Bad, because there is no no-code survey editor: changing a question is a code change.
* Bad, because at the expected 8–25 % response, small tenants will see few answers per trigger for months.

### Confirmation

Survey engine tests prove the 14-day and per-trigger caps, that "Don't ask me again" also stops the baseline, and that the baseline picks about 2 % of a synthetic population per week. A browser test proves no prompt appears while a dialog is open or a field has focus.

## Pros and Cons of the Options

### Unfold's own one-question prompt, with triggers and caps on the server

* Good, because it meets every driver.
* Bad, because Unfold builds the prompt and the reporting itself.

### Formbricks community edition, self-hosted, fired from Unfold's code

Formbricks GmbH is in Germany; the core is AGPL-3.0.

* Good, because `formbricks.track()`, hidden fields for the event id, recontact settings and a cooldown are free.
* Bad, because the CSP must allowlist its host, and its scripts are inserted without a nonce.
* Bad, because the survey renderer is about 279 KB gzip.
* Bad, because v6 self-hosting adds six services, including SpiceDB and Cube.
* Bad, because the community edition has one workspace, and identification and segments are Enterprise-only.
* Bad, because its frequency state lives in `localStorage`, which VS Code webviews do not keep.

### PostHog surveys in headless mode

* Good, because Unfold could render its own UI against PostHog's targeting.
* Bad, because it brings in PostHog: a US company, and an unsupported self-hosting mode.

### A periodic survey by email or form, outside the product

* Good, because it needs no product work.
* Bad, because it cannot ask about the moment that went wrong, and recall weeks later is poor.

## More Information

* 2026-10-05: proposed with [ADR-0023](adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md) and [ADR-0024](adr-0024-bug-reports-are-filed-by-unfold-into-the-tenants-own-tracker.md); design in [RFC-0003](../design/rfc-0003-one-question-surveys.md).
* Re-open with Formbricks community edition as the renderer if someone who does not write code needs to author surveys.
* 2026-10-05: accepted by the owner as proposed, together with the open questions of RFC-0003 answered as proposed.
