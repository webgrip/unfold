<!-- Raw report of one research agent, 2026-10-05. Agent output, not verified line by line; the dossier cites what it relies on. -->

# Event-triggered in-app micro-surveys for Unfold: tool landscape and evidence (researched 2026-10-05)

Prices are given in the currency the vendor publishes. Where only USD is published I did not convert it. "UNVERIFIED" means I could not confirm the claim on a primary page.

## 1. Tool by tool

### Formbricks (DE) — the strongest third-party fit
- **HQ / data:** Cloud runs in Frankfurt, DE. Holds GDPR, SOC 2 and ISO 27001. https://formbricks.com/pricing
- **License:** The core is AGPLv3. The code under `apps/web/modules/ee` is under a proprietary Enterprise License. EE code ships inside the Docker image and is unlocked with a license key. https://formbricks.com/docs/self-hosting/advanced/license
- **Free in Community Edition (CE):** website and app surveys, all SDKs, hidden fields, webhooks, multi-language surveys, full API, advanced logic, all question types.
- **Enterprise-only (EE):**
  - contact management and segments
  - teams and roles
  - quota management
  - workflows
  - SSO
  - audit logs
  - 2FA
  - hiding "Powered by Formbricks"
  - any "custom Workspace count"
  - CE is capped at **1 workspace**: "Workspaces 1 | Pay per workspace". Source: same license page.
- **User identification is EE:** `setUserId`, `setAttributes` and attribute-based targeting all need EE. Unidentified users still get triggers and recontact. https://formbricks.com/docs/surveys/website-app-surveys/user-identification and https://formbricks.com/docs/surveys/website-app-surveys/attribute-based-targeting
- **Recontact and cooldown are free (not EE-gated):**
  - Per-survey options: "Show only once" (the default), "Show a limited number of times", "Ask until they submit a response", "Keep showing while conditions match". https://formbricks.com/docs/surveys/website-app-surveys/recontact
  - A workspace-wide **Cooldown Period** (default 7 days) can be overridden or ignored per survey. Its clock counts displays of *any* survey. https://formbricks.com/docs/surveys/website-app-surveys/cooldown-period
  - Permanent dismiss is the default "Show only once" behaviour: a survey is shown once even if the user does not respond.
- **Triggers:**
  - Code actions fire with `formbricks.track("key")`.
  - No-code actions: Click (CSS selector and/or inner text), Page View, Exit Intent, 50% Scroll, Time on Page. URL filters: exact, contains, startsWith, endsWith, notMatch, notContains, regex.
  - Changes take up to 1 minute to reach clients because of caching.
  - Source: https://formbricks.com/docs/surveys/website-app-surveys/actions
- **Attaching our event id:**
  - `formbricks.setEmbeddedData({...})` merges values into an in-memory "bag" that is snapshotted onto the next displayed survey. Keys must be declared as Hidden Fields on the survey.
  - `formbricks.track("action", { hiddenFields: {...} })` also works and takes precedence.
  - So `{triggerEventId}` can be joined. Source: https://formbricks.com/docs/surveys/embedded-data/set-embedded-data
  - Lifecycle events (shown, answered, closed) are available. https://formbricks.com/docs/surveys/website-app-surveys/lifecycle-events
- **Question types:** a CSAT question type exists (fixed 5-point). https://formbricks.com/docs/surveys/question-type/csat
- **Export:** webhooks plus Management API v1/v2. https://formbricks.com/docs/api-reference/rest-api
- **CSP:**
  - The SDK loads `{appUrl}/js/formbricks.umd.cjs` and then `{appUrl}/js/surveys.umd.cjs`. The policy must allowlist the host in `script-src` and `connect-src`.
  - The SDK does not put a nonce on the script tags it creates. `'strict-dynamic'` only works with a nonced root script.
  - Styles are injected as `<style>`. Call `formbricks.setNonce()` and add the nonce to `style-src` and `style-src-elem`.
  - It works without `unsafe-inline` but needs nonce plumbing.
  - Source: https://formbricks.com/docs/surveys/website-app-surveys/framework-guides
- **SDK size (measured from app.formbricks.com today):**
  - formbricks.umd.cjs: 33.2 KB raw, about 10.9 KB gzip.
  - surveys.umd.cjs: 1.01 MB raw, about **279 KB gzip**, loaded the first time a survey shows.
  - The SDK keeps its state in `localStorage` under the key `formbricks-js`. I confirmed this by grepping the bundle.
