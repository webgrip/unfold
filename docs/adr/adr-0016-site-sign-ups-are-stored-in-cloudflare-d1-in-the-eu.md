---
status: accepted
date: 2026-10-02
decision-makers: Ryan Grippeling
---

# Site sign-ups are stored by a small Worker in Cloudflare D1, in the EU jurisdiction

## Context and Problem Statement

The landing page asks people who want hosted Unfold, an agency offering or support for self-hosting to leave an email address ([ADR-0005](adr-0005-unfold-is-offered-to-agencies.md)). The site is static HTML on Cloudflare Workers Static Assets ([ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)) and loads nothing from a third party. Where do the sign-ups go, and what does the site need to receive them?

## Decision Drivers

* Personal data stays in the EU, and the site stores only what the purpose needs: no IP address, no cookies, no trackers.
* The form works without JavaScript and is better with it.
* No new third party: the site already runs on Cloudflare, and nothing else may see a visitor.
* The meta Content Security Policy stays strict: no `unsafe-inline`, `form-action 'self'`, `connect-src 'self'`.

## Considered Options

* A Worker on the same site that writes to Cloudflare D1, created in the EU jurisdiction
* A hosted form or newsletter service (an embed or a cross-origin POST)
* A mailto link

## Decision Outcome

Chosen option: "A Worker on the same site that writes to Cloudflare D1, created in the EU jurisdiction", because it keeps the data with the processor the site already uses, inside the EU, and needs no change to the CSP.

* `apps/site/src/worker/` is the site's Worker. `wrangler.toml` sets `main`, binds the assets as `ASSETS` and limits `run_worker_first` to `/api/*`, so every page is still served straight from the assets and only the form reaches code.
* `POST /api/signup` takes an email address, one interest (hosted Unfold, as an agency for its clients, both, or self-hosting with support) and a consent checkbox. A filled honeypot field is answered as a success and stored nowhere. A plain form POST gets a 303 to a thanks or problem page in its own locale; a fetch with `Accept: application/json` gets JSON and the page confirms inline.
* The Worker creates the `signups` table if it does not exist and upserts by lowercase email. It stores the email, the interest, the page locale, the privacy statement version agreed to, and when. It stores no IP address, user agent or other request metadata, and Workers invocation logs are off.
* The D1 database is created with `--jurisdiction eu`. A jurisdiction can only be set when the database is created, so the database is created by hand, once, and its id is pasted into `wrangler.toml`; it is the only place the id lives. A release deploy refuses to run while the id is a placeholder.
* A daily cron trigger deletes sign-ups last confirmed more than 24 months ago. The privacy page at `/privacy` and `/nl/privacy` names the controller, the purpose, consent as the legal basis, what is stored, the retention, Cloudflare as processor with EU storage, the rights and how to withdraw.

### Consequences

* Good, because the site has no new third party, the CSP is unchanged and the form works without JavaScript.
* Good, because the stored data is only what the purpose needs and its retention is enforced by code, not by memory.
* Bad, because the site is no longer assets-only: it has a Worker, a cron trigger and a D1 binding, and the deploy token needs D1 permission.
* Bad, because the first deploy waits on a manual step: creating the EU database and pasting its id.
* Neutral, because the Worker that receives the form can run in any Cloudflare data centre; only the storage is restricted to the EU, and the privacy page says so.

### Confirmation

`src/worker/signup.test.ts` covers the plain and the fetch path, validation, the honeypot, the lowercase upsert, cross-origin and oversized requests, the absence of request metadata in what is stored, and the retention job. `src/config/privacy.test.ts` checks the routing and bindings in `wrangler.toml` and that both privacy pages name the controller and the retention period. `pnpm run build:release` fails while `wrangler.toml` has no real D1 database id.

## Pros and Cons of the Options

### A hosted form or newsletter service

* Good, because it brings sending, unsubscribing and double opt-in.
* Bad, because it adds a third party that sees every visitor who submits, and a cross-origin POST or embed that the CSP would have to allow.

### A mailto link

* Good, because it needs no code and stores nothing on the site.
* Bad, because it does not record the interest or the consent, and it depends on the visitor's mail client.

## More Information

* 2026-10-02 — Accepted. The owner chose D1 in the EU, the four interests, the honeypot, no IP address, the no-JavaScript path and the privacy page. The 24-month retention was proposed with the implementation and is one constant, `SIGNUP_RETENTION_MONTHS` in `apps/site/src/config/site.ts`, which the privacy test ties to both privacy pages.
* The owner steps for creating the database are in [the site's deploy guide](../../apps/site/docs/deploy.md).
