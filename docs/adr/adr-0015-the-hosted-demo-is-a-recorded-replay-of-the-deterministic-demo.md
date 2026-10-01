---
status: proposed
date: 2026-10-01
decision-makers: Ryan Grippeling
---

# The hosted demo is a recorded replay of the deterministic demo

## Context and Problem Statement

The marketing site should let a visitor try Vloer without installing anything. Vloer's deterministic demo (`mise run demo`) needs Node, Git and a writable disk: it copies `examples/order-service`, changes real code and runs real `node --test`. The site is static files on Cloudflare Workers Static Assets ([ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)). How does the site show Vloer's real interface, stay true to what the demo does, and stay in step with the product without anyone remembering to update it?

## Decision Drivers

* The page must be Vloer's own interface, not a lookalike that drifts.
* A deterministic demo says it is one and never invents model calls or spend. A replay must not pretend to run anything.
* Nothing on the site may execute code, hold state for visitors or need a server.
* A Vloer change that breaks the page must fail a gate, not a visitor.

## Considered Options

* A recorded replay of the deterministic demo, served under `/demo` with Vloer's unchanged UI
* A hosted `npm run demo` server for visitors
* A video or screenshots of the demo
* A separate interactive mock-up built for the site

## Decision Outcome

Chosen option: "A recorded replay of the deterministic demo", because it shows the real interface with the demo's real responses, runs nothing, and a gate can prove it still matches.

* `apps/vloer/scripts/record-replay.ts` runs `createApplication` in demo mode in-process with a fixed clock, requests every view the UI reads (following pagination cursors), and runs the demo session from create to completion plus one fresh session per review decision. It keeps one snapshot per session event, normalises ids and temporary paths, and writes `apps/site/replay/replay.json` with a manifest of the sha256 of every file in `apps/vloer/public` and the recording commit.
* `apps/vloer/public/replay/replay.js`, which the product never serves, replaces `fetch` and `EventSource` for `/api/` on the `/demo` page only. It answers from the recording, plays the session one event every 1.2 seconds from when the visitor starts it, keeps that progress in sessionStorage, and moves recorded times so they read as recent. `public/replay/routes.js` lists what it answers, what it plays from the session timeline, and what it refuses: every other mutation answers HTTP 409 `static_demo` ("This hosted replay is recorded. Run mise run demo to try this."), which Vloer shows as a toast.
* Vloer's static paths are relative to the page, so the unchanged UI works under `/demo/`. API paths stay root-absolute; the shim intercepts them.
* The site build copies `apps/vloer/public` from the same commit and the recording into a gitignored `apps/site/public/demo/`, and writes an `index.html` with its own meta CSP and a banner outside `#app`: "Recorded replay of Vloer's deterministic demo at <commit> (recorded <date>). Nothing runs here; run mise run demo locally." The build fails when a Vloer public file no longer matches the manifest. `/demo` is `noindex` and outside the sitemap.
* A site release does not follow a Vloer change by itself: the site train counts only commits under `apps/site`. A Vloer UI change therefore carries its regenerated recording (`mise run demo-record`) in a `site`-scoped commit, which also releases the site.

### Consequences

* Good, because the page is Vloer's own code at a known commit, with responses the demo really gave.
* Good, because a stale recording fails `mise run verify` before merge and the site build before deploy.
* Good, because the site stays static: no visitor state on a server, no execution, no cost per visitor.
* Bad, because a Vloer UI change now also needs a re-recording and a site-scoped commit, and every such change re-releases the site.
* Bad, because the replay plays one fixed session; pausing, cancelling, instructions, custom briefs, pack opening and settings changes are refused. `mise run demo` remains the way to try them.
* Bad, because the recording adds about 0.7 MiB of JSON (about 55 KiB compressed) to the repository and the site.

### Confirmation

`mise run verify` runs the `demo-replay` group: `npm run replay:check` in `apps/vloer` re-records in memory, compares it with the committed recording after masking timings, Git object ids and bundle sizes, checks every public file hash against the manifest, and fails when an `/api/` path literal in Vloer's browser code is neither answered nor refused by `routes.js`. `mise run demo-replay-conformance` (opt-in, needs Chromium) builds `/demo` with the site's build step and drives the real UI against it: twenty views, the full session timeline and its review at desktop, dark and phone sizes, with zero unmatched requests, page errors or CSP violations and no `/api/` request reaching the network. The site deploy checks that `/demo/` answers 200.

## Pros and Cons of the Options

### A hosted `npm run demo` server for visitors

* Good, because every action works.
* Bad, because it runs code for anonymous visitors, needs isolation, a server and cleanup, and the site would stop being static.

### A video or screenshots of the demo

* Good, because it is the smallest and simplest to host.
* Bad, because nothing is interactive, and nothing fails when the UI changes.

### A separate interactive mock-up built for the site

* Good, because it can show exactly the story the page wants.
* Bad, because it is a second UI that drifts from Vloer and invites invented numbers.

## More Information

* Refines [ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md): the site still releases on its own, and a Vloer UI change reaches `/demo` through a re-recording committed under `apps/site`.
* [Local demo](../workflows/local-demo.md) and [the site's deploy guide](../../apps/site/docs/deploy.md) describe the workflow.
* 2026-10-01 — Proposed with the first recording.
