---
status: proposed
date: 2026-10-05
decision-makers: Ryan Grippeling
---

# Unfold is an installable web app that notifies from the server

## Context and Problem Statement

The owner wants Unfold on desktop and on phones at the same time, and asked whether Rust should be part of how Unfold is set up.

Unfold's frontend is build-free ES modules in `apps/unfold/public/`. It already has a standalone manifest and a phone layout, but no service worker and no push. It can only tell a person that work needs them while a tab is open (`public/core/attention.js`). Waiting for a person is probably the largest share of the time from ticket to merged change.

How should Unfold reach desktops and phones, and where, if anywhere, does Rust belong?

This covers the Unfold web application. Design detail is in [RFC-0004](../design/rfc-0004-unfold-on-phones-and-desktops.md).

## Decision Drivers

* One frontend codebase. A second UI doubles every feature.
* A person must be told when work needs them, without an open tab.
* Self-hosted first ([ADR-0005](adr-0005-unfold-is-offered-to-agencies.md)): no dependency on an app store to use Unfold.
* Unfold has no execution features ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)).
* The frontend keeps no build step.

## Considered Options

* An installable web app with server-side notifications (ntfy first, then Web Push), and a native shell only on a measured need
* A Tauri 2 shell from the start
* Capacitor from the start
* A Rust UI (Dioxus or Leptos), or Flutter or React Native

## Decision Outcome

Chosen option: "**An installable web app with server-side notifications, and a native shell only on a measured need**". It reuses all of `public/`, needs no store, and solves the notification gap that actually costs time.

* `public/sw.js` caches the shell and serves API reads network-first. It never queues a mutation offline.
* A server-side notifier sends one notification per Work Item state change that needs a person: Needs you, proposed and awaiting approval, pull request ready, and a long capacity wait. It sends only to people who can read that Team.
* Delivery is ntfy first, because it is already deployed and reachable off-LAN, and Web Push second.
* A narrow triage view serves phones. It does not merge, because Unfold never merges.
* Rust enters only as the host of a Tauri shell, if Phase 2 of RFC-0004 is ever triggered. The server and frontend are not rewritten.

Unfold stays on the LAN; a phone reaches it over the owner's existing VPN.

### Consequences

* Good, because desktop, Android and iOS get Unfold from the existing code.
* Good, because people are told about work that needs them within a minute, without an open tab.
* Good, because no store account or signing pipeline is needed for Phase 1.
* Bad, because iOS delivers Web Push only to a web app added to the home screen, and ntfy needs its upstream relay for instant iOS delivery.
* Bad, because a web app cannot gate an approval behind biometrics. That is a Phase 2 trigger.

### Confirmation

* `mise run verify` includes a browser check (`npm run test:browser`) that:
  * registers `public/sw.js`;
  * loads the shell offline;
  * proves an approve request made offline fails visibly and is not retried later.
* A notifier test proves one notification per Work Item state change, and none for a person without read access to the Team.
* `apps/unfold/package.json` keeps `ws` as its only runtime dependency, and the frontend has no build step. Review rejects a change that breaks either.

## Pros and Cons of the Options

### A Tauri 2 shell from the start

* Good, because one Rust host serves desktop and mobile, with official deep-link and biometric plugins.
* Bad, because remote push is not official (tauri#11651).
* Bad, because it adds Xcode, the Android SDK and an Apple developer account before anyone has asked for a native feature.

### Capacitor from the start

* Good, because `public/` drops in as `webDir`, and its push plugin is mature.
* Bad, because it has no desktop target, and store pipelines are needed for phones.

### A Rust UI, or Flutter or React Native

* Good, because native performance and full platform access.
* Bad, because it rewrites about 52 k lines of frontend, and the three.js card skin does not carry over.

## More Information

* Evidence: [substrate, language and Run bottlenecks](https://github.com/ploeg-hq/ploeg/blob/development/docs/research/2026-10-05-substrate-language-and-run-bottlenecks.md), §4 and §7.
* Re-open with a native shell when biometric approval, deep links, a tray, or iOS push without Add to Home Screen is asked for twice.
* 2026-10-05: proposed with [RFC-0004](../design/rfc-0004-unfold-on-phones-and-desktops.md).
