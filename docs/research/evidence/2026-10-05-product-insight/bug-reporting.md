<!-- Raw report of one research agent, 2026-10-05. Agent output, not verified line by line; the dossier cites what it relies on. -->

## "Report a problem" research for Unfold (checked 2026-10-05)

### Unfold's current CSP, read from the repo, because it decides most of the shortlist
- Web app (`apps/unfold/src/http.ts:139`): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`.
  - It has no `worker-src`, so this falls back to `script-src 'self'` and `blob:` workers are blocked.
  - It has no third-party origins.
  - It has no `'unsafe-inline'`.
- VS Code webview (`apps/unfold/extensions/vscode/src/panel.ts:196`): `default-src 'none'; style-src ${cspSource}; script-src 'nonce-…'; img-src ${cspSource}; connect-src 'none'`.
- The VS Code webview iframe gets only `allow="cross-origin-isolated; autoplay; local-network-access; clipboard-read; clipboard-write"` (https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/webviewElement.ts, `_createElement`).
  - It has no `display-capture`, so `getDisplayMedia()`-based screenshots cannot work inside Unfold's VS Code webviews.
  - Only DOM-rasterising screenshot libraries work there.

### Tracker APIs: can a report land with attachments?

**Forgejo: yes, in two calls.** Verified against the Codeberg swagger (Forgejo 16.0.0-dev, https://codeberg.org/swagger.v1.json):
- `POST /repos/{owner}/{repo}/issues` (`issueCreateIssue`), then
- `POST /repos/{owner}/{repo}/issues/{index}/assets` (`issueCreateIssueAttachment`). It is multipart, with form field `attachment` and optional query `name`.
- Comment equivalent: `POST /repos/{owner}/{repo}/issues/comments/{id}/assets`.
- Defaults in `[attachment]` (https://codeberg.org/forgejo/forgejo/src/branch/forgejo/modules/setting/attachment.go):
  - `MAX_SIZE` = 2048 MB.
  - `MAX_FILES` = 5.
  - `ALLOWED_TYPES` includes .png .jpg .webp .webm .mp4 .json .jsonc .log .txt .gz .zip. That means a screenshot, an rrweb JSON or .gz replay, and a HAR-like .json all pass by default.

**Vikunja: yes, in two calls.** Verified against https://try.vikunja.io/api/v1/docs.json (v2.7.0):
- `PUT /projects/{id}/tasks` (create a task), then
- `PUT /tasks/{id}/attachments` (multipart, form field `files`).
- Also available: `GET /tasks/{id}/attachments` and `GET|DELETE /tasks/{id}/attachments/{attachmentID}`.
- `/api/v1/info` exposes `max_file_size` (20MB on the demo instance) and `task_attachments_enabled`.

### Each candidate (prices are as listed; USD where the vendor lists USD, not converted)

**Marker.io**
- HQ and data: Marker.io SRL, Brussels, Belgium. Data in AWS eu-west-1 (Ireland), SOC 2 Type II (https://marker.io/security, https://help.marker.io/en/articles/12383990-data-privacy-security-overview).
- Self-host: none. SaaS only and closed source.
- Capture:
  - Screenshot plus annotation. By default the screenshot is rendered server-side (`ssr.marker.io`). A native-browser option uses the screen-capture API (https://help.marker.io/en/articles/9615303-native-browser-screenshot-rendering).
  - Console, network requests and session replay ("last 30 seconds or more").
  - Custom metadata through `markerConfig.customData` and `Marker.setCustomData()` (https://help.marker.io/en/articles/5358889-custom-metadata).
  - Network recording can exclude keys and domains (https://help.marker.io/en/articles/6562135-network-requests).
- Masking: client-side classes `.mk-exclude`, `.mk-mask` and `.mk-unmask`, applied to screenshots and replay (https://marker.io/features/data-masking). Masking of console and network data is not documented.
- Integrations (https://marker.io/integrations):
  - Has: GitHub, GitLab, ClickUp, Jira, Linear, Asana, Azure DevOps, Bitbucket, Trello, Monday, Notion, Wrike, Teamwork, Shortcut, Basecamp, Zendesk, Intercom, Slack, Sentry, LogRocket, FullStory, Zapier, and **Webhooks**.
  - Webhooks deliver a signed `issue.created` event (https://help.marker.io/en/articles/3738778-webhooks-integration).
  - Forgejo, Gitea and Vikunja: none.
- CSP (https://help.marker.io/en/articles/4438000-content-security-policy-csp):
  - Requires `style-src 'unsafe-inline'`.
  - Requires `frame-src`/`child-src https://app.marker.io`.
  - Requires `script-src edge.marker.io app.marker.io`.
  - Requires `connect-src api.marker.io ssr.marker.io s3.eu-west-1.amazonaws.com/marker.sessions.prod`.
  - Requires `img-src blob:`.
  - All of this breaks Unfold's current CSP.
