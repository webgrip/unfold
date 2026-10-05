<!-- Raw report of one research agent, 2026-10-05. Agent output, not verified line by line; the dossier cites what it relies on. -->

# Survey: product analytics, session replay, heatmaps and frustration signals, self-hostable or EU (checked 2026-10-05)

GitHub figures come from `gh api` on 2026-10-05: stars, license, last push and latest release. npm versions come from `npm view`. Anything I could not confirm against a primary source is marked UNVERIFIED.

## Headline findings

1. **Grafana Faro now has session replay and frustration signals.** This is the most relevant finding for the homelab stack.
   - `@grafana/faro-instrumentation-replay` (rrweb-based, experimental) has shipped since Faro 2.1. Current version is 2.12.1, released 2026-09-22. https://github.com/grafana/faro-web-sdk/tree/main/experimental/instrumentation-replay
   - By default it masks ALL text (`maskTextSelector: '*'`) and all inputs (`maskAllInputs: true`).
   - It sends rrweb events as ordinary Faro events through `api.pushEvent`. That means they travel through Alloy `faro.receiver` into Loki-compatible log storage.
   - PR #2314 "report rage, dead and error clicks" merged 2026-10-01 and is enabled by default. It is in the CHANGELOG under "Next", so not yet released. https://github.com/grafana/faro-web-sdk/pull/2314
   - Grafana Cloud Session Replay is in public preview, by enablement form. https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-applications/session-replay/
