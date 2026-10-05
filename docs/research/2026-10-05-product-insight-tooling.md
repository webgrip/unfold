# Measuring happiness and confusion in Unfold, and reporting bugs from it

Date: 5 October 2026, against `origin/development` at `8be5e332` with Ploeg pinned at `34e6d57`. This is a record. The decisions it supports are [ADR-0023](../adr/adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md) (events, confusion signals, defaults), [ADR-0024](../adr/adr-0024-bug-reports-are-filed-by-unfold-into-the-tenants-own-tracker.md) (bug reports) and [ADR-0025](../adr/adr-0025-unfold-asks-one-ease-question-on-anomalies-and-a-random-baseline.md) (surveys), **accepted on 2026-10-05**. The designs are [RFC-0001](../design/rfc-0001-product-events-and-confusion-signals.md), [RFC-0002](../design/rfc-0002-report-a-problem.md) and [RFC-0003](../design/rfc-0003-one-question-surveys.md), with mockups. Nothing described here as a table, route, setting or screen is implemented.

> **Method.** Five research agents: product analytics, session replay, heatmaps and frustration signals (self-hostable or EU); event-triggered in-app micro-surveys plus the survey-method evidence; visual bug reporting (Marker.io and its alternatives); EU and Dutch law on UX telemetry, session replay and employee monitoring; and a read-only seam map of this repository and `homelab-cluster`. Their raw reports are in [evidence/2026-10-05-product-insight/](evidence/2026-10-05-product-insight/). These claims were checked first-hand rather than taken from an agent: `@grafana/faro-instrumentation-replay` is at 2.12.1 (2026-09-22) under Apache-2.0, and its README defaults are `maskAllInputs: true` and `maskTextSelector: '*'`; [faro-web-sdk#2314](https://github.com/grafana/faro-web-sdk/pull/2314) "report rage, dead and error clicks" merged on 2026-10-01; `@zumer/snapdom` 3.3.0, `html-to-image` 1.11.13 and `rrweb` 2.1.7 are MIT; forgejo.webgrip.dev exposes `issueCreateIssueAttachment` on `POST /repos/{owner}/{repo}/issues/{index}/assets`; Unfold's CSP is the one quoted below. The text of Telecommunicatiewet art. 11.7a renders client-side and is quoted from the law-research report.

## Verdict

**Build Unfold's insight layer first-party, and use Grafana only as an optional destination.** Unfold records its own product events, detects frustration in its own front end, asks its own one-question surveys and files its own bug reports straight into Forgejo or Vikunja. No third-party script enters the product. Grafana Faro, which the homelab already receives, is where the owner's own instance sends events and masked replays; self-hosters can point the same export at their own collector or leave it off.

Every external tool fails at least one hard constraint, and the layer that matters most cannot be bought:

1. **The useful signals come from Unfold's own state.** "An item you resolved came back within 7 days", "three link-outs for one decision", "you undid the suggested verdict": no analytics or survey tool can see these. A tool would still need Unfold to compute them and call `track()`. What a tool adds on top is a renderer and a frequency cap.
2. **Unfold's CSP is `'self'` only, and its VS Code webviews have `connect-src 'none'`.** Marker.io needs `style-src 'unsafe-inline'`, a third-party frame and four connect origins. Formbricks, PostHog, Usersnap and Sentry each need remote origins, nonce plumbing or `worker-src blob:`. Three application ADRs already refused third-party scripts ([0026](../../apps/unfold/docs/adrs/0026-run-cards-render-in-a-card-runtime-with-skin-packs-and-themes.md), [0028](../../apps/unfold/docs/adrs/0028-the-forge-skin-renders-run-cards-in-3d-with-vendored-three-js.md), [0031](../../apps/unfold/docs/adrs/0031-card-themes-a-card-designer-and-generated-art.md)), and the site's [ADR-0016](../adr/adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md) chose "no new third party, CSP unchanged".
3. **No bug-reporting product files into Forgejo or Vikunja.** Marker.io, Usersnap, Gleap, BugHerd, Userback, Jam, Sentry and OpenReplay integrate with GitHub, GitLab, Jira and ClickUp, and at best a generic webhook. Both trackers Unfold runs on accept an issue plus attachments in two documented REST calls.
4. **Screens show clients' source code, diffs and pull-request text.** Sending replays to SaaS puts client code with a third party. That breaks the promise in [ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md) and the tenancy boundary in [ADR-0009](../adr/adr-0009-one-tenant-per-agency.md) and [ADR-0017](../adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md).
5. **For an agency, this is employee monitoring.** Per-person telemetry in an agency's tenant is "geschikt voor" (suitable for) observing behaviour, so the works council's consent right in WOR art. 27(1)(l) applies from 50 staff. The AP's mandatory DPIA list names employee monitoring and behaviour observation. Defaults therefore have to be aggregate, pseudonymous and off for replay, which a first-party design can guarantee and a vendor SDK cannot.

**Zero absences worth stating:** Unfold has no telemetry at all today. There is no client event, error report, product-event table or "report a problem" path. No tracker integration can create an issue; they only comment, assign and update ([evidence: seam map](evidence/2026-10-05-product-insight/seam-map.md) §2, §6).

## 1. The four needs, and what Unfold has today

| Need | What it means here | Today |
| --- | --- | --- |
| Journeys | Which path a person took to resolve a Work Item, how long, how many tabs, whether they undid it | Ploeg's `audit_log` records what Ploeg did ([store.go:165](../../apps/ploeg/pkg/store/store.go)), not what a person saw or tried. Unfold's server logs a few JSON lines such as `task.<action>` ([task-handoff.ts:150](../../apps/unfold/src/task-handoff.ts)). No UI events. |
| Confusion | Rage clicks, dead clicks, list-detail U-turns, link-out bursts, undo right after acting; optionally a masked replay | Nothing. [attention.js](../../apps/unfold/public/core/attention.js) is local only. |
| Happiness | A short question at the right moment, plus a baseline | [kpis.md](../reference/kpis.md) proposes a monthly 1–5 check for K6 and data ticket D2 (`review.viewed` active seconds). Neither exists. |
| Bug reports | One button: annotated screenshot, console errors, failed requests, ids, filed into the tracker | Nothing in the app. [CONTRIBUTING.md:46](../../apps/unfold/CONTRIBUTING.md) points at a Forgejo issue on a renamed repository. No issue templates exist. |

The constraints that decide the tool choice, all read from the repository:

- **CSP** on every Unfold response ([http.ts:139](../../apps/unfold/src/http.ts)): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`. No `worker-src`, so blob workers are blocked.
- **VS Code webviews** ([panel.ts:196](../../apps/unfold/extensions/vscode/src/panel.ts)) set `connect-src 'none'` and a per-load script nonce. Any webview event has to travel through `postMessage` to the extension host. The webview iframe has no `display-capture`, so `getDisplayMedia` screenshots cannot work there. The extension README promises "no analytics or background repository uploads".
- **Open source, no feature held back** ([ADR-0005](../adr/adr-0005-unfold-is-offered-to-agencies.md)): whatever measures happiness must run in a self-hosted install with no paid service behind it.
- **Tenancy** ([ADR-0009](../adr/adr-0009-one-tenant-per-agency.md)): "An agency can opt in to let Unfold keep anonymised traces to improve agents; without that, only anonymous counts such as delivery rate and spend per size remain." The same rule has to hold for UX data.
- **Homelab**: Alloy's `faro.receiver` is deployed and public, guarded only by a CORS list that names webgrip.nl and twente.dev, not Unfold ([evidence: seam map](evidence/2026-10-05-product-insight/seam-map.md) §7). Grafana already holds DevEx survey dashboards (`devex-scorecard`, `devex-telemetry-correlation`).

## 2. Layer map

| Layer | Unfold today | Best external candidate | Why it does not carry the layer | Chosen |
| --- | --- | --- | --- | --- |
| Product events and journeys | none | OpenReplay (FR, AGPL, 8 GB), PostHog (US, EU cloud) | Neither sees Unfold's domain state; both need a second datastore (ClickHouse) beside Ploeg's Postgres | **First-party** `product_event` rows, tenant-scoped |
| Frustration signals | none | Faro `#2314` (unreleased), OpenReplay, PostHog `$rageclick`, Sentry | Detection is about 100 lines; every tool brings a remote SDK or blob worker | **First-party** detector, same events |
| Session replay | none | Faro replay (Apache-2.0, masks all by default), OpenReplay `privateMode`, Sentry | Consent-only per CNIL draft; client code on screen; works council | **Faro replay on the owner's instance only**; product default off |
| Heatmaps | none | OpenReplay, PostHog, Matomo plugin | Iframe viewers fail behind `frame-ancestors 'none'` and in webviews | **Not built**; reopen with OpenReplay (triggers) |
| Micro-surveys | none | Formbricks CE (DE, AGPL) | 279 KB renderer, 6+ containers incl. SpiceDB, one workspace in CE, state in `localStorage` | **First-party** one-question prompt |
| Bug reports | none | Marker.io (BE, EU data) | No Forgejo/Vikunja, needs `'unsafe-inline'` and frames, no webview | **First-party** "Report a problem" |
| Export / dashboards | Grafana in homelab | Faro → Alloy → VictoriaLogs/Traces | Fits as a sink, not as the store | **Optional OTLP/Faro export** |

Nobody claims the join between a frustration signal and the Work Item, Shift and verdict it happened on. That join is the point of the exercise, and only Unfold can make it.

## 3. Tools, by layer

Full blocks with every URL are in the evidence files. What decides each verdict:

### Analytics, replay, frustration ([evidence](evidence/2026-10-05-product-insight/analytics-and-replay.md))

| Tool | HQ, data | Self-host | Frustration | Masks all text by default | Verdict for Unfold |
| --- | --- | --- | --- | --- | --- |
| **Grafana Faro** + replay | US vendor, your collector | Apache-2.0 SDK; Alloy already runs | rage, dead, error clicks merged 2026-10-01, unreleased | yes (`maskTextSelector: '*'`) | **Sink and owner-only replay.** No OSS replay viewer beyond a 0-star plugin; VictoriaLogs capacity for rrweb snapshots unverified |
| **OpenReplay** | Paris, FR | AGPL-3.0 (tracker MIT); 2 vCPU / 8 GB, ClickHouse | click rage, dead click, excessive scroll | opt-in `privateMode` | **Watchlist** for heatmaps and a replay UI |
| PostHog | US; EU cloud Frankfurt | "hobby" only, unsupported, 16 GB, paid features cloud-only | `$rageclick`, `$dead_click` | no (opt-in) | Rejected: US vendor, unsupported self-host |
| Sentry | US; EU region | FSL-1.1; 16–32 GB | in replay timeline | yes | Rejected as a dependency; FSL forbids reselling it |
| OpenPanel | Stockholm, SE | AGPL-3.0, ClickHouse | none found | yes | Rejected: no frustration signals |
| Matomo + HSR plugin | NZ; cloud Frankfurt | GPL-3.0 + €219–659/yr plugin | none documented | no global switch | Rejected: no signals, iframe playback |
| Microsoft Clarity | US, Azure; Microsoft has access | no | yes | strict mode | **Never**: client code to Microsoft, consent enforced in the EEA |
| Hotjar/Contentsquare | FR; AWS/Azure | no | yes | no | **Never**: SaaS replay of client code |
| Highlight.io | — | — | — | — | Dead: hosted shut down 2026-02-28 |
| Smartlook | CZ, Cisco | — | — | — | End of sale 2026-05-31 |
| Plausible, Umami, Pirsch, Simple Analytics | EU / mixed | yes / partly | none | n/a | Pageview analytics; fine for apps/site only if its "no analytics" promise is changed |

### Micro-surveys ([evidence](evidence/2026-10-05-product-insight/micro-surveys.md))

Formbricks is the only strong third-party fit: German, AGPL core, `formbricks.track("key")` code triggers, hidden fields that carry our event id, recontact and a cooldown in the free edition, webhooks. It is not chosen because user identification and segments are Enterprise-only, the community edition allows one workspace (one instance per tenant), v6 self-hosting needs six containers including SpiceDB and Cube, the survey renderer is 279 KB gzip, and its frequency state lives in `localStorage`, which VS Code webviews do not keep. PostHog surveys inherit PostHog's problems. Survicate (PL), Refiner (FR), Usersnap (AT) and Gleap (AT) are EU but SaaS-only. Typeform and Tally are forms without a trigger engine.

The method evidence that shapes the build:

- **Ask about ease, not satisfaction.** The Single Ease Question ("Overall, how difficult or easy did you find this task?", 7 points, Very difficult to Very easy) is validated against task completion, time and errors ([MeasuringU](https://measuringu.com/evolution-of-seq/), [NN/g](https://www.nngroup.com/articles/measuring-perceived-usability/)). CSAT measures satisfaction with an interaction, which is not what "was this clear" asks.
- **Expect 8–25 % response.** Survicate's 2025 benchmark puts B2B at 8.18 % and SaaS at 7.74 %; Refiner reports 26–27 % for in-app web surveys. Both are vendor data.
- **Anomaly triggers skew negative.** Google's HaTS paper says passively offered forms are biased toward people having a problem, and samples per user, not per page view, with a 12-week re-invite gap ([HaTS](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/43221.pdf)). So each trigger is reported on its own, never pooled into one "satisfaction" figure, and a small random baseline runs beside them.
- **Fatigue is real.** Earlier surveys depress later response, for example from 70 % to 44 % ([Porter et al. 2004](https://eric.ed.gov/?id=EJ760543)). Formbricks defaults to a 7-day cooldown across all surveys.

### Bug reporting ([evidence](evidence/2026-10-05-product-insight/bug-reporting.md))

| Tool | HQ, data | Forgejo / Vikunja | Works under Unfold's CSP | Webview | Price | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Marker.io** | Brussels; AWS Ireland | none (webhook on Team) | no: `'unsafe-inline'` styles, frame, 4 connect origins | no | Team US$ 149/mo annual; Starter lacks console, network, replay, webhooks | Rejected for the app |
| Usersnap | Linz, AT; AWS EU | none (webhook €459/mo) | no: `*.usersnap.com`, Google Fonts | no | €49–459/mo | Rejected |
| Sentry feedback widget | US; EU region | none (open request [gitea#34371](https://github.com/go-gitea/gitea/issues/34371)) | with `tunnel` and `workerUrl` | screenshot fails (`getDisplayMedia`) | free–US$ 80/mo | Rejected as the UI |
| GlitchTip | — | — | — | — | MIT | **Trap**: ingests feedback but drops `attachment` and `replay_*` items |
| Bugsink | NL | — | — | — | PolyForm Shield | **Trap**: discards feedback entirely |
| Gleap, BugHerd, Userback, Jam | AT / AU / AU / US | none | no | no | US$ 29–299/mo | Rejected: US data, or pivoted to AI support |
| FasterFixes, BugDrop, SitePing, Crikket | OSS, 39–151 stars | none | — | — | — | Reference designs only |

The parts a first-party reporter needs are all MIT and work without a remote origin: `@zumer/snapdom` or `html-to-image` rasterise the DOM into a data URL (allowed by `img-src 'self' data:`), and rrweb records a ring buffer. **marker.js is "linkware"**: free only with a visible link to markerjs.com, US$ 499–990 commercial, and an OEM licence at US$ 2,990 for "use in developer tools". Draw the annotation canvas in house instead.

Filing needs two calls per tracker, both documented: Forgejo `POST /repos/{owner}/{repo}/issues` then `POST …/issues/{index}/assets` (multipart field `attachment`; default `MAX_FILES` 5, `.png .json .log .gz` allowed); Vikunja `PUT /projects/{id}/tasks` then `PUT /tasks/{id}/attachments` (multipart field `files`). Unfold today only writes comments and assignees to Vikunja ([tasks.ts:442-452](../../apps/unfold/src/tasks.ts)); Ploeg's `TrackerProvider` has no `Create` ([provider.go:100](../../apps/ploeg/pkg/provider/provider.go)).

## 4. What the law says, condensed ([evidence](evidence/2026-10-05-product-insight/eu-privacy-law.md))

Not legal advice; a summary of what regulators and courts have said, to be read with the [works council and DPIA pack](../reference/run-cards-works-council-pack.md) that already exists for Run Cards.

1. **The Dutch analytics exemption is in the statute.** Telecommunicatiewet art. 11.7a lid 3(b), in force since 15-08-2026, exempts access "mits dit geen of geringe gevolgen heeft voor de persoonlijke levenssfeer" to learn about the quality or effectiveness of the service. The AP names Matomo, Plausible, OpenPanel and Superset as acceptable when configured well. A GDPR basis and a privacy notice are still needed.
2. **Cookieless is not an exemption.** EDPB Guidelines 2/2023 §33 put JavaScript that sends information back "clearly" in scope, with or without cookies. Only the exemption, or consent, covers it.
3. **Own account only.** CNIL's audience-measurement exemption excludes a vendor reusing the data, cross-referencing with other processing and cross-site identifiers. It recommends a 13-month identifier lifetime and at most 25 months of data.
4. **Session replay needs consent.** CNIL's draft recommendation of 25-02-2026 (consultation closed 22-04-2026; no final version found) makes masking every category the default, recommends sampling or trigger-based capture, a random short-lived session id, and "a few months" of retention for friction analysis, or "a few hours" for support replays.
5. **Agencies are employers.** WOR art. 27(1)(l) gives the works council a consent right on facilities "gericht op of geschikt voor" observing behaviour or performance, from 50 staff; a decision without it is void if the council objects within a month. The AP requires a legal basis other than consent, necessity, informing staff, prior works council consent and a DPIA for systematic monitoring. Its DPIA list names "controle werknemers" and "observatie en beïnvloeding van gedrag".
6. **A processor that uses data for its own purposes becomes a controller** for that processing (EDPB 07/2020 §81). If hosted Unfold wants UX data to improve the product, the data processing agreement must say so, and the data should be aggregated before it leaves the tenant.
7. **US-owned services carry transfer risk.** The Data Privacy Framework survived the General Court (T-553/23, 03-09-2025); the appeal C-703/25 P is pending, and *Trump v. Slaughter* (29-06-2026) removed the FTC independence the framework leans on. EU hosting by a US company still faces the CLOUD Act.
8. **AI Act**: scoring individual staff from telemetry would move toward Annex III 4(b) high-risk, applicable from 2 December 2027. Plain UX telemetry is not an AI system.

A user-initiated bug report plausibly counts as a service "explicitly requested by the user" (WP29 Opinion 04/2012). That is an inference, not a regulator statement.

## 5. The design that survives all of this

**One insight layer inside Unfold, five parts, each off or aggregate by default.**

1. **Product events.** Unfold's server records `product_event` rows: `tenant_id`, a pseudonymous `actor` (a per-tenant HMAC of the user id, rotated every 13 months), `name`, `work_item_id`, `shift_id`, `props` (JSON, no free text from screens), `at`. Names follow the event model in the Needs-you design: `needs_you.verdict_shown`, `needs_you.command_sent`, `needs_you.undone`, `link_out.opened`, `work_item.back_in_needs_you`. The browser posts batches to `POST /api/insight/events` on its own origin (`connect-src 'self'` holds). VS Code webviews post through the extension host, and the extension honours `vscode.env.isTelemetryEnabled`. Retention: 25 months, then aggregates only.
2. **Confusion signals.** A small detector in `public/core/` emits `ui.rage_click` (3 clicks within 1 s and 100 px), `ui.dead_click` (no DOM or route change within 100 ms on an interactive element), `ui.u_turn` (detail opened and left within 3 s, twice), `ui.link_out_burst` (3 or more link-outs before one decision). These are the thresholds Faro's merged PR and PostHog use.
3. **Micro-surveys.** One non-modal prompt, the 7-point SEQ question plus an optional text line, rendered by Unfold's own components. Triggers are server-side rules on product events: after an undo, when a resolved item returns within 7 days, after a link-out burst, after a rejected suggested verdict, after the first cleared list, and a random 2 % baseline per person per week. Caps are kept on the server: one prompt per person per 14 days, one per trigger per 90 days, permanent dismiss. The answer stores the triggering event id. K6's monthly 1–5 check in [kpis.md](../reference/kpis.md) becomes one of these triggers.
4. **Report a problem.** A button in the shell and a palette command. It rasterises the page with snapdom, opens an in-house canvas (box, arrow, blur) with every code, diff and PR text region blurred by default, and attaches the last 50 console errors, the last 20 failed requests with bodies stripped, the route, the Work Item, Shift and Run ids, the app version and the browser. On the owner's instance it can also attach the last 60 s of a masked rrweb buffer. Unfold's server files it into the tenant's tracker (Forgejo or Vikunja first, then GitHub, GitLab and ClickUp) and shows the link. It is user-initiated, so it needs no background capture.
5. **Export.** An optional sink sends product events and confusion signals as Faro events or OTLP logs to a collector the operator names. On the owner's homelab instance this is Alloy's `faro.receiver` (add the Unfold host to its CORS list), and Grafana shows journeys and confusion as stat tables next to the existing DevEx dashboards. Replay through Faro's replay instrumentation, with its mask-everything defaults, is enabled on the owner's instance only.

Settings, per tenant: product events and confusion signals **on, aggregate** by default (the 11.7a lid 3(b) exemption); surveys **on** with permanent opt-out per person; bug reports **on** (user-initiated); replay and per-person views **off**, switchable only by a tenant admin, with a notice that switching them on needs works council consent and a DPIA. Unfold never builds per-person scores from this data.

## 6. Implementation path, cheapest first

1. **Report a problem**, Forgejo and Vikunja only. It is the most useful part today, has no legal friction, and teaches the tracker-create path that Ploeg's providers lack.
2. **Product events** for the Needs-you paths, plus a Grafana table on the owner's instance through the Faro sink. This gives the action counts that the Needs-you design could only estimate.
3. **Confusion detector**, emitting into the same events.
4. **Micro-survey engine** with server-side caps and the random baseline; move K6's monthly check onto it.
5. **Owner-only masked replay** through Faro's replay instrumentation, after confirming VictoriaLogs accepts its payloads.
6. **Hosted-phase work**: tenant settings and notices, an aggregate-only export from tenants, a DPIA and staff protocol template added to the works council pack, and data processing agreement wording.

**Never:** Microsoft Clarity, Hotjar or any SaaS session replay of screens that show client code; a third-party script in Unfold's CSP; replay on by default; per-person rankings or scores of agency staff; survey answers used in performance reviews; unmasking without the user's own action.

## 7. Recommendations

1. Accept ADR-0023 (done 2026-10-05, with ADR-0024 and ADR-0025): first-party events, confusion signals, surveys and bug reports; Grafana Faro as an optional sink.
2. Build "Report a problem" first, filing into Forgejo and Vikunja through the documented two-call paths.
3. Record the Needs-you event model as product events before building the Needs-you buttons, so the design's happiness scores get a baseline.
4. Use the SEQ wording and the HaTS sampling rules; report each trigger separately.
5. Keep the marketing site's "no analytics or trackers" promise. Pageview analytics there (Plausible CE or Pirsch, both EU) is a separate decision that changes [ADR-0016](../adr/adr-0016-site-sign-ups-are-stored-in-cloudflare-d1-in-the-eu.md)'s privacy text.
6. Do not adopt marker.js; its OEM licence applies to developer tools.
7. Do not route bug context through GlitchTip or Bugsink; both drop screenshots and replays.

## 8. Re-evaluation triggers

Any one of these reopens a part of this record:

- **Faro releases rage and dead clicks** (the first `@grafana/faro-web-sdk` release whose CHANGELOG lists [#2314](https://github.com/grafana/faro-web-sdk/pull/2314)): replace the first-party detector with Faro's, if it can run from a self-served bundle.
- **`@grafana/faro-instrumentation-replay` leaves `experimental/`**, or an OSS Grafana replay viewer passes 100 stars: consider masked replay as a tenant opt-in.
- **Someone who does not write code needs to author surveys**: run Formbricks CE as a renderer behind the same server-side triggers.
- **Heatmaps or a replay UI are needed beyond Grafana tables**: trial self-hosted OpenReplay with `privateMode: true` on the owner's instance.
- **CNIL adopts its final session-replay recommendation**, or the AP publishes guidance on replay or heatmaps: re-check the defaults in section 5.
- **The CJEU decides C-703/25 P**, or the Commission suspends the Data Privacy Framework: re-check every US-owned processor in the stack, not only telemetry.
- **The Digital Omnibus GDPR Art. 88a is adopted**: aggregate audience measurement may need no consent EU-wide; re-check the tenant defaults.
- **An external agency of 50 or more staff joins the pilot**: the DPIA and works council template in step 6 becomes a prerequisite, not a follow-up.
