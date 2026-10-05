---
status: proposed
date: 2026-10-05
decision-makers: Ryan Grippeling
---

# Unfold checks its Ploeg client against Ploeg's published schemas

## Context and Problem Statement

Unfold talks to Ploeg only through the operator API. Ploeg publishes that API as JSON Schema in `apps/ploeg/docs/contracts/operator-api.v1.schema.json` and pins its Go types to it.

Unfold's client, `apps/unfold/src/ploeg.ts`, re-derives shapes, enums and length caps by hand (`src/ploeg.ts:135-540`). No test checks it against the schema. Unfold commit `33004aa` removed a client call to `PUT /api/v1/operator/consumer`, a route no Ploeg release ever had. Only a TypeScript fake had tested it.

Unfold also copies two Ploeg formulas for its deterministic demo and card breakdown: the rarity score (`src/rarity.ts`, `public/cards/card-model.js`) and the working-time calendar (`src/ploeg-demo-kpis.ts`). Their tests share no inputs with Ploeg's.

How does Unfold find out, in its own CI, that its client or its copies no longer match Ploeg?

This covers the Unfold application's Ploeg client and formula copies.

## Decision Drivers

* A client call to a route Ploeg does not have must fail Unfold's tests, not production.
* `ploeg.ts` keeps its hand-written handling: it degrades older Ploeg answers, redacts values, and keeps unknown facts as null rather than zero ([ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md)). A generator would replace types, not that logic.
* `ws` stays the only runtime dependency, and the frontend keeps no build step.
* Ploeg names none of its consumers. Unfold reads what Ploeg publishes; Ploeg does not test Unfold.

## Considered Options

* Test-time schema checks of every request and fake response, generated TypeScript types, and Ploeg's conformance vectors for formula copies
* Generate the whole client from the schema
* A shared Rust or WebAssembly core for the formulas
* Keep hand-written parsers and fakes as they are

## Decision Outcome

Chosen option: "**Test-time schema checks, generated types, and Ploeg's conformance vectors**". It catches the drift that has already happened, adds no runtime dependency, and keeps the client logic ADR-0018 relies on.

1. **Schema checks.** A test loads the pinned submodule's `operator-api.v1.schema.json` and checks two things:
   * every request `PloegClient` sends matches a route, method and body in the schema;
   * every response the TypeScript fakes return validates against it.

   A JSON Schema validator is a development dependency only.
2. **Generated types.** `json-schema-to-typescript` writes a checked-in `src/ploeg-contract.d.ts`. A `contract:check` script fails when the file is stale, as `design:check` and `icons:check` already do. `ploeg.ts` types its parsers against it.
3. **Conformance vectors.** Unfold's tests for `src/rarity.ts`, `card-model.js` and the demo calendar run the vector files Ploeg publishes under `apps/ploeg/docs/contracts/fixtures/` (Ploeg ADR-0074). A formula version Unfold does not implement fails its test.

All three run inside `mise run verify`, as part of the cross-application qualification.

### Consequences

* Good, because a call to a route that does not exist, or a fake that returns a shape Ploeg never sends, fails Unfold's CI.
* Good, because a Ploeg formula bump fails Unfold's copies in the same pin update.
* Good, because no runtime dependency or build step is added.
* Bad, because a submodule pin update can now fail on contract drift. That is the purpose, but it makes pin updates less routine.
* Bad, because the generated `.d.ts` must be regenerated on every schema change, adding one more check.

### Confirmation

* `mise run verify` runs the schema test and fails on a request to an unknown route. This is shown by reintroducing the removed `announce` call in a test branch.
* It runs `contract:check` and fails when `src/ploeg-contract.d.ts` differs from a fresh generation.
* It runs the conformance-vector tests and fails when a vector's expected tier or score differs.
* `npm ls --omit=dev` in `apps/unfold` lists only `ws`.

## Pros and Cons of the Options

### Generate the whole client from the schema

* Good, because there would be no hand-written shapes at all.
* Bad, because it loses the degrade, redact and null-not-zero handling ADR-0018 relies on, which no generator produces.

### A shared Rust or WebAssembly core for the formulas

* Good, because there would be one implementation.
* Bad, because it adds a third toolchain and a frontend build step for about 60 lines of arithmetic.

### Keep hand-written parsers and fakes as they are

* Good, because nothing changes.
* Bad, because drift is found in production, as `33004aa` showed.

## More Information

* Evidence: [substrate, language and Run bottlenecks](https://github.com/ploeg-hq/ploeg/blob/development/docs/research/2026-10-05-substrate-language-and-run-bottlenecks.md), §5 and §6.
* Ploeg side: [Ploeg ADR-0074](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0074-shared-formulas-are-pinned-by-published-conformance-vectors.md) publishes the vectors.
* Related: [ADR-0018](adr-0018-ploeg-releases-on-its-own-schedule-behind-a-tested-contract-version.md), which named schema-generated clients as a follow-up.
* 2026-10-05: proposed.