2. **Highlight.io is dead as an independent product.** Hosted service deprecated 2026-02-28. highlight.io redirects to launchdarkly.com (repo commit #10612, 2026-08-20). The last self-host docker release was 2025-08-08.
3. **Smartlook is end-of-life at Cisco.** End-of-sale 2026-05-31, last renewal 2026-08-31, support ends 2027-08-31. https://www.cisco.com/c/en/us/products/collateral/software/smartlook-com-eol.html
4. **PostHog self-hosting is "hobby" only and officially unsupported.** New Kubernetes deployments are no longer supported. https://posthog.com/docs/self-host

---

## Tool blocks

### PostHog
- **HQ and data:** US company (PostHog Inc.). Cloud EU runs on AWS eu-central-1 in Frankfurt, as an independent instance. https://posthog.com/docs/privacy/data-storage
- **Self-host:**
  - "Hobby" Docker Compose deployment under the MIT license; `ee/` is under a separate license.
  - Needs about 4 vCPU, 16 GB RAM and more than 30 GB disk. The stack includes ClickHouse, Kafka, Postgres and Redis.
  - Not supported, no guarantees. Advised limits are roughly 300k events and 1k recordings per month.
  - "All paid-plan features are Cloud-only."
  - "New deployments … using Kubernetes are no longer supported."
  - https://posthog.com/docs/self-host
  - The `posthog-foss` mirror is MIT, 721 stars.
- **Features:**
  - Funnels, paths and a custom events API: yes.
  - Session replay: yes.
  - Heatmaps: heatmap, scrollmap and clickmap. Toolbar view needs pay-as-you-go; the in-app view is limited to 3 pages on free. https://posthog.com/docs/toolbar/heatmaps
  - `$rageclick` (3 clicks within 30 px and 1 s) and `$dead_click` are autocaptured. https://posthog.com/docs/product-analytics/autocapture
  - Surveys: yes (1,500 responses per month free).
- **Privacy:**
  - Inputs masked by default. Text is NOT masked by default; `maskTextSelector: "*"` masks it all. `ph-no-capture` blocks elements. https://posthog.com/docs/session-replay/privacy
  - `cookieless_mode: 'on_reject'` / `'always'` is available. https://posthog.com/tutorials/cookieless-tracking
- **CSP:**
  - `script-src`, `connect-src` and `worker-src 'self' blob: data:` are needed.
  - `unsafe-eval` is only needed for the Toolbar "hedgehog mode". No `unsafe-inline`.
  - Extensions can be bundled so that only `connect-src` is needed. https://posthog.com/docs/advanced/content-security-policy
- **Heatmap and internal apps:** the heatmap viewer iframes your site, and the docs flag intranet issues. This does not fit an authenticated app with `frame-ancestors` (inference).
- **Pricing:** free tier is 1M events, 5,000 recordings and 1,500 survey responses per month; then about $0.00005 per event. Source is a third-party summary, because the official pricing page did not render: https://flexprice.io/blog/posthog-pricing-guide
- **Export:** batch exports to Postgres, S3, BigQuery, Snowflake, Redshift, Databricks and Azure Blob. Whether batch exports work on self-host or the free tier is UNVERIFIED. https://posthog.com/docs/cdp/batch-exports
- **Maturity:** 40,145 stars, daily pushes. posthog-js 1.435.9 published 2026-10-05.

### OpenReplay
- **HQ and data:** Paris, France (Asayer Inc., dba OpenReplay; some sources also list SF). https://www.verif.com/en/company/ASAYER-68d9c0c012992303384af500/ — Dedicated cloud in roughly 50 regions, EU included.
- **Self-host:**
  - AGPL-3.0 by default, `ee/` under its own license, and some directories MIT. The tracker is MIT.
  - Minimum 2 vCPU, 8 GB RAM, 50 GB disk. https://docs.openreplay.com/en/deployment/deploy-docker/
  - Stack: ClickHouse, Postgres and Valkey. v1.25 replaced Redis with Valkey, and v1.28 replaced MinIO with RustFS.
- **Features:**
  - Session replay, funnels and product-analytics cards (breakdowns, segments, actions, people).
  - Heatmaps, click maps and scroll maps, in the free OSS edition. https://openreplay.com/pricing
  - Search issue types: Click Rage, Dead Click, Excessive Scrolling, Bad Request, Missing Resources, Memory. https://docs.openreplay.com/en/v1.15.0/tutorials/omnisearch/
  - Assist (co-browsing) and MCP integration (v1.28).
  - No surveys or feedback widget found.
- **Privacy:**
  - Defaults: `obscureTextEmails` and `obscureInputEmails` are true. `defaultInputMode` is obscured or ignored; two docs pages disagree on 1 vs 2. https://docs.openreplay.com/en/sdk/constructor/ and https://docs.openreplay.com/en/sdk/sanitize-data/
  - `privateMode: true` masks ALL text and inputs, and wipes URL, title and referrer. It is opt-in (default `false`, per `tracker/tracker/src/main/app/sanitizer.ts`).
  - Element controls: `data-openreplay-obscured`, `data-openreplay-hidden`, `data-openreplay-unmask`.
  - Network payload sanitizer; `respectDoNotTrack`.
- **CSP:** `worker-src 'self' blob:` and `script-src` for your own host. https://docs.openreplay.com/en/troubleshooting/csp/
- **Pricing:** OSS free. Dedicated from $199/month. SSO and data-residency controls are not in OSS.
- **Maturity:** 12,942 stars. v1.28.0 on 2026-09-25, v1.27 on 2026-05-05, v1.26 on 2026-02-28: roughly every 1–4 months. @openreplay/tracker 19.0.1.

### Matomo + Heatmap & Session Recording plugin
- **HQ and data:** Wellington, New Zealand (InnoCraft). Matomo Cloud is hosted in Frankfurt; secondary source: https://fpai.orora.co.jp/blog/matomo-pricing-2026/
- **Self-host:** GPL-3.0 core on PHP with MySQL/MariaDB; lightweight. Core 5.14.1 released 2026-10-04.
- **Premium plugins (EUR per year, from the marketplace API https://plugins.matomo.org/api/2.0/plugins/HeatmapSessionRecording/info):**
  - HeatmapSessionRecording: €219 (1–4 users), €439 (5–15), €659 (unlimited). Version 6.0.4, 2026-09-28.
  - Funnels: €199 (1–4) / €386.
  - UsersFlow: €89.
  - FormAnalytics: €149.
- **Features:**
  - Click, move and scroll heatmaps; session recordings.
  - No rage-click or dead-click detection documented (absence; secondary source https://www.plerdy.com/blog/matomo-alternatives/).
  - No surveys.
- **Privacy:**
  - Keystrokes not captured by default; form fields masked; `data-matomo-mask` / `data-matomo-unmask`.
  - No global "mask all text" switch documented. https://matomo.org/faq/heatmap-session-recording/data-masking-in-heatmaps-and-session-recordings/
  - Cookieless and consent APIs exist in core; that is from knowledge and UNVERIFIED here.
- **CSP:** historically needed `unsafe-eval` in the Matomo UI. The plugin added CSP support in 4.0.14, but playback iframes your page. https://forum.matomo.org/t/heatmapsessionrecording-plguin-csp-error/63691
- **Cloud price:** about €22–29 per month for 50k hits (secondary sources).

### Sentry (Session Replay and User Feedback)
- **HQ and data:** US. EU region in Frankfurt (`de.sentry.io`), including replays, available on all plans. https://docs.sentry.io/organization/data-storage-location/
- **Self-host:**
  - License: FSL-1.1-Apache-2.0; becomes Apache-2.0 after 2 years.
  - Needs 4 CPU, 16 GB RAM plus 16 GB swap; 32 GB recommended.
  - Stack: Kafka, ClickHouse, Snuba, Redis, Postgres. https://develop.sentry.dev/self-hosted/
  - Replay and User Feedback work self-hosted (Feedback needs 24.4.2 or later). Several self-host replay bug reports exist: https://github.com/getsentry/self-hosted/issues/2817
  - Release 26.9.0 on 2026-09-16; 9,596 stars (self-hosted repo). @sentry/browser 11.4.0.
- **Features:**
  - Rage and dead clicks are surfaced in the replay timeline. https://docs.sentry.io/product/explore/session-replay/web/getting-started/
  - Feedback widget with replay attached.
  - No product-analytics funnels or heatmaps.
- **Privacy:** `maskAllText: true`, `maskAllInputs: true` and `blockAllMedia: true` by DEFAULT, plus mask/block/ignore/unmask selectors. https://docs.sentry.io/platforms/javascript/session-replay/privacy/
- **CSP:** the default inline worker needs `worker-src blob:`. The `workerUrl` option lets you self-host the worker. https://docs.sentry.io/platforms/javascript/session-replay/configuration/
- **Pricing:** Developer plan is free with 1 user. Team $26/month. https://sentry.io/pricing/

### Grafana Faro / Grafana Cloud Frontend Observability
- **HQ and data:** Grafana Labs, US. The Cloud stack region is selectable.
- **License and maturity:** Apache-2.0, 1,139 stars, v2.12.1 on 2026-09-22, frequent releases.
- **Replay:**
  - Built on Grafana's rrweb fork.
  - Defaults: `maskAllInputs: true`, `maskTextSelector: '*'` (masks all text), `sanitizeMetaHref: true`.
  - Classes `grafana-mask`, `grafana-block`, `grafana-ignore`; a `beforeSend` hook; a `samplingRate` for replay.
  - README: https://github.com/grafana/faro-web-sdk/blob/main/experimental/instrumentation-replay/README.md
  - Cloud docs: replay data is masked client-side by default, with 30-day retention. https://grafana.com/docs/grafana-cloud/observe-and-act/monitor-applications/session-replay/data-privacy/
- **Frustration signals:**
  - Rage click: 3 or more clicks within 1 s, under 100 px apart.
  - Dead click: no page response within 100 ms.
  - Error click.
  - Merged 2026-10-01; not yet in a release.
- **Other features:** user actions (`data-faro-user-action-name`), web vitals, errors, traces. No heatmaps, funnels or surveys.
- **Self-host path:**
  - Alloy `faro.receiver` outputs logs to Loki receivers and traces to otelcol. The default max payload is 5 MiB. Its docs do not mention replay. https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/
  - The only OSS replay viewer is the community plugin https://github.com/nissy-dev/grafana-faro-session-replay-app-plugin (Apache-2.0, 0 stars). It reads from Loki.
  - VictoriaLogs accepts the Loki push API and OTLP logs. https://docs.victoriametrics.com/victorialogs/data-ingestion/ — whether VictoriaLogs line-size limits can hold full rrweb snapshots, and whether the plugin can query VictoriaLogs, is UNVERIFIED.
  - The Cloud instrumentation docs only describe the Grafana Cloud collector endpoint.
- **OTel:** `@grafana/faro-transport-otlp-http` is experimental.
- **Pricing:** $0.75 per 1k sessions for new customers, with 50k sessions free. Replay add-on pricing is UNVERIFIED. https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/frontend-observability/

### Highlight.io
- **Status:**
  - Acquired by LaunchDarkly (announced April 2025). https://launchdarkly.com/blog/welcome-highlight-to-launchdarkly/
  - Hosted service deprecated 2026-02-28. https://bex.co/blog/2026/07/12/highlightio-launchdarkly-shutdown-observability
  - Repo: 9,383 stars; Apache-2.0 core with `enterprise/` under its own license.
  - Last docker release docker-v0.5.6 on 2025-08-08. Recent commits remove account resolvers and redirect the site to LaunchDarkly. Not maintained by the original team.
  - The successor is `@launchdarkly/session-replay` 1.1.23, which is US SaaS.

### rrweb (raw library)
- MIT, 20,236 stars, rrweb 2.1.7 on 2026-10-02.
- Defaults are NOT privacy-safe: `maskAllInputs: false`, `maskInputOptions: {password: true}`, `maskTextSelector: null`.
- `rr-block` / `rr-mask` classes. https://github.com/rrweb-io/rrweb/blob/master/guide.md
- No analytics, storage or player UI. Every replay tool here except Clarity and Matomo builds on it (PostHog, Sentry, OpenReplay-like, Faro, OpenPanel, Rybbit, HyperDX).

### Mouseflow
- Copenhagen, Denmark (Mouseflow ApS); EU and US data centres. SaaS only.
- Plans: Free (500 sessions), Essential $25 (5k), Advanced $109 (25k), Premium $319 (100k). https://mouseflow.com/pricing/ — a secondary source quotes Essential at €39.
- Friction detection on paid plans; funnels; form analytics and feedback surveys on Advanced and up; journeys on Premium.

### Smartlook
- Brno, Czech Republic; owned by Cisco. EOL as described above. Ruled out.

### Contentsquare / Hotjar
- Hotjar Ltd merged into Contentsquare on 2025-07-01. hotjar.com/pricing redirects to Contentsquare. https://www.air360.io/en/blog/hotjar-is-now-contentsquare/
- Data on AWS eu-west-1 (Ireland), plus France. https://complydog.com/blog/is-hotjar-gdpr-compliant
- Has rage clicks, u-turns, dead clicks, frustration score, surveys and feedback. On free, only 5% of sessions are recorded, capped at 10k, and frustration score and journeys are excluded. https://formbricks.com/blog/hotjar-review
- SaaS only.

### Microsoft Clarity
- Free forever. Data "stored in the Microsoft Azure cloud service". EU contracts go via Microsoft Ireland with SCCs to Microsoft Corp (US). "Microsoft/Clarity has access to the data." https://learn.microsoft.com/en-us/clarity/faq
- Rage clicks, dead clicks, excessive scrolling, quick backs; heatmaps.
- Masking modes: strict, balanced, relaxed. Which one is the default is UNVERIFIED.
- EEA consent signal required since 2025-10-31 (secondary source: https://www.cookieyes.com/blog/microsoft-clarity-gdpr/).
- No self-host.

### Plausible
- Legal entity in Estonia; data on Hetzner, Falkenstein (DE).
- Community Edition is AGPL-3.0 on Postgres and ClickHouse. CE lacks funnels, ecommerce revenue goals, SSO and the sites API; raw data is in ClickHouse. https://github.com/plausible/analytics
- 29,315 stars; v3.2.1 on 2026-05-15.
- Cookieless; custom events.
- No replay, heatmaps or frustration signals.
- From $9/month for 10k pageviews (secondary source).

### Umami
- MIT, Postgres. 39,176 stars, v3.4.0 on 2026-09-17.
- Funnels, retention, journeys and custom events are on all plans, including free. Cloud Hobby is free (100k events); Pro $20. EU and US hosting (secondary source: https://productanalytics.tools/tools/umami/).
- No replay or frustration signals. US company (UNVERIFIED).

### Pirsch
- Germany, hosted in Germany.
- Core library AGPL-3.0, Go plus ClickHouse; 1,029 stars; v7.0.0-rc48.
- Full self-host and raw data only on Enterprise. Standard €6/month (10k pageviews), Plus €12. Funnels on Plus. https://pirsch.io/pricing
- No replay.

### Simple Analytics
- Netherlands, data in NL/EU. Proprietary, no self-host.
- From €20/month per user; free tier with 30-day history. https://www.simpleanalytics.com/pricing
- Events API. No replay or funnels.

### Aptabase
- Founder based in Ireland. AGPL-3.0; SDKs MIT. 1,833 stars; no GitHub releases.
- EU or US region. Free 20k events/month; $10 for 200k. https://aptabase.com/pricing
- App and desktop focus. No replay or heatmaps.

### Countly
- Countly Lite is "AGPL-3.0 with modified Section 7": you cannot remove Countly branding (LICENSE.md). MongoDB-based.
- 5,912 stars; 25.03.53-LTS on 2026-09-03.
- Heatmaps are web-only and Enterprise/Flex only. No session replay found. https://support.countly.com/hc/en-us/articles/4431589003545-Analytics
- Ratings and NPS widgets: UNVERIFIED tiering. HQ in the UK is UNVERIFIED.

### Snowplow
- Core pipeline under SLULA since January 2024. SLULA 1.1 forbids production and commercial use without a licence. https://docs.snowplow.io/docs/contributing/limited-use-license-faq/
- The JS tracker is BSD-3-Clause. Apache fork: OpenSnowcat. https://github.com/opensnowcat
- No replay.

### Fathom
- Canada (UNVERIFIED). From $15/month for 100k pageviews; "EU data isolation". https://usefathom.com/pricing
- Fathom Lite (MIT) last released v1.3.1 on 2023-01-31: effectively abandoned.
- No replay.

### Swetrix
- Swetrix Ltd, Edinburgh, UK (Ukrainian origin); hosted on Hetzner DE. AGPL-3.0; 1,202 stars.
- Funnels, sessions, user flows, error tracking.
- Session replays are Cloud-only. https://github.com/Swetrix/swetrix
- Cloud $19 / $39 (Plus includes replay).

### Rybbit
- Founder Bill Yang (US); Cloud on Hetzner Falkenstein. AGPL-3.0; 13,089 stars; v2.9.0 on 2026-09-12; ClickHouse.
- Session replay, journeys, funnels, retention, error tracking, web vitals; free when self-hosted.
- Replay defaults: `maskAllInputs: true`, but text is masked only via `maskTextSelectors` / `rr-mask`. No rage or dead clicks documented. https://rybbit.com/docs/sdks/web

### Medama
- Core and dashboard Apache-2.0, tracker MIT. Single binary, about 256 MB RAM.
- 643 stars; v0.6.2 on 2026-01-18. Author's country UNVERIFIED.
- Pageviews only.

### Newer 2025–2026 tools
- **OpenPanel**
  - OpenPanel AB, Stockholm (UNVERIFIED primary source); EU-hosted. AGPL-3.0; 7,086 stars; Postgres plus ClickHouse.
  - Funnels, cohorts and session replay (rrweb). Replay masks ALL text and inputs by default and is off by default per project; 30-day retention. https://openpanel.dev/docs/session-replay
  - Self-host is free with unlimited events. Cloud from $2.50 for 5k events. https://openpanel.dev/pricing
  - No frustration signals found.
- **HyperDX / ClickStack** (ClickHouse Inc., US)
  - MIT; 9,929 stars. OTel-native session replay, logs and traces in ClickHouse. https://clickhouse.com/docs/use-cases/observability/clickstack/session-replay
  - `maskAllText` defaults to false. For `maskAllInputs`, the README says false but `session-recorder` code says true (conflict).
- **OpenObserve**
  - AGPL-3.0; 22,251 stars; v1.1.0-rc1 on 2026-09-30.
  - RUM and session replay in the OSS edition. https://openobserve.ai/docs/user-guide/rum/
  - The browser SDK is a fork of DataDog/browser-sdk (Apache-2.0). Privacy levels: `allow`, `mask-user-input` (default), `mask` (all text).
  - Whether frustration signals are surfaced in the UI is UNVERIFIED.
- **Dash0 web SDK** (Apache-2.0, 21 stars): rage-click detection during recordings (PR #116). Dash0 is SaaS only.
- **Rejourney** (281 stars; NOASSERTION license): too immature.

---

## Cross-cutting answers

**Rage and dead click detection, self-hosted:**
- PostHog hobby: `$rageclick`, `$dead_click`.
- OpenReplay: click rage, dead click, excessive scrolling.
- Sentry self-hosted: rage and dead clicks in the replay timeline.
- Grafana Faro: rage, dead and error clicks, merged and unreleased; they arrive as events and logs in your own Alloy pipeline with no OSS UI.
- OpenObserve: possible through its Datadog-SDK fork; UNVERIFIED.
- Not documented in Matomo, Rybbit, OpenPanel, Swetrix, Umami or Plausible.
- Clarity, Hotjar/Contentsquare and Mouseflow have them, but as SaaS only.

**Mask ALL text by default:**
- Sentry Replay (`maskAllText: true`).
- Faro replay (`maskTextSelector: '*'`).
- OpenPanel replay.
- Opt-in only:
  - OpenReplay (`privateMode`)
  - PostHog (`maskTextSelector: "*"`)
  - rrweb
  - HyperDX (`maskAllText`)
  - OpenObserve (`mask` level)
  - Clarity (strict mode)
- Not possible globally: Matomo (per element), Rybbit (selectors only).

**Raw event export:**
- ClickHouse is the native store, queryable directly, for: PostHog, OpenReplay, Plausible CE, OpenPanel, Rybbit, Pirsch, HyperDX, and Sentry (via Snuba; replay blobs go to object storage).
- PostHog batch exports: Postgres, S3, etc.
- Postgres: Umami.
- MySQL: Matomo.
- OTLP / Loki-compatible: Faro (Alloy, then Loki/VictoriaLogs and Tempo; OTLP transport) and HyperDX (OTel-native).

**Grafana and OpenTelemetry integration for front-end events:**
- Only Faro (Grafana-native, OTLP transport) and HyperDX/ClickStack (OTel SDK extension) qualify.
- Sentry, PostHog and OpenReplay do not export front-end events or replays as OTLP. Not found in their docs; treat as absence.

**VS Code webviews (analysis, applies to every JS SDK):**
- The SDK must be bundled locally (`asWebviewUri`) under the webview CSP (`script-src ${webview.cspSource}`).
- `connect-src` must allow the collector, and recorders that use blob workers (Sentry, PostHog, OpenReplay) need `worker-src blob:` — or use Sentry `workerUrl`.
- `localStorage` and webview state are unreliable when the tab goes to the background, so expect session IDs to reset. https://code.visualstudio.com/api/extension-guides/webview
- The extension must honour `vscode.env.isTelemetryEnabled` / `onDidChangeTelemetryEnabled` and must not collect PII; ship a `telemetry.json`. https://code.visualstudio.com/api/extension-guides/telemetry
- Heatmap viewers that iframe the live URL (PostHog toolbar/in-app, Matomo) cannot render a webview. DOM-replay tools (OpenReplay, Sentry, Faro, PostHog replay) can.
- Remote-script tools (Clarity, Hotjar) are effectively incompatible.

---

## Ranked shortlist for Unfold

1. **OpenReplay, self-hosted.**
   - French company; AGPL-3.0 with an MIT tracker; 2 vCPU / 8 GB.
   - Covers replay, heatmaps, funnels, journeys and rage/dead/excessive-scroll signals in OSS.
   - `privateMode` masks everything and wipes URLs. CSP-compatible with a self-hosted script and `worker-src blob:`.
   - Active, with a release every 1–4 months.
2. **Grafana Faro with replay and frustration instrumentation, into the existing Alloy + Victoria stack.**
   - Near-zero extra infrastructure; Apache-2.0; masks all text and inputs by default.
   - Frustration signals become events you can show as Grafana stat tables.
   - Caveats: replay is experimental, frustration signals are unreleased, no OSS replay UI beyond a 0-star plugin, no heatmaps or funnels, and VictoriaLogs compatibility is UNVERIFIED.
3. **PostHog.**
   - Broadest feature set: funnels, paths, surveys, heatmaps, `$rageclick`/`$dead_click`, cookieless mode. EU Cloud Frankfurt for the hosted phase.
   - Downsides: self-host is the unsupported hobby deployment (16 GB, ClickHouse and Kafka, about 4 vCPU / 16 GB always on), text is unmasked by default, the heatmap viewer relies on iframes, and the vendor is US-based.
4. **OpenPanel, self-hosted.**
   - Swedish, AGPL-3.0, Postgres plus ClickHouse.
   - Funnels, cohorts, and replay that masks all text and inputs by default.
   - Lighter Mixpanel-style journeys; no frustration signals.
   - Alternative pick if error context and a feedback widget matter more than journeys: Sentry self-hosted (masks everything by default, rage/dead clicks, feedback widget), but it is FSL-licensed and needs 16–32 GB RAM.

## Ruled out
- **Microsoft Clarity:** data in Azure with a US transfer path, Microsoft can access the data, no self-host, remote script only.
- **Contentsquare/Hotjar:** SaaS only (client code would go to a third party), only 5% of sessions recorded on free, now Contentsquare pricing.
- **Smartlook:** Cisco EOL; end-of-sale 2026-05-31.
- **Highlight.io:** hosted service shut down 2026-02-28, self-host unmaintained (last docker release 2025-08).
- **Mouseflow:** EU but SaaS only; sensitive client code would leave the premises.
- **Snowplow:** SLULA forbids production use.
- **Fathom:** no replay; self-host abandoned in 2023.
- **Matomo:** no rage/dead click detection, per-seat plugin cost (€219–659 per year), iframe-based playback, no global "mask all text".
- **Swetrix:** replay is Cloud-only.
- **Countly:** no replay, heatmaps Enterprise-only, branding clause in the licence.
- **Plausible, Simple Analytics, Pirsch, Umami, Medama, Aptabase:** pageview and event analytics only, with no replay or frustration signals. Fine for the apps/site marketing site, not for the app.
- **Rybbit:** no frustration signals; text masked only via selectors.
- **HyperDX/ClickStack:** US vendor, masking off by default. Reconsider only if you move to a ClickHouse observability stack.
- **Raw rrweb alone:** unsafe defaults, and you would have to build storage, a player and analytics yourself.