- VS Code webview: not viable. It needs remote script, an iframe and SSR, and the native-capture path is blocked.
- Pricing (https://marker.io/pricing):
  - Starter: $39/mo annual or $59/mo monthly. 3 users. **No console, network, replay, webhooks or custom metadata.**
  - Team: $149/mo annual or $199/mo monthly. 15 users, 50 projects, 25k page views. Includes all of the above.
  - Business: custom pricing.
  - Agency: $99/mo annual or $129/mo monthly, for 15 members, 50 projects and 50 guests. Whether Agency includes console, network, replay and webhooks is UNVERIFIED.
- Maturity: high.

**Usersnap**
- HQ and data: Usersnap GmbH, Herrenstrasse 6, Linz, Austria (https://usersnap.com/privacy-policy). Hosting in AWS eu-central-1 and eu-west-1 per search results, linking https://help.usersnap.com/docs/privacy-and-security-faq.
- Self-host: none found.
- Capture: screenshot, annotation, console log recording on all plans. Session recording from Professional up (https://usersnap.com/pricing). Network capture is UNVERIFIED.
- Integrations: Jira, Azure DevOps, GitHub, Zendesk and Slack are named, plus webhooks and Zapier (https://usersnap.com/integrations).
  - GitLab and ClickUp are not shown on that page (UNVERIFIED).
  - Forgejo, Gitea and Vikunja: none.
  - Webhooks only on Premium.
- CSP: supports a nonce, but needs `*.usersnap.com` in script, style, connect, img and font, plus `*.googleapis.com` and `*.gstatic.com`, plus the S3 eu-central-1 upload origin (https://help.usersnap.com/docs/usersnap-with-csp).
- Pricing: Starter €49, Growth €129, Professional €219 (session recording), Premium €459 (webhooks, custom branding).
- Product direction: Usersnap has pivoted toward a feedback and voice-of-customer platform.

**BugHerd**
- HQ and data: Melbourne, Australia (https://en.wikipedia.org/wiki/BugHerd). Data in us-east-1 on Heroku/AWS, screenshots in S3 in the same region, no EU option (https://bugherd.com/security).
- Capture: screenshot plus annotation. No console or network capture, per a third-party comparison (https://issuecapture.com/bugherd-alternative), UNVERIFIED first-party.
- Integrations: GitHub, ClickUp (2-way), Jira, Asana, Linear, Monday, Slack, Teams and others, plus REST API and webhooks (https://support.bugherd.com/en/articles/11430542-what-services-does-bugherd-integrate-with). GitLab only via commit hooks. Forgejo, Gitea and Vikunja: none.
- Pricing (https://bugherd.com/pricing): Standard $42/mo annual (5 members), Studio $67, Premium $125 (ClickUp is on Premium).

**Userback**
- HQ and data: Userback Pty Ltd (Australia). "Primary data hosting is provided by AWS in the United States" (https://userback.io/privacy/).
- Capture: session replay and developer tools from Business up.
- Integrations: GitHub, GitLab, ClickUp (2-way), webhooks and others (https://userback.io/integrations/). Forgejo, Gitea and Vikunja: none.
- Pricing (https://userback.io/pricing/): Free; Team $29/mo annual; Business $79 (replay, dev tools); Business Plus $159 (REST API, **webhooks**).

**Gleap**
- HQ and data: Gleap GmbH, Dornbirn, Austria. EU residency on DigitalOcean Frankfurt (per search summary of https://www.gleap.ai/legal/privacy-policy, partially UNVERIFIED).
- Self-host: none.
  - The JS SDK repo is MIT (https://github.com/GleapSDK/JavaScript-SDK).
  - npm `gleap@19.1.0` reports license "Commercial", so the two conflict.
- Capture: screenshot, console, network and replay, with selector masking (https://www.gleap.ai/product/in-app-bug-reporting).
- Integrations: GitHub, GitLab, ClickUp, Jira, Linear, Azure DevOps and webhooks (https://www.gleap.ai/integrations). Forgejo, Gitea and Vikunja: none.
- Pricing (https://www.gleap.ai/pricing): Starter $49/mo (1 seat), Team $149, Pro $299, Enterprise from $999, plus AI credits.
- Product direction: Gleap has pivoted to AI customer support ("Kai"), so bug reporting is now a sub-feature.

**Jam.dev**
- Data: GCP US-Central, SOC 2 Type II (https://jam.dev/docs/administration/security). HQ is UNVERIFIED.
- Form factor: a browser extension or Mac app, plus "Recording Links" with `recorder.js`/`capture.js` on your domain (https://jam.dev/docs/custom-recording-domain). It is not a classic in-app widget.
- Capture: console, network, instant replay and blurring.
- Integrations: GitHub, GitLab, ClickUp and webhooks. Forgejo, Gitea and Vikunja: none.
- Pricing (https://jam.dev/pricing): Free (5 creators); Team $14/creator/mo annual. No self-hosting and no EU residency stated.

**Bird Eats Bug**
- Acquired by BrowserStack in August 2024 (https://en.wikipedia.org/wiki/BrowserStack).
- Has a Web SDK with console, network and env capture.
- Integrations: Jira, GitHub, Slack, Zapier, Linear and Trello. Forgejo, Gitea and Vikunja: none.
- Pricing: from $50/mo for 5 members (https://birdeatsbug.com/pricing, via search).
- Data location: UNVERIFIED.

**Shake (shakebugs.com)**
- HQ: Zagreb, Croatia (Chrome Web Store listing).
- Focus is mobile. Integrations: Jira, Slack and Trello. Pricing from about $160/mo for Starter (https://www.shakebugs.com/pricing/, via search).
- Web SDK depth and data location: UNVERIFIED.

**Instabug, now Luciq**
- Rebranded in September 2025.
- Mobile only, with no web SDK.
- Enterprise pricing on request (https://en.wikipedia.org/wiki/Luciq).

**Sentry User Feedback widget (`feedbackIntegration`)**
- SaaS data: there is an EU region in Frankfurt (`de.sentry.io`) on every plan (https://sentry.zendesk.com/hc/en-us/articles/25074658211227).
- Self-host:
  - License: FSL-1.1-Apache-2.0. Internal use is OK; reselling Sentry as a service is not.
  - Minimum footprint: 4 CPU, **16 GB RAM plus 16 GB swap (32 GB recommended)**, 20 GB disk (https://develop.sentry.dev/self-hosted/).
  - Full User Feedback needs self-hosted version 24.4.2 or later (https://docs.sentry.io/platforms/javascript/user-feedback/).
- Capture:
  - Screenshot (`enableScreenshot`, SDK 8+) is taken via `getDisplayMedia`, which needs a permission prompt and does not work on mobile (`packages/feedback/src/screenshot/components/useTakeScreenshot.tsx`).
  - The annotation editor has only **highlight** and **hide (black-out)** tools, with no arrows or text (`ScreenshotEditor.tsx`, `DrawType = 'highlight' | 'hide'`).
  - The replay buffer is "up to 30 seconds" and needs `replaysOnErrorSampleRate > 0`.
  - Errors, breadcrumbs (console and fetch), tags and context come from the SDK. Custom tags go through `tags` or `captureContext`.
- CSP:
  - Options `styleNonce` and `scriptNonce` exist (`packages/core/src/types/feedback/config.ts`).
  - Replay needs `worker-src 'self' blob:` (https://github.com/getsentry/sentry-docs/blob/master/docs/platforms/javascript/common/session-replay/troubleshooting.mdx). The replay `workerUrl` option allows a self-served worker.
  - The SDK `tunnel` option can keep `connect-src 'self'`.
- VS Code webview: the form and replay can work, but the screenshot cannot (no `display-capture`).
- Integrations: native GitHub, GitLab and Jira issue creation, plus alert rule "Issue Category = Feedback" leading to an integration or webhook (https://docs.sentry.io/product/user-feedback/, https://docs.sentry.io/organization/integrations/integration-platform/webhooks/issue-alerts/).
  - Forgejo, Gitea and Vikunja: none. There is an open request at https://github.com/go-gitea/gitea/issues/34371.
  - To reach Forgejo or Vikunja you need a webhook relay that calls their APIs.
- Spam detection uses a Google Cloud LLM. On self-hosted it is UNVERIFIED.
- Pricing (https://sentry.io/pricing/): Developer free (1 user, 50 replays); Team $26/mo; Business $80/mo; 1 GB attachments included.

**GlitchTip**
- Who: Burke Software and Consulting; user-funded. MIT license (https://gitlab.com/glitchtip/glitchtip-backend).
- Since v6.0.5 (2026-02-08) it ingests Sentry `feedback` and `user_report` envelope items as UserReport.
- **But it ignores `attachment`, `replay_recording`, `replay_event` and `replay_video` items** (`apps/event_ingest/schema.py`, `IgnoredItemType`). That means Sentry feedback screenshots and replays are dropped.
- Alerts:
  - Recipients: email, generic webhook, Discord, Slack, Google Chat, Teams and Feishu (`apps/alerts/constants.py`).
  - No alert code references user reports (from grep), so new feedback probably does not trigger alerts (UNVERIFIED at runtime).
- Integrations: GitLab error tracking and Grafana (https://glitchtip.com/documentation/integrations).
- HQ country: UNVERIFIED.

**Bugsink**
- Who: Bugsink B.V. (Dutch B.V.; city UNVERIFIED). License is PolyForm Shield 1.0.0 (https://github.com/bugsink/bugsink/blob/main/LICENSE).
- **Discards all envelope items except `event` and minidump attachments** (`ingest/views.py` factory). User feedback, screenshots and replays are all dropped.
- Alerts: Slack, Mattermost, Teams, Discord, Google Chat, Telegram and custom webhook.

**OpenReplay**
- HQ: Asayer Inc. dba OpenReplay, Paris, France.
- License: AGPL-3.0 by default, with an `ee/` directory under its own license (https://github.com/openreplay/openreplay/blob/dev/LICENSE).
- Self-hostable session replay. "Assist" is live co-browsing over WebRTC, not feedback (https://docs.openreplay.com/en/plugins/assist/). "Spot" is a Chrome extension for bug recording (https://docs.openreplay.com/en/spot/).
- **No in-app feedback widget found.**
- Issue trackers: Jira, GitHub or Linear, only one at a time (https://docs.openreplay.com/en/integrations/github/). Forgejo, Gitea and Vikunja: none.

**PostHog**
- EU Cloud in Frankfurt (https://europeanstack.com/software/posthog). Self-hostable.
- Has a survey "feedback widget" tab.
- **No screenshot or bug-report capture.** Requests are still open: https://github.com/PostHog/posthog/issues/26010, https://github.com/PostHog/posthog-js/issues/3814 (opened 2026-06-11), https://github.com/PostHog/posthog/issues/64659.

**Highlight.io**
- Acquired by LaunchDarkly in April 2025. **The standalone service shut down on 2026-02-28** (https://nodejs.highlight.io/blog/launchdarkly-migration, https://bex.co/blog/2026/07/12/highlightio-launchdarkly-shutdown-observability).
- The repo is still Apache-2.0 with `enterprise/` excluded, but there is no supported product.

**feedback.fish**
- Text feedback widget. Free for 25 submissions, then $19/mo (https://feedback.fish/, via search).
- Screenshot and console capture, integrations and data location: UNVERIFIED. I treat it as a plain text widget.

### Open-source libraries for screenshots, annotation and replay (license, activity)
- **snapdom** (zumerlab/snapdom): MIT, 8.2k stars, v3.3.0 released 2026-10-05. Cross-origin assets need CORS or a proxy (https://github.com/zumerlab/snapdom).
- **html-to-image** (bubkoo): MIT, 7.3k stars, pushed 2026-05. BugDrop uses it.
- **modern-screenshot** (qq15725): MIT, 2.1k stars, pushed 2026-04.
- **html2canvas** (niklasvh): MIT, 31.9k stars, **last push 2024-07, stale**.
- **html2canvas-pro** (yorickshan): MIT, active 2026-10-04, has a per-call CSP nonce config.
- **dom-to-image** (tsayen): MIT, last push 2024-04, stale.
- These are DOM rasterisers, with no `getDisplayMedia`. So they are expected to work in both the browser and VS Code webviews under Unfold's CSP (`img-src data:` is already allowed). This exact CSP is UNVERIFIED and needs a spike test.
- **marker.js 3 and marker.js 2** (ailon): **"Linkware" license**. Free only if a visible link back to markerjs.com is kept. Commercial licenses (https://markerjs.com/):
  - $499 for a single app.
  - $990 for unlimited apps.
  - $2,990 for OEM, which is required for "Use in developer tools" and "white-label products".
  - Unfold is arguably a developer tool, so check whether OEM applies (UNVERIFIED reading).
- **Excalidraw**: MIT, 133k stars. Heavy for annotation alone.
- **rrweb**: MIT, 20k stars, active. Building a ring buffer of the last 30–60 s yourself is feasible.

### Self-hostable open-source Marker.io clones
| Project | License, activity | Notes |
|---|---|---|
| **FasterFixes** (https://github.com/manucoffin/faster-fixes) | Dashboard AGPL-3.0, widget MIT; 39 stars; created 2026-03 | Next.js, Postgres, Inngest, S3. Screenshot, console, network, MCP. GitHub, Linear and Jira only. |
| **BugDrop** (https://github.com/bugdrophq/bugdrop) | MIT; 64 stars; pushed 2026-10-02 | GitHub Issues only. Screenshots via html-to-image go to a repo branch. Has `data-bugdrop-mask`. |
| **SitePing** (https://github.com/NeosiaNexus/SitePing) | MIT; 74 stars | DOM-anchored annotations, console and network capture, masking. Server package has webhooks. |
| **Crikket** (https://github.com/redpangilinan/crikket) | AGPL-3.0; 151 stars; **last push 2026-03-19** | Screenshot or video, console, network. |

None of these has a Forgejo, Gitea or Vikunja integration.

### Ranked top 3 for Unfold
1. **Build a first-party "Report a problem" (recommended).**
   - Screenshot: snapdom or html-to-image (MIT), which works in the browser and in VS Code webviews under the existing CSP.
   - Annotation: your own small canvas tool (box, arrow, blur), or marker.js 3 with a paid license.
   - Context: your own console and error ring buffer, a `fetch` wrapper for failed requests, route, Work Item, Run and Shift ids, and an optional rrweb 60 s ring buffer (MIT).
   - Unfold's Node server files the report through the existing tracker adapters: Forgejo `issueCreateIssue` then `issues/{index}/assets`, and Vikunja `PUT /projects/{id}/tasks` then `PUT /tasks/{id}/attachments`. GitHub, GitLab and ClickUp follow later.
   - This is the only option that covers Forgejo and Vikunja, keeps the CSP intact, works in webviews, and is tenant-scoped for phase 2.
2. **Option 1 plus self-hosted Sentry for backend and frontend error context.**
   - Attach the Sentry event or replay link to the report, using the `tunnel` option and `workerUrl` to stay within `'self'`.
   - Skip Sentry's feedback widget, because its screenshot relies on `getDisplayMedia` and its editor is limited to highlight and hide.
   - Cost: a 16–32 GB RAM footprint, which in the Netherlands means a real power and hardware cost.
   - A lighter alternative is SaaS Sentry on `de.sentry.io` (Frankfurt), whose GitHub and GitLab issue creation is native.
3. **Marker.io Team ($149/mo annual) with a webhook relay to Forgejo or Vikunja.**
   - Best ready-made UX and EU data (Brussels and Ireland).
   - Costs: loosening CSP (`'unsafe-inline'` styles, third-party frame, script and connect origins), no VS Code webview support, and no native Forgejo or Vikunja.
   - The Starter tier lacks console, network, replay and webhooks.

### Ruled out, with the reason
- **GlitchTip**: drops feedback screenshots and replays (`IgnoredItemType`). New feedback likely raises no alert.
- **Bugsink**: discards feedback entirely.
- **BugHerd**: US-only hosting and no console or network capture.
- **Userback**: US hosting; webhooks only at $159/mo.
- **Jam.dev**: GCP US; extension or recording-link model, not an embedded app widget.
- **Bird Eats Bug**: now part of BrowserStack; no Forgejo, Gitea or Vikunja; hosting unverified.
- **Shake**: mobile-first, with only Jira, Slack and Trello.
- **Luciq/Instabug**: mobile only, enterprise pricing.
- **PostHog**: no screenshot or bug-report capture yet.
- **Highlight.io**: shut down on 2026-02-28.
- **OpenReplay**: no in-app feedback widget; AGPL and heavy.
- **feedback.fish**: text only.
- **Gleap**: has pivoted to AI support; $149/mo or more plus AI credits; no self-hosting.
- **Usersnap**: EU-based and a good fit on data, but session recording needs €219/mo and webhooks need €459/mo, and it needs third-party CSP origins.
- **FasterFixes, BugDrop, Crikket and SitePing**: young (39–151 stars), no Forgejo or Vikunja, and FasterFixes and Crikket are AGPL. Use them as reference designs, not dependencies.
- **Sentry feedback widget as the main UI**: `getDisplayMedia` breaks in webviews, and the annotation tools are minimal.

### Judgement
Yes: for Unfold, building the reporter on an MIT screenshot library, with optional Sentry or GlitchTip error context, beats buying Marker.io.
- Marker.io's advantages are polish and zero build time.
- It fails three of Unfold's hard constraints:
  - It has no Forgejo or Vikunja support, so a relay is needed anyway.
  - It does not work under Unfold's strict CSP.
  - It cannot run inside the VS Code webviews.
- It also bills per workspace, which does not suit a multi-tenant agency service.
- The build is small, because the tracker filing paths are two documented REST calls each. The pieces are:
  - a screenshot call,
  - an annotation canvas,
  - ring buffers for console and network,
  - an id snapshot,
  - one server endpoint.
- If GlitchTip is used for context, do not rely on it for screenshots or replay, because it drops both.