- **Self-host footprint (v6):**
  - The baseline Docker stack is Formbricks Web, PostgreSQL, Redis/Valkey, Formbricks Hub, Cube and **SpiceDB**.
  - SpiceDB became "the sole authorization engine; protected operations fail closed" in 6.0.
  - Optional services: RustFS, and Qwen/vLLM (needs a GPU).
  - Sources: https://formbricks.com/docs/self-hosting/setup/docker and https://github.com/formbricks/formbricks/releases
  - No RAM or CPU figure is published: UNVERIFIED.
- **Maturity:** 13,063 GitHub stars. Latest release 6.0.2 on 2026-10-01; 5.4.5 is maintained in parallel. https://github.com/formbricks/formbricks
- **Cloud pricing (USD):** Hobby free (250 responses/month, 1 workspace). Pro $74/month (2,000 responses, 3 workspaces, webhooks, respondent identification). Scale $325/month (5,000 responses, 5 workspaces). Self-host EE is priced on request. https://formbricks.com/pricing
- **Multi-tenant agency use:** CE's single workspace means one instance per tenant, or buying EE priced per workspace.
- **VS Code webview:** possible, but it needs the remote host in the webview's CSP. Also, VS Code webview `getState`/`setState` state is "destroyed when the webview panel is destroyed", so recontact state kept in localStorage is not reliable there. https://raw.githubusercontent.com/microsoft/vscode-docs/main/api/extension-guides/webview.md
  - Whether webview localStorage persists is UNVERIFIED.

### PostHog Surveys (US/UK; EU Cloud region)
- **Self-host:** a "hobby" Docker Compose deploy under MIT. Needs about 4 vCPU, 16 GB RAM and 30 GB+ storage. It is "officially unsupported", has no tagged releases, and "All paid-plan features are Cloud-only". https://posthog.com/docs/self-host
- **Triggers:**
  - Event-triggered surveys can repeat "Every time the event is sent" or "Just once".
  - Targeting: CSS selector match, URL contains/exact/regex, device type, linked feature flag, person/group properties, "User sends events".
  - Source: https://posthog.com/docs/surveys/targeting
  - Our code fires a named trigger via `posthog.capture(event, props)`. Filtering triggers on event *properties* was not confirmed: UNVERIFIED.
- **Frequency:**
  - Global "Wait period" hides surveys from users who saw any survey in the last X days.
  - A completed or dismissed survey is not shown again.
  - "Repeat on a schedule" iterations are anchored to the launch date, not to each user's last response.
- **Headless mode:** API surveys with `getActiveMatchingSurveys()`. We render the UI and send `posthog.capture("survey sent", {...})`, which lets us attach arbitrary properties such as our event id. https://posthog.com/docs/surveys/implementing-custom-surveys
- **CSP:** domains must be allowlisted. A nonce is supported via `prepare_external_dependency_script` and the stylesheet equivalent. https://posthog.com/docs/advanced/content-security-policy
- **Size (measured):** posthog-js 1.435.9 `array.js` is about 99 KB gzip; the lazy `surveys.js` is about 33 KB gzip.
- **Pricing (USD):** 1,500 responses/month free, then $0.10/response (1.5k–2k), $0.035 (2k–10k), $0.015, $0.01. https://posthog.com/surveys/pricing
- **Maturity:** 40,145 stars.
- **Verdict:** EU Cloud is viable. Self-host is heavy and unsupported. It also drags in a whole analytics stack.

### Survicate (PL)
- **HQ / data:** HQ Warsaw, data on AWS Ireland. https://help.survicate.com/en/articles/3943199-gdpr-compliance-security-program-at-survicate
- **Self-host:** none.
- **Triggers:** `window._sva.invokeEvent('name', {prop:"string"})` with property matching, delay, and occurrence counts. https://developers.survicate.com/javascript/methods/
- **Attaching data:** `setResponseTraits` adds data to answer payloads. Event listeners are available. Same source.
- **Throttling:** a global workspace setting (per domain, stored in localStorage) plus per-survey recurrence. https://help.survicate.com/en/articles/3937841-run-recurring-website-surveys
- **CSP:** no documentation found (UNVERIFIED).
- **Pricing (USD):** Growth $114/month for 250 responses; Pro $349; Enterprise $569; 10-day trial only. https://survicate.com/pricing/

