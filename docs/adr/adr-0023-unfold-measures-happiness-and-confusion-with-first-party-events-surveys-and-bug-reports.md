---
status: proposed
date: 2026-10-05
decision-makers: Ryan Grippeling
---

# Unfold measures happiness and confusion with first-party events, surveys and bug reports

## Context and Problem Statement

On 2026-10-05 the owner found 15 Work Items under Needs you and could not tell what each one needed, and asked for data: a way to measure happiness and confusion along user journeys, short questionnaires that start on certain paths and anomalies, and a bug report as easy as Marker.io. Unfold collects nothing of this today. It has no client events, no error reporting, no product-event table, no feedback path, and no tracker integration that can create an issue. Which tools, if any, should Unfold use, and where does the data live?

The [research record](../research/2026-10-05-product-insight-tooling.md) compares about forty analytics, replay, survey and bug-reporting tools and summarises the Dutch and EU rules. This ADR covers the Unfold web application, its VS Code extension and the owner's homelab instance. The marketing site keeps its own privacy promise under [ADR-0016](adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md).

## Decision Drivers

* The useful signals depend on Unfold's own state, such as a resolved item coming back or an undone verdict.
* Unfold's CSP is `'self'` only, and its VS Code webviews allow no network access.
* Screens show clients' source code, diffs and pull-request text.
* Self-hosted installs must get every feature without a paid service ([ADR-0005](adr-0005-unfold-is-offered-to-agencies.md)).
* In an agency, per-person telemetry is employee monitoring: works council consent (WOR art. 27(1)(l)) and a DPIA.
* Bug reports must land in Forgejo and Vikunja, the trackers Unfold runs on.

## Considered Options

* First-party events, confusion signals, surveys and bug reports, with Grafana Faro as an optional sink
* Self-hosted OpenReplay for analytics and replay, plus Formbricks for surveys
* PostHog (EU cloud or self-hosted) for analytics, replay and surveys
* SaaS tools: Microsoft Clarity or Hotjar for behaviour, Marker.io for bug reports
* Keep measuring nothing

## Decision Outcome

Chosen option: "First-party events, confusion signals, surveys and bug reports, with Grafana Faro as an optional sink", because it is the only option that sees Unfold's own state, keeps the CSP unchanged, works in the VS Code webviews, files into Forgejo and Vikunja, and keeps every byte inside the tenant unless an operator exports it.

* **Product events.** Unfold's server stores `product_event` rows with `tenant_id`, a pseudonymous actor (a per-tenant HMAC of the user id, rotated every 13 months), `name`, `work_item_id`, `shift_id`, `props` without screen text, and `at`. The browser posts batches to its own origin. VS Code webviews post through the extension host, and the extension honours `vscode.env.isTelemetryEnabled`. Events are kept 25 months, then only aggregates remain.
* **Confusion signals** come from a small detector in Unfold's front end: rage clicks (3 within 1 s and 100 px), dead clicks (no response within 100 ms), list-detail U-turns and link-out bursts. They are product events.
* **Micro-surveys** are decided in [ADR-0025](adr-0025-unfold-asks-one-ease-question-on-anomalies-and-a-random-baseline.md): one ease question on anomalies and a random baseline, capped on the server.
* **Report a problem** is decided in [ADR-0024](adr-0024-bug-reports-are-filed-by-unfold-into-the-tenants-own-tracker.md): a DOM screenshot with private regions blurred, filed by Unfold's server into the tenant's own tracker.
* **Export.** An optional sink on the server, never in the browser, sends events as Faro events or OTLP logs to a collector the operator names. The owner's instance sends them to the homelab's Alloy `faro.receiver`, and Grafana shows them as stat tables. Masked session replay through `@grafana/faro-instrumentation-replay` runs on the owner's instance only.
* **Defaults per tenant:**
  * Product events and confusion signals are on, as aggregates.
  * Surveys are on, and each person can opt out.
  * Bug reports are on; a person starts each one.
  * Replay and per-person views are off. A tenant admin can switch them on, after a notice that this needs works council consent and a DPIA.
