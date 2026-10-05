# RFC-0004: Unfold on phones and desktops

> Status: **Proposed** 2026-10-05 · Date: 2026-10-05 · Decision: [ADR-0026](../adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md) · Research: [substrate, language and Run bottlenecks](https://github.com/ploeg-hq/ploeg/blob/development/docs/research/2026-10-05-substrate-language-and-run-bottlenecks.md) §7
>
> **TL;DR.** Unfold becomes an installable web app on desktop, Android and iOS from the code it already has. The server notifies a person when work needs them or a pull request is ready, first through ntfy and later through Web Push, so nobody needs an open tab. A phone gets a short triage view. A native shell (Tauri or Capacitor) is built only if a measured need appears. Before any of this, the homelab must decide how a phone reaches Unfold away from home.

Nothing here is built yet. Every route, table and setting below is proposed.

## Why

In [Work Item 138](https://github.com/ploeg-hq/ploeg/blob/development/docs/research/2026-09-29-incident-work-item-138.md), 3 h 07 min passed before the owner learned anything, through two retries and a kill. Waiting for a person is probably the largest part of the time from ticket to merged change. Unfold notices what needs a person, but it can only say so in an open tab: `public/core/attention.js:87-167` uses the in-page Notification API.

## What exists

| Part | State |
| --- | --- |
| Manifest | `public/site.webmanifest` with `display: standalone` and icons |
| Layout | A navigation drawer and phone media queries in `shell.css` and `work.css` |
| Service worker | None |
| Push | None |
| Live updates | Server-sent events at `src/http.ts:516`; one client scheduler in `public/core/live.js`, which pauses when the tab is hidden |
| Approve and reject | `POST /api/ploeg/work-items/:id/(approve\|reject\|cancel)` (`src/http.ts:396`); viewers are refused |
| Cracks and context | Confirm, dispute and resolve; context-file upload (`src/http.ts:398-399`) |
| Reachability | LAN-only: the HTTPRoute is on `envoy-internal` in homelab-cluster |
| ntfy | Deployed and public on `envoy-external`; no upstream base URL, so iOS has no instant delivery |

## Phase 0: reach Unfold away from home

This is not Unfold's change. It belongs in `webgrip/homelab-cluster`, with its own ADR there. There are two options:

* **A VPN** (WireGuard or Tailscale) to the LAN. Unfold stays internal. Every phone needs the VPN running.
* **`envoy-external` behind Authentik OIDC.** Unfold already supports OIDC (`src/oidc.ts`). The route becomes public, so the session cookie and rate limits matter more.

Until this is decided, a notification can reach the phone but tapping it opens a page that does not load off-LAN.

## Phase 1: installable app and server-side notifications

### Service worker

`public/sw.js` is a static file with no build step, so it fits [Unfold app ADR 0002](../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md) on build-free startup. It:

* caches the application shell (HTML, CSS, JS and icons) with a version key;
* serves API reads network-first, with a cached copy shown as stale when offline;
* **never queues a mutation offline.** An approval, rejection or cancel made offline fails visibly. A queued approval could start paid work hours later, without the person seeing the state it was approved against;
* handles `push` and `notificationclick`, and opens the Work Item's URL.

The manifest gains `id`, `scope` and shortcuts to "Needs you" and "Proposed".

### Notifier

A server-side notifier watches Ploeg's operator events and Unfold's `now` projection, and sends one notification per event that needs a person:

| Event | Notification | Opens |
| --- | --- | --- |
| A Work Item enters Needs you | "Needs you: <title>, <reason>" | the Work Item |
| A proposed Work Item awaits approval | "Proposed: <title> (<budget>)" | the proposal |
| A pull request is ready for review | "Ready for review: <title>" | the Work Item, which links the pull request |
| A launch waits for capacity longer than 10 minutes | "Waiting for a machine since <time>; nothing spent" | the Work Item |

Rules:

* One notification per Work Item per state change. A repeated event within 10 minutes is collapsed with a notification tag.
* A person sees only notifications for Teams they can read, and only for events they subscribed to.
* The body never carries secrets, prompts or code. It carries a title, a reason and a link.

### Delivery

| Channel | Why first or later | Work |
| --- | --- | --- |
| **ntfy** (first) | Already deployed and reachable off-LAN. An HTTP POST per notification. Android gets it through the ntfy app or UnifiedPush; iOS needs the ntfy upstream relay set in homelab-cluster | About 50 lines and a per-person topic setting |
| **Web Push** (second) | No extra app. Works on desktop browsers and Android; on iOS 16.4+ only after Add to Home Screen | VAPID and aes128gcm in `node:crypto`, so `ws` stays the only runtime dependency, plus a subscriptions table and egress to the browser vendors' push services |

### Phone triage view

A narrow view, `/m`, reached through the manifest shortcut:

* **Needs you:** a list, each item with its reason.
* **Proposed:** a list with approve and reject. Approving shows the budget and asks to confirm.
* **A card summary.** The Run card uses the flat skin on narrow screens; the three.js forge skin stays on desktop.
* **Out of scope:**
  * merging, because Unfold never merges ("Where Unfold's responsibility ends" in [who Unfold is for](../concepts/who-unfold-is-for.md)); the view links to the pull request;
  * steering a running Run, until the `commands` route exists.

### Effort

About 1,5–2,5 weeks: service worker and manifest 2–3 days, notifier and ntfy 3–4 days, Web Push 3–4 days, triage view 3–4 days.

## Phase 2: a native shell, only on a measured need

Build one only if one of these is asked for and the web app cannot do it:

* biometric confirmation before an approval;
* `unfold://` deep links from other apps;
* a desktop tray;
* reliable iOS push without Add to Home Screen.

| Shell | Fit |
| --- | --- |
| Tauri 2, loading the remote URL | Desktop and mobile from one Rust host with little Rust of one's own. Deep-link, biometric and store plugins are official; remote push is not (tauri#11651). Bundling the frontend would break the `SameSite=Strict` cookie and need the bearer credentials of [app ADR 0037](../../apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md) |
| Capacitor | The `public/` directory works as `webDir` with no bundler. It has an official FCM and APNs push plugin. No desktop target, but the web app and the VS Code extension already cover desktop |

Choose Capacitor if push on phones is the driver, and Tauri if desktop integration is. Either needs an ADR on store and signing: TestFlight or the App Store, Play, F-Droid without FCM, and the Apple developer account. Estimated 2 weeks for desktop and 3–4 weeks for both phone platforms, including signing.

## Not proposed

* **A Rust rewrite of the server or frontend.** The server is an I/O proxy over Ploeg; the frontend is 52 k lines of build-free modules.
* **Flutter or React Native.** A second UI.
* **A local workspace daemon on the operator's machine.** That would be an execution feature, and Unfold has none ([ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md)). Local execution, if wanted, is a Ploeg decision about running `ploeg-worker` locally.

## Open questions

1. Phase 0: VPN or public route behind Authentik?
2. Should notifications go to a person (per-person topics and subscriptions) or to a Team channel as well?
3. Quiet hours: per person, or the Team calendar Ploeg already uses for flow figures?