### Refiner (FR — Refiner SAS, Paris)
- **Data:** AWS eu-west-1. https://refiner.io/legal/gdpr/
- **Self-host:** none.
- **SDK:** `identifyUser`, `trackEvent`, `showForm`, `addToResponse` (works like a hidden field), and the callbacks `onDismiss` and `onComplete`. https://refiner.io/docs/kb/javascript-client/reference/
- **Throttling:** global, plus per-survey "Gap time" and max views/responses. https://refiner.io/docs/kb/settings/survey-throttling/
- **Pricing:** Essentials is reported at $99/month (5k MAU) and Growth at $239 (third-party data, UNVERIFIED on the vendor page). There is a free tier of 25 responses/month. Event tracking and REST API are Growth-only. https://refiner.io/pricing/
- **CSP:** no documentation found (UNVERIFIED).

### Usersnap (AT — Linz)
- **Data:** AWS Frankfurt only. No self-host. https://formbricks.com/blog/usersnap-pricing
- **Triggers:** `api.logEvent('name')`; custom data via `setValue('custom', {...})` is stored with each item. https://help.usersnap.com/docs/website-widget-api-examples
- **Frequency:** "show again after N days", set separately for submit and for dismiss. https://usersnap.com/blog/display-rules/
- **Pricing:** €49 / €109 / €189–199 / €369–389 per month (third-party sources disagree).
- **Fit:** bug-reporting first, surveys second.

### Gleap (AT — Gleap GmbH, Schwarzach)
- **Data:** EU region on DigitalOcean Frankfurt. https://www.gleap.ai/legal/privacy-policy
- **Triggers:** `trackEvent` drives outbound surveys, with frequency "Once" or "Every time". https://help.gleap.io/en/articles/93-event-based-messaging
- **Pricing (USD):** Starter $49 (chat/email only), Team $149, Pro $299; no free plan. https://www.gleap.ai/pricing
- **Fit:** now an AI-support suite; surveys are incidental. Self-host: none found.

### Userback (AU — Brisbane)
- **Data:** primary hosting is AWS in the US. https://userback.io/privacy/
- **Triggers:** custom event or SDK. https://docs.userback.io/docs/advanced-micro-surveys
- **Pricing (USD):** Free / $29 / $79 / $159; REST API and webhooks only on Business Plus. https://userback.io/pricing/

### Hotjar Surveys (Contentsquare, FR/MT)
- **Data:** AWS eu-west-1. https://help.hotjar.com/hc/en-us/articles/36820004397713-Privacy-FAQs
- **Triggers:** `hj('event','name')` (no properties). https://help.hotjar.com/hc/en-us/articles/36820019831313-How-to-Set-Up-Events
- **CSP:** reported to need `unsafe-inline`. https://community.developer.atlassian.com/t/survicate-and-hotjar-content-security-policy-headers/67984 (community source, partly UNVERIFIED)
- **Pricing:** Ask plan €48–128/month; being migrated into Contentsquare tiers through 2026. https://www.usercall.co/post/hotjar-pricing

### Userpilot (US)
- Starter $299/month (2k MAU), Growth $849+.
- EU hosting is an Enterprise add-on only.
- Source: https://userpilot.com/pricing/

### Sprig (US)
- Enterprise "book a demo" model. Third parties report a Free plan (1 in-product survey) and Starter $175–199/month. https://sprig.com/pricing and https://cleverx.com/blog/sprig-pricing-plans-explained-2026/
- EU residency: UNVERIFIED.

### Typeform (ES)
- Embed SDK `createPopup` with `hidden` and `transitiveSearchParams`; no trigger or frequency engine. https://www.npmjs.com/package/@typeform/embed
- EU data center exists (`api.eu.typeform.com`). https://www.typeform.com/developers/get-started/responses-data-center/
- Light €9.90 / Suite €29.90 / Premium €49.90 per month.

### Tally (BE)
- Data stored in the EU. https://tally.so/help/faq
- `Tally.openPopup(id, {hiddenFields, showOnce, doNotShowAfterSubmit})`. https://tally.so/help/popup-forms
- No targeting, segments or global cap.
- Our code could fire it, but this is a form, not a micro-survey engine.

### LimeSurvey (DE)
- GPL-2.0+; 3,743 stars; no GitHub releases (it uses tags).
- Classic long-form surveys; no in-app trigger SDK.
- Sources: https://github.com/limesurvey/limesurvey and https://manual.limesurvey.org/LimeSurvey_PRO_vs_LimeSurvey_CE

