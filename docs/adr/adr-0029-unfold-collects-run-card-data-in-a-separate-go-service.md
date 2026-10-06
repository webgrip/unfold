---
status: proposed
date: 2026-10-06
decision-makers: Ryan Grippeling
---

# Unfold collects Run card data in a separate Go service

## Context and Problem Statement

[ADR-0028](adr-0028-unfold-owns-the-run-card-and-collects-its-inputs-itself.md) moves card collection from Ploeg to Unfold. The Unfold application is a Node 24 server with a single SQLite writer ([app ADR 0002](../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md)).

Collection is a different workload:
* it receives forge, tracker and deploy webhooks;
* it polls forge APIs within rate limits;
* it follows Ploeg's event cursor;
* it computes card formulas and renders SVG.

The owner asked for a separate service, "so it doesn't interfere with critical lines", and asked whether Rust fits.

Where does collection run, in which language, and with what isolation?

## Decision Drivers

* A collection bug, backlog or outage must not slow the Unfold application or Ploeg.
* The authoritative card formulas exist today in Go inside Ploeg: `pkg/rarity`, `pkg/playkpi`, `pkg/flow`, `pkg/gate` and `pkg/cardimage`. That is about 3,900 lines, importing only the standard library or each other, with their tests and golden SVGs.
* Agents build in a sandbox without registry access, so the toolchain must already be in the monorepo.
* Unfold has no execution features ([ADR-0002](adr-0002-ploeg-is-the-only-engine.md)).

## Considered Options

* A separate Go service, `apps/collector`, with its own Postgres
* A separate Rust service
* A separate TypeScript service
* A module inside the Unfold application

## Decision Outcome

Chosen option: "**A separate Go service, `apps/collector`, with its own Postgres**".

* **Repository and release.**
  * It is a new application in the monorepo ([ADR-0001](adr-0001-unfold-contains-independent-applications.md)), with its own module, image `unfold-collector` and chart.
  * It releases on the Unfold train.
* **Inputs.**
  * Ploeg's operator event cursor and resources, read with a read-only operator token.
  * Webhooks from the forge, the tracker and deploy pipelines, written raw into an inbox table first.
  * Forge and tracker reads with its own bot identities.
* **Outputs.**
  * A versioned card contract over HTTP for the Unfold application. Its first version is today's Ploeg card schema.
  * The card comment on the pull request, posted and edited by marker.
* **Storage.** Its own small CloudNativePG Postgres with backups.
  * It cannot share Unfold's SQLite, which has one writer in one process.
  * Postgres lets Ploeg's card SQL be lifted largely as written.
  * Two replicas can receive webhooks while one leader, under an advisory lock, processes them.
* **Isolation.**
  * Its own Deployment and NetworkPolicy:
    * ingress only from the Unfold application and the webhook gateway;
    * egress only to Ploeg's operator API, the forge, the tracker and its database.
  * Ploeg never calls it, and the Unfold application degrades to "card unavailable" when it is down.
* **Not execution.** It starts no Run, spends no model budget and holds no Lease. It observes.
* **Language.**
  * Go, because the formula packages and their tests lift unchanged. The toolchain is already pinned in the monorepo (`mise.toml`). The workload is input and output bound, with CPU spent on arithmetic and SVG text.
  * Rust is not used. The service has no CPU or untrusted-input need that Rust would serve, there is no Rust toolchain in the monorepo, and the sandbox cannot fetch crates.
  * If PNG rendering is ever needed, a small separate rasterizer is the one place Rust could be reconsidered.
* **Alerting.** The collector's chart carries its own rules: inbox lag, cursor lag behind Ploeg, forge rate-limit exhaustion and comment publication failures. Nothing goes in homelab-cluster.

### Consequences

* Good, because collection is isolated from both critical paths, and the authoritative formulas move with their tests.
* Good, because one Go toolchain serves Ploeg and the collector, so agents build both in the same sandbox.
* Bad, because the monorepo gains a third application with its own database to operate and back up.
* Bad, because the collector holds forge and tracker credentials, so they need rotation and scoping: pull request read and comment write only, and tracker read only.

### Confirmation

* `apps/collector` tests run in `mise run verify`, including the lifted formula tests and golden SVGs, unchanged in their expected values.
* A test fails if `apps/collector` imports any Ploeg package other than its published contracts.
* The chart's golden render shows the NetworkPolicy ingress and egress lists above, and no Ploeg credential other than the read-only operator token.

## Pros and Cons of the Options

### A separate Rust service

* Good, because it gives a small binary and memory safety.
* Bad, because every formula must be ported with its tests, a third language enters the monorepo, and the sandbox cannot build it without vendored crates.

### A separate TypeScript service

* Good, because it is the same language as the Unfold application.
* Bad, because about 3,900 lines of formulas and their tests must be ported, and TypeScript is no better at this workload than Go.

### A module inside the Unfold application

* Good, because there is no new deployable.
* Bad, because collection would share the application's process and its single SQLite writer, which is the interference the owner wants to avoid.

## More Information

* Evidence: Ploeg's [KEDA, plug-and-play integrations, and card collection](https://github.com/ploeg-hq/ploeg/blob/development/docs/research/2026-10-06-keda-integrations-and-card-collection.md), §3.
* Related: [ADR-0028](adr-0028-unfold-owns-the-run-card-and-collects-its-inputs-itself.md), and Ploeg ADR-0073 (Rust only for a measured need), ADR-0074 and ADR-0077.
* 2026-10-06: proposed.
