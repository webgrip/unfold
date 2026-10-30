---
status: proposed
date: 2026-10-30
decision-makers: Ryan Grippeling
---

# Unfold works as an offline shell and offers a phone triage view

## Context and Problem Statement

[ADR-0026](adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md) decided that Unfold is an installable web app that notifies from the server. On 30 October 2026 the owner accepted it for the notifier, which is built, and split off the parts that are not: a shell that loads offline, and a narrow view for triage on a phone. Design detail stays in [RFC-0004](../design/rfc-0004-unfold-on-phones-and-desktops.md).

## Decision Drivers

* A person opening Unfold on a train must see the shell and a clear offline state, never a browser error page.
* An approval must never be queued offline and sent later, because the world may have moved on.
* A phone needs the few actions a person takes away from a desk, not the whole workbench.

## Considered Options

* A cached shell with network-first reads, and a triage view
* No offline support

## Decision Outcome

Chosen option: "**A cached shell with network-first reads, and a triage view**".

* `public/sw.js` caches the shell and serves API reads network-first. It never queues a mutation offline.
* A narrow triage view serves phones: what waits for the person, with answer, approve and open actions. It does not merge, because Unfold never merges.

### Consequences

* Good, because Unfold opens offline and says so plainly.
* Bad, because a stale cached read can mislead; every cached read shows its age.

### Confirmation

* `mise run verify` includes a browser check (`npm run test:browser`) that registers `public/sw.js`, loads the shell offline, and proves an approve request made offline fails visibly and is not retried later.

## More Information

* 2026-10-30: proposed, split from ADR-0026 by the owner.