### OpnForm
- AGPL plus an `api/app/Enterprise` license; 3,778 stars; v2.5.0 on 2026-09-02.
- Popup embed, URL hidden fields, webhooks. PHP + Postgres/MySQL.
- No event triggers or frequency.
- Sources: https://github.com/OpnForm/OpnForm and https://docs.opnform.com/introduction

### HeyForm
- AGPL-3.0; 8,997 stars; v3.0.3 on 2026-09-09.
- Modal and popup embeds. Runs on MongoDB + KeyDB.
- Open bug: hidden fields are not saved when self-hosted. https://github.com/heyform/heyform/issues/143

### Zigpoll
- Built for e-commerce/Shopify; script under 20 KB; $0–194/month. https://www.capterra.com/p/186748/Zigpoll/
- HQ and data location: UNVERIFIED (not published in the FAQ). https://www.zigpoll.com/faq

### Fider
- Feature voting only; no survey or rating widget.
- AGPL-3.0; 4,558 stars; v0.38.1 on 2026-10-01; hosted by UK-based Northern App Labs Ltd.
- Sources: https://fider.io/ and https://github.com/getfider/fider

### Canny (US)
- Feedback boards and voting only. No in-app micro-survey is mentioned. https://canny.io/pricing

### Newcomers / other
- **Usertour:** open-source onboarding tool (Appcues-like) with surveys. MIT community code plus an EE license; 2,316 stars; v0.9.5 on 2026-09-18. Frequency control is not documented (UNVERIFIED). https://github.com/usertour/usertour
- **SurveyJS:** MIT renderer library; v3.1.2 on 2026-09-29. Has known CSP problems with inline styles. https://github.com/surveyjs/survey-creator/issues/741
- **Astuto:** archived.
- I found no other 2025–2026 EU or self-hostable micro-survey newcomer with an event-trigger engine (confirmed absence within my searches).

## 2. Evidence on how to run the surveys

- **Response rates (B2B SaaS):**
  - Refiner 2025 (1,382 in-app surveys, 50.3M views): average response rate 27.52%; web apps 26.48%; CSAT 26.29%; NPS 21.71%; a center modal on web reached 42.6%. No B2B or trigger breakdown. https://refiner.io/blog/in-app-survey-response-rates/
  - Survicate 2025 (4,332 surveys, 460 companies): median 9.98%; **B2B 8.18%**; **SaaS 7.74%**. By length: 1 question 9.75%, 2–3 questions 15.97%. https://survicate.com/reports/survey-response-rate-benchmarks/
  - Treat both as vendor data. For Unfold's B2B user base, plan on roughly 8–25%.
- **Task-level wording:**
  - The SEQ is validated and correlates with completion, time and errors. Current wording: "Overall, how difficult or easy did you find this task?" on a 7-point scale, Very Difficult → Very Easy. Average about 5.5. Changing the stem or polarity made no significant difference. https://measuringu.com/evolution-of-seq/
  - NN/g: the SEQ is administered right after the task. https://www.nngroup.com/articles/measuring-perceived-usability/
  - CES 2.0 is a statement, "The company made it easy for me to handle my issue", rated 1–7 on agreement. https://www.si-labs.com/en/articles/customer-effort-score/ (original source: Dixon, Freeman & Toman, HBR 2010, https://hbr.org/2010/07/stop-trying-to-delight-your-customers)
  - For "was this decision clear / easy", SEQ-style ease fits better than CSAT. CSAT measures satisfaction with an interaction (Formbricks CSAT docs above).
  - HaTS asks satisfaction bipolar ("satisfied or dissatisfied"), fully labelled 7-point, with no numbers and with "Neither…nor" as the midpoint. https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/43221.pdf
- **Fatigue and caps:**
  - HaTS does not re-invite the same user for **12 weeks** and samples about 8% of users per week. It avoids blocking modal pop-ups because they "interrupt users' normal workflows". Same PDF.
  - Porter, Whitcomb & Weitzer (2004): earlier surveys depress later response, e.g. 70% → 44%. https://eric.ed.gov/?id=EJ760543
  - Formbricks defaults to a 7-day cross-survey cooldown.
  - Usersnap recommends 2–3 displays, then waiting 3 days (urgent) or 60 days (general) after a dismiss. https://usersnap.com/blog/display-rules/
