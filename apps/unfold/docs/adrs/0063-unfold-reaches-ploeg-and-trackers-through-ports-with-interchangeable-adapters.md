---
status: proposed
date: 2026-10-31
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# Unfold reaches Ploeg and trackers through ports with interchangeable adapters

## Context and Problem Statement

The owner asked for ports and adapters: Unfold has a port and adapter for Ploeg, and one for a tracker such as ClickUp. A port is an interface written in Unfold's own terms. An adapter implements it against one outside system. Code that needs Ploeg or a tracker depends on the port, so the outside system can be swapped for another adapter without touching that code.

Unfold already does this for some integrations. Trackers have `TaskProviderAdapter`, with `TaskHandoff` and `IssueFiling` as optional capabilities (`src/task-providers/registry.ts`). Account links have `LinkProviderAdapter` (`src/link-providers/registry.ts`). Forges have `DeliveryPublisherAdapter` (`src/delivery-publishers/registry.ts`). Ploeg has no port.

**Ploeg.** `src/ploeg.ts` is about 2,100 lines, and 37 source files import it. `PloegClient` does three jobs in one class:

* Unfold policy: authorization, Team scope, Tenant reach and presentation.
* The adapter: requests to the operator API and parsing what comes back.
* The deterministic demo, chosen by about 60 `this.demo` branches, for example `listContext`, `decide` and `admitWorkItem`.

The demo is not a separate implementation. Its data lives in `src/ploeg-demo.ts`, but each `PloegClient` method decides how to use it.

Four places call Ploeg's HTTP API without `PloegClient`. Each builds its own headers, timeout and body reader:

* `src/task-binding.ts:26`, the Work Item lookup
* `src/execution-authority.ts:69`, the execution lease and heartbeat
* `src/delivery.ts:68`, execution delivery
* `src/linked-handoff.ts:333`, the run-token `claude-session` route

`src/http.ts` and `src/main.ts` decide demo or live in 12 more places with `config.ploeg && !ploeg.isDemo` (`src/http.ts:326`–`353` and `1049`–`1087`, `src/main.ts:43`). Ports already exist informally. Seven modules each declare their own type for delivery facts: `delivery-economics.ts:34`, `cards/service.ts:22`, `client-sign-off.ts:225`, `agent-trace-comments.ts:18`, `notify/service.ts:34`, `outbound/service.ts:54` and `billing.ts:109`. Three more take a `Pick<PloegClient, …>`: `take-over.ts:7`, `linked-handoff.ts:10` and `handoffs.ts:22`.

**Trackers.** The server side mostly asks for a capability rather than naming a provider. The browser does not. It keeps eight separate maps from provider to display name: `public/core/states.js:347`, `core/reasons.js:36`, `core/lookup.js:6`, `connections.js:13`, `ploeg.js:65`, `now.js:275`, `live/work-view.js:7` and `live/model.js:35`. It also hard-codes tracker behaviour:

* Vikunja and ClickUp priority scales (`public/start.js:54`–`69`)
* Vikunja HTML handling (`public/views/session.js:173`)
* `VIK-` as the default reference (`public/core/terms.js:27`–`37`)
* tracker hosts (`public/core/insight.js:5`)
* per-provider account copy (`public/views/account.js:13`)

The configuration has per-provider shapes: `links.gitlab` and `links.clickup` (`src/types.ts:67`, `src/config.ts:488`–`496`). Forgejo, GitHub and GitLab each appear in up to three registries: as a tracker, an account link and a publisher. ClickUp is both a tracker and an account link. Each role has its own configuration. The tests read the adapters through per-provider branches inside one loop (`test/tasks.test.ts:21`–`145`). Jira is tested in a file of its own, and the demo fixture in a test of its own.

How does Unfold reach Ploeg and trackers so that each outside system sits behind one port? The demo or a test should be a different adapter, not a branch, and adding a tracker should mean writing one adapter that passes one shared suite.

This covers the Unfold application's code. Ploeg's own ports are a Ploeg decision. Ploeg knows no consumer, so nothing here asks Ploeg for an Unfold-specific change.

## Decision Drivers