* **Never:**
  * a third-party script in Unfold's CSP;
  * SaaS session replay of screens with client code;
  * per-person scores of agency staff;
  * survey answers used in performance reviews.

Not implemented yet.

### Consequences

* Good, because the signals join directly to Work Items, Shifts and verdicts, which no external tool can do.
* Good, because the CSP, the VS Code webview policy and the extension's "no analytics" promise stay true by default.
* Good, because self-hosters get the whole feature with no extra service, and the owner's Grafana stack is reused.
* Good, because a user-started bug report and aggregate events sit inside the Telecommunicatiewet art. 11.7a lid 3(b) analytics exemption, as far as the research could tell.
* Bad, because Unfold builds and maintains a survey prompt, an annotation canvas and a detector that products already offer.
* Bad, because there are no heatmaps and no replay viewer beyond Grafana until a trigger in the research record reopens OpenReplay.
* Bad, because Ploeg's tracker providers have no create path, so filing reports adds one to Unfold's own tracker clients.

### Confirmation

* A test fails if the CSP string in `apps/unfold/src/http.ts` gains any origin other than `'self'`.
* Store tests show that product events and survey answers carry `tenant_id` and no screen text, and that the retention job removes rows older than 25 months.

## Pros and Cons of the Options

### First-party events, confusion signals, surveys and bug reports, with Grafana Faro as an optional sink

* Good, because it is the only option meeting every decision driver.
* Bad, because it is build work instead of configuration.

### Self-hosted OpenReplay for analytics and replay, plus Formbricks for surveys

OpenReplay (Paris, AGPL-3.0, 2 vCPU / 8 GB with ClickHouse) has replay, heatmaps, funnels and rage and dead clicks. Formbricks (Germany, AGPL core) has code triggers, hidden fields and cooldowns.

* Good, because both are EU companies and self-hostable.
* Bad, because both need remote origins and blob workers in the CSP, and neither works in the webviews.
* Bad, because they add ClickHouse, Postgres, Valkey, SpiceDB and Cube beside Ploeg's Postgres.
* Bad, because Formbricks' community edition has one workspace, and identification and segments are Enterprise-only.
* Bad, because neither files bug reports into Forgejo or Vikunja.

### PostHog (EU cloud or self-hosted) for analytics, replay and surveys

* Good, because it has the broadest feature set, including `$rageclick`, `$dead_click`, surveys and an EU region in Frankfurt.
* Bad, because PostHog is a US company and self-hosting is an unsupported "hobby" deployment of about 16 GB, with paid features cloud-only.
* Bad, because text is not masked by default, and its heatmap viewer iframes the app.

### SaaS tools: Microsoft Clarity or Hotjar for behaviour, Marker.io for bug reports

* Good, because Marker.io (Brussels, data in Ireland) has the most polished reporting and no build time.
* Bad, because Clarity gives Microsoft access to the data, and both Clarity and Hotjar would replay client code to a third party.
* Bad, because Marker.io needs `'unsafe-inline'` styles and a third-party frame, cannot run in the webviews, has no Forgejo or Vikunja integration, and puts console, network and replay behind its US$ 149 a month tier.

### Keep measuring nothing

* Good, because it costs nothing and raises no privacy question.
* Bad, because the Needs-you redesign and the KPIs in [kpis.md](../reference/kpis.md) stay guesses.

## More Information

* 2026-10-05: proposed after a five-agent survey; record and evidence in [docs/research/2026-10-05-product-insight-tooling.md](../research/2026-10-05-product-insight-tooling.md). Design in [RFC-0001](../design/rfc-0001-product-events-and-confusion-signals.md); the bug-report and survey parts are split into ADR-0024 and ADR-0025.
* Related: [ADR-0009](adr-0009-one-tenant-per-agency.md) (only anonymous counts leave a tenant without opt-in), [ADR-0017](adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md) (tenant scoping), the [works council and DPIA pack](../reference/run-cards-works-council-pack.md), and KPI data ticket D2 in [kpis.md](../reference/kpis.md), which becomes a product event under this ADR.
* The research record lists the triggers that reopen this decision.