- **Event-triggered vs random sampling:**
  - HaTS: always-on, passively offered feedback forms are "bias[ed] towards those respondents that are experiencing a particular problem". Randomise per *user*, not per page view, so heavy users are not over-sampled. Same PDF.
  - Experience-sampling research: event-contingent schedules gave different (higher pleasant-valence, lower-variance) ratings than signal-contingent ones. https://dependlab.unc.edu/wp-content/uploads/sites/266/2021/02/Dawood2020_Article_ComparingSignal-ContingentAndE.pdf
  - Implication: Unfold's anomaly triggers (Undo, reopen within 7 days, rejection) will skew negative. Report them as diagnostic per trigger, never pooled into one "satisfaction" metric. Add a small randomly sampled baseline that is not tied to anomalies.

## 3. Ranking for this context

1. **First-party component (recommended)**, optionally rendered in the SEQ style.
2. **Formbricks CE, self-hosted** (or EU Cloud). It has the best feature match: `track()`, hidden fields or embedded data for the event id, recontact, cooldown, webhooks, all free.
3. **PostHog EU Cloud in headless "API survey" mode.** It is only worth it if Unfold adopts PostHog for analytics anyway.

## 4. Ruled out, with the reason

- **Sprig, Userpilot, Userback, Canny, Zigpoll:** US-hosted or US companies, or no EU residency below Enterprise.
- **Hotjar:** needs `unsafe-inline` (partly UNVERIFIED); no event properties; pricing in flux after the Contentsquare acquisition.
- **Survicate:** no self-host; $114/month minimum for 250 responses; nothing per tenant.
- **Refiner:** no self-host; event tracking and API are Growth-only.
- **Usersnap / Gleap:** bug-report and support suites; surveys are secondary; no self-host.
- **Typeform / Tally:** forms only, with no targeting or global frequency cap.
- **LimeSurvey:** long-form surveys; no in-app trigger SDK.
- **OpnForm / HeyForm:** form builders with no trigger or frequency engine; HeyForm also has the hidden-field bug.
- **Fider:** feature voting only.
- **Usertour:** immature (v0.9) and frequency control is undocumented.
- **PostHog self-host:** unsupported, 16 GB RAM, paid features are Cloud-only.

## 5. Does a tiny first-party component beat every tool?

**Yes, a tiny first-party component beats every tool for Unfold.**

1. **The hard part is in our domain, not the widget.** "Resolved item came back within 7 days", "3+ outbound clicks for one decision" and "first cleared list" are detected only by our own server state. Every tool would still need us to compute these and call `track()`. What a tool adds on top is only a renderer and a frequency cap, which is about 100 lines of code.
2. **Strict CSP.** Formbricks needs host allowlisting plus `setNonce`, because its scripts are inserted without a nonce. It also ships about 279 KB gzip of renderer. A first-party component adds zero CSP exceptions.
3. **VS Code webviews.** Third-party SDKs keep frequency state in localStorage (Formbricks: `formbricks-js`). Webview state is destroyed with the panel, and the CSP must allow a remote host. Server-side caps work the same in the web app and the extension.
4. **Joinability.** Our own table can key directly on `trigger_event_id`, `work_item_id` and `tenant_id`. There are no hidden-field declarations and no webhook round-trip.
5. **Multi-tenancy (phase 2).** Formbricks CE allows 1 workspace, and identification and segments are EE-only. Per-tenant isolation would mean one instance per tenant or a paid EE license; our own Postgres rows are tenant-scoped for free.
6. **Self-host weight.** Formbricks v6 means 6+ containers including SpiceDB and Cube. Adding that to a self-hosted product that agencies install is a big ask.

**What we give up:** a no-code survey editor for non-engineers, a results dashboard, and multi-language tooling. These matter only if non-developers will author surveys.

**Scope of the build:**
- Store `survey_prompt(trigger, event_id, shown_at, dismissed_permanently)` and `survey_response(score, text)`.
- Enforce on the server: a per-user global cooldown (start at 14 days, borrowing HaTS's 12-week figure for any baseline survey), one display per trigger type per N days, and permanent dismiss.
- Use one 7-point SEQ-worded ease item plus an optional text box, shown non-modally (no blocking modal).
- Add a small random baseline sample to counter trigger bias.

**When to revisit:** reconsider Formbricks CE if product or research staff need to author and iterate surveys without code changes.