* Unfold submits and follows work and never executes it (system [ADR-0002](../../../../docs/adr/adr-0002-ploeg-is-the-only-engine.md), [0023](0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)). No adapter, including the demo and the fake, may run an agent.
* Unfold depends on a released Ploeg through its contract bundle (system [ADR-0039](../../../../docs/adr/adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md)). The live adapter is checked against that bundle (system [ADR-0027](../../../../docs/adr/adr-0027-unfold-checks-its-ploeg-client-against-ploegs-published-schemas.md), [ADR-0044](../../../../docs/adr/adr-0044-unfold-refuses-a-ploeg-that-does-not-serve-the-contract-majors-it-requires.md)).
* The deterministic demo says it is one and never invents model calls or spend.
* The tracker owns priority, and Ploeg owns dispatch and execution. Unfold's tracker port never queues work. Ploeg reads the tracker's assignment event for that ([0025](0025-hand-tracker-tasks-to-ploeg-by-assignment.md)).
* Every step merges on its own and keeps `mise run verify` green. Several sessions change these files at the same time.

## Considered Options

* **A typed Ploeg port with live, demo and fake adapters, and a Tracker port with declared capabilities and a shared conformance suite**
* Generate the whole Ploeg client from the contract bundle and keep the demo as branches
* Keep the current shape and add per-feature `Pick<PloegClient, …>` types as needed

## Decision Outcome

Chosen option: **a typed Ploeg port with three adapters, and a Tracker port with declared capabilities and a conformance suite**. It turns today's informal ports into one written contract and makes the demo something Unfold chooses, not a branch. A tracker that passes the suite works everywhere Unfold uses trackers.

### The Ploeg port

`src/ploeg-port.ts` declares `PloegPort`. It speaks Unfold's types (`PloegItem`, `PloegRun`, `WorkItemFacts`…) and applies no Unfold authorization or Tenant check. `PloegClient` stays the application service on top of it. It checks who may see or change what, and then asks the port. The port is built from area interfaces, so a consumer can depend on one area:

| Area | Operations |
| --- | --- |
| Contract | `served()`: the contract majors this Ploeg serves (ADR-0044) |
| Work reads | `teams`, `workItems(filter, cursor)`, `workItem(id)` with Shifts, Runs, events and the blackboard, `trackerItems(provider, externalId)`, `lookupBinding(taskPin)` |
| Runs and events | `runs(filter)`, `run(id)`, `transcript(runId, after)`, `events(before / after)`, `summary(window)`, `unsettled()`, `refusals()`, `connections()` |
| Hand-off | `admit(admission)`, `claimClientRun(id)`, `recordClientSession(runToken, session)` |
| Approvals and steering | `decide(id, approve / reject / cancel, guard)`, `requeue`, `note`, `answerQuestion`, `takeOver` |
| Context | `listContext(id)`, `addContext(id, upload)` |
| Spend | `askAllowance`, `admitAsk`, `finishAsk`, `askSpend`, and the same four for chat |
| Executions | lease, heartbeat, credential and delivery of an Operator Execution (today `execution-authority.ts` and `delivery.ts`) |
| Delivery facts | `factsSupported`, `workItemFacts`, `factsPage`, `putPullRequestComment` |

Every command carries the acting person: actor, acting user, channel, confirmation and person token where one exists (system ADR-0037, Unfold [0055](0055-unfold-proves-the-person-to-ploeg-with-a-token-exchanged-from-their-sign-in.md)). It also carries the idempotency `commandId` Ploeg already takes.

There are three adapters, and `PloegClient` chooses one when it is built:

* **Live**, `HttpPloegPort`. One request function for the operator API and the run-token API, with the token, timeouts, size limits and redaction `PloegClient.request` has today. Its routes, methods, bodies and the fakes' answers are checked against the contract bundle's schemas in the test suite (ADR-0027). It is written by hand, so it keeps the degrade, redact and null-not-zero handling a generator would lose.
* **Demo**, `DemoPloegPort`. It answers from `src/ploeg-demo.ts`. Each read says `demo`. A command that would change work refuses with `ploeg_demo`, and so does one that would spend, except where the demo already answers with an illustrative record that keeps nothing. It never reports a model call or spend.
* **Fake**, in `test/`. In memory, seeded per test and writable, so a test can approve, requeue or take over and then read the result. It replaces the hand-written partial fakes in the tests.

The `demo` flag on each result comes from the adapter's `kind`. It is no longer read from a branch.

### The Tracker port

