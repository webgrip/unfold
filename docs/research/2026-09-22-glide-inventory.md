# Glide inventory and assessment

Date: 22 September 2026, against `development` at `69d1af2`. This is a record, not current guidance. [ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) and the [start page](../index.md) carry the decisions that followed from it.

Glide's goal is one loop: create a work item, assign it to agents, and let the agents do the code work until a pull request is ready for human review. Ploeg already runs most of that loop on the homelab cluster. Vloer duplicates Ploeg's execution engine, the documentation outweighs the product code, and no Glide release has shipped yet. The owner decided to keep only Ploeg's engine, make Vloer its front end, and restructure the documentation around the loop.

## Method

Six parallel read-only reviews each covered one area:

* Vloer source and tests
* Ploeg source and tests
* the integration seam between the two applications
* every tracked documentation file
* build, CI and release tooling
* product intent, research and git history

Claims were checked against source and executable tests before documentation. The headline numbers below were re-checked by hand. No live provider, cluster or registry was contacted.

## What exists

| Part | Implemented behavior | Evidence |
| --- | --- | --- |
| Ploeg controller (`ploegd`) | Turns tracker webhooks into Work Items, Shifts and Runs. Admits, leases and budgets work. Mints and blocks a LiteLLM key for each Run. | About 14.9k source lines and 13.4k test lines. `go test ./...` passes with 409 tests. It has run on the homelab since July. |
| Ploeg worker | Claims one Run, obtains a scoped key, runs a harness (OpenHands by default) and reports the outcome. | `apps/ploeg/cmd/ploeg-worker`, `pkg/worker`, `pkg/harness` |
| Vloer | A Node server with one SQLite file. A person watches and steers an AI crew in the browser or VS Code, and the result is captured as a signed patch and bundle for review. | About 6.5k source lines. 211 tests pass. The core engine was written from 9 to 12 September. |
| Vloer shared mode | Vloer still executes the whole crew. Ploeg admits it, leases it, holds the budget and records spend. | `apps/vloer/src/engine.ts`, `src/execution-authority.ts` |
| Cross-application integration | Both execution modes run against a deterministic fixture with zero model calls. | `scripts/integration.mjs` |

## Findings

### The two engines duplicate each other

The apps overlap in:

* two harness drivers, over different OpenCode protocols;
* two LiteLLM key brokers;
* two spend-hold state machines;
* two crew and review orchestrators;
* two workspace credential paths;
* two liveness protocols and event logs.

About 2.5k of Vloer's lines and 5.7k of Ploeg's cover the same concerns. The [12 September comparison](2026-09-12-execution-boundary.md) that retained both engines ran the Vloer runtime on both sides and never exercised the Go worker.

### The applications use the same words for different things

| Term | In Vloer | In Ploeg |
| --- | --- | --- |
| Run | One crew role step | One Role executing against a Work Item. One Ploeg Run held a whole Vloer crew in shared mode. |
| Harness, Execution, Review, Outcome | Its own meaning | A different meaning |

The mode Ploeg controls is also called "managed", "shared" and "unified" on different pages. Neither glossary defined Vloer, Ploeg, admission, authority, crew or cutover.

### The documentation outweighs the product

| Measure | Value |
| --- | --- |
| Documentation files | 328 |
| Words of prose | About 293k |
| Share of those words that is history (research, ADRs, planning, design baseline) | About 64% |
| Share that is tutorials | Under 1% |
| Places that answer "what are Vloer and Ploeg" | 16 |
| ADRs still "proposed" across the three ledgers | 41 of 80, several already implemented |
| Non-test TypeScript and Go | About 24k lines |

No page stated the problem Glide solves in one place.

### Releases have not moved to Glide yet

All 70 release tags predate the 12 September import, and `GLIDE_RELEASES_ENABLED` still gates publication. The committed readiness record says `not_ready_for_release_cutover`. Production state lives in the separate `homelab-cluster` repository, and at the last recorded inspection it ran Vloer `0.3.0-rc.14` and Ploeg `0.3.0-rc.6`.

### Correctness gaps

* Managed Runs never settle their LLM account holds against actual spend, because the reconciliation operation had no production caller.
* The cross-application integration never exercised key minting or blocking.
* `mise run verify` did not pass on a fresh clone.
* Security-relevant findings are tracked in the owner's tracker and are not listed here.

### Market position

The repository's own surveys (9–18 September, read from documentation, not installed) name OpenHands Enterprise and Kandev as the nearest alternatives. The distinctive part is Ploeg's: a budgeted, revocable model key and a branch lease for every run, on self-hosted infrastructure.

## Assessment

Ploeg is the product. It is tested, deployed and closest to the goal. Two deployable applications remain justified, because an interactive front end and an unattended worker have different runtime profiles. Two execution engines are not justified. The documentation problem is excess and inconsistent vocabulary, not missing pages.

## Decisions taken

* Glide is an internal tool, and the owner is its only adopter for now.
* Ploeg's engine is the only engine. Vloer becomes its front end, and Ploeg authorizes every real run ([ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md)).
* The documentation is restructured by page type around the work-item-to-pull-request loop. History stays as dated records outside the reading path.

## Limitations

The reviews read code and ran offline tests only. Paid providers, the live cluster and concurrency were not exercised. Line counts overlap by concern, not by exact function. The competitive survey is second-hand.