`TaskProviderAdapter` becomes the Tracker port, keeping its registry and its rule that code outside an adapter never names a provider. Its parts:

* **Required.** `read` (one task), `list` (one page of a configured project), and the connection rules it has today: the API root, the project, the web link and the credential header.
* **Display facts**, which the browser reads instead of its own maps: the label, the reference format (`VIK-12`, `CU-abc`, a native Jira key), the description format, the priority scale with names and order, and the names of the hierarchy levels (for ClickUp: Workspace, Space, Folder, List).
* **Optional capabilities.** The adapter declares each one it has, and shared code asks before using it:
  * `browse`: walk the hierarchy by name to pick a project
  * `search`: find a task by text
  * `import`: bind a task to a Work Item (today's task binding)
  * `handoff`: assign the Team's tracker user and comment, as today
  * `comment`
  * `issues`: Report a problem, as today
  * `linkedAccount`: the account link that supplies a person's token
  * `testConnection`: one cheap authenticated call that says what is wrong
  * `webhooks`: the assignment event Ploeg listens for, and whether a board has it. Ploeg's connections report already tells Unfold this.

`GET /api/trackers` returns each registered tracker's display facts and capabilities. The browser builds its labels, priority names and reference formats from that answer.

**Conformance suite.** `test/tracker-conformance.test.ts` runs for every adapter in `taskProviders()`. It fails when an adapter has no fixture. Each adapter brings a fixture, `test/trackers/<name>.ts`: a fake server handler built from that tracker's documented answers, and the tasks it should produce. The suite then checks the same rules for every adapter:

* Scope is enforced: a task outside the configured project is refused.
* The token never appears in a snapshot, error, link or revision.
* Redirects are not followed with credentials.
* Pagination is capped.
* A revision is stable across reads and changes with a material edit.
* A closed task is readable, and an unknown state fails closed.

Every declared capability runs its own checks: hand-off assign and unassign, comment format, issue create, attach and state, and `testConnection` with a good and a bad token. A capability the adapter does not declare must produce the shared "which trackers can" refusal.

**Connections.** A tracker, an account link and a publisher on the same origin share one Connection: one origin, one credential reference and one Tenant grant (system [ADR-0048](../../../../docs/adr/adr-0048-projects-share-accounts-and-repositories-within-a-tenant-and-a-work-item-has-one-origin.md)). The adapter registers the configuration schema of its part of that Connection, replacing `links.gitlab` and `links.clickup` as fixed fields.

### Migration

Each step merges on its own and leaves `mise run verify` green.

| # | Step | Size and risk |
| --- | --- | --- |
| P1 | `PloegPort` with the delivery facts and context areas. `DemoPloegPort` and `HttpPloegPort`, chosen in the `PloegClient` constructor, which removes their `this.demo` branches. **Done with this record.** | About 250 lines. Low risk: no route, answer or wire request changes; the only change is the demo's error code for a facts read (below). |
| P2 | The seven local facts types become `Pick<PloegFacts, …>`, and the `Pick<PloegClient, …>` types become area interfaces. | About 60 lines, types only. Low risk. |
| P3 | Move the four direct callers (`task-binding.ts`, `execution-authority.ts`, `delivery.ts`, `linked-handoff.ts`) into the live adapter. | About 300 lines. Medium risk: the execution heartbeat is on a hot path, so keep its timeouts as they are and test it against the fake. |
| P4 | The fake adapter, and the contract-bundle schema check on every request the live adapter sends (ADR-0027). | About 400 lines, mostly tests. Low risk; it may surface drift, which is its purpose. |
| P5 | Move the remaining areas one PR at a time: spend, then approvals and steering, then hand-off, then reads. Each PR deletes its `this.demo` branches. | 5 PRs of 200–500 lines. Medium risk: the demo must answer exactly as before. The demo tests and the site demo's recorded replay (system ADR-0015) catch a change. |
| P6 | The 12 `isDemo` checks in `http.ts` and `main.ts` ask the port instead, for example whether it serves facts or can follow events. | About 80 lines. Low risk. |
| P7 | Split `src/ploeg.ts` into `src/ploeg/`: the port, the wire parsers, and the live, demo and fake adapters, with `service.ts` holding `PloegClient`. | Mechanical, but conflicts with any open PR that changes `ploeg.ts`. Do it when few are open. |
| T1 | The tracker conformance suite with fixtures for read and list. The per-provider branches in `test/tasks.test.ts` move into the fixtures. | About 400 lines, tests only. Low risk. |
| T2 | Display facts on each adapter, `GET /api/trackers`, and the eight browser maps read from it. | About 300 lines. Medium risk: it changes `public/`, where daily-use screens are being changed too. |
| T3 | The browser's tracker logic (priority scales, Vikunja HTML, the `VIK-` default, tracker hosts) becomes adapter facts. | About 150 lines. Low risk. |
| T4 | The `browse`, `search` and `testConnection` capabilities, with ClickUp first, from the ClickUp setup work. Then their conformance checks. | Sized with that work. |
| T5 | Connections: one record per origin and credential for the tracker, link and publisher roles, with the configuration schema per adapter. | Larger; needs owner decision 5 and a configuration migration. |

P1 changes one error. A delivery facts read in the demo now refuses with `cards_facts_unavailable` instead of the misleading `ploeg_credential`. No route reaches that read in the demo, because `http.ts` already keeps facts consumers out of it.

### Consequences

* Good, because the demo, a test and a live Ploeg are three implementations of one interface. A new area cannot forget the demo, because the adapter will not compile without it.
* Good, because every request to Ploeg leaves through one adapter that the contract bundle checks, including the four that bypass it today.
* Good, because a new tracker is one adapter plus one fixture. The suite says what it must do, and the browser learns its names and formats from the server.
* Bad, because `PloegClient` and the port overlap until P5 is finished, and two styles live side by side in `ploeg.ts`.
* Bad, because the split in P7 touches the most-changed file in the application and will conflict with open work.
* Neutral, because Ploeg also talks to the same trackers for intake and write-back. This record does not merge the two sides (owner decision 4).

### Confirmation

* P1: `test/ploeg-port.test.ts` checks the demo adapter's answers. It also checks that a demo-mode `PloegClient` makes its own checks (role, upload size, Team scope, id format) before the adapter answers. The existing Ploeg, cards, client sign-off and contract tests pass unchanged against the live adapter.
* After P3, `grep -rn "/api/v1/" src` finds Ploeg routes only in the live adapter.
* After P5, `grep -c "this.demo" src/ploeg.ts` is 0.
* After T1, the conformance suite fails for a registered tracker without a fixture. After T2, `public/` holds no tracker name map.

## Pros and Cons of the Options

### Generate the whole Ploeg client and keep the demo as branches

* Good, because the wire types follow the contract with no hand-written parsers.
* Bad, because the generator loses the degrade, redact and null-not-zero handling (ADR-0027), and the demo branches stay.

### Keep the current shape and add `Pick` types as needed

* Good, because nothing moves.
* Bad, because each feature keeps writing its own facts type, the demo stays a branch in every method, and direct `fetch` calls keep appearing.

## More Information

Owner decisions this record needs, each with a recommendation:

1. **One Ploeg port made of areas, or one port per area.** Recommended: one `PloegPort` made of area interfaces, so consumers can depend on the area they use.
2. **Hand-written live adapter checked against the schemas, or one generated from them.** Recommended: hand-written and checked (ADR-0027); generated types can come later.
3. **The demo as an adapter inside Unfold, or a fake Ploeg server that the live adapter talks to.** Recommended: an adapter. A demo server would exercise the live path, but it is another process to run. Reconsider it together with the hosted replay in system ADR-0015.
4. **Who talks to trackers.** Unfold keeps its own adapters for the operations people start: browse, read, hand off, file an issue, link an account. Ploeg keeps its own for intake and write-back. The alternative is that Unfold reaches trackers only through Ploeg. Recommended: keep the split and write down which side owns which operation. Reconsider when a third tracker needs adapters on both sides.
5. **One Connection per origin for the tracker, link and publisher roles.** Recommended: yes, after the ClickUp setup work lands, as part of ADR-0048's shared connections.
6. **Rename `PloegClient`.** Recommended: only in P7, when it becomes `src/ploeg/service.ts`.

Related: [architecture](../architecture.md), [Managed execution](../../../../docs/workflows/managed-execution.md), [0008](0008-task-connections-and-candidate-handoff.md) task connections, [0015](0015-ploeg-operator-read-api.md) the operator read API.
