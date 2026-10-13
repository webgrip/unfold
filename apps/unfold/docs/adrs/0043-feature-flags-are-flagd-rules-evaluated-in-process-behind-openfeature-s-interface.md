---
status: proposed
date: 2026-10-13
decision-makers: Ryan Grippeling
review-by: 2027-01-13
---

# Feature flags are flagd rules evaluated in process behind OpenFeature's interface

## Context and Problem Statement

On 2026-10-13 the owner asked to "unlock the potential of feature flips in this project fully", starting with the Work Item flight profile as the first one (VIK-2042). Before this, Unfold had no flag mechanism. A behaviour change shipped to everyone at once, and the nearest things to a flag were the booleans `runtime.briefCheck` and `UNFOLD_INSIGHT_EVENTS`. Unfold is self-hosted first. Its desired state is in Git (`webgrip/homelab-cluster`, Flux), it has one runtime npm dependency ([ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md)), the browser has no build step, and a hosted service for agencies follows later (root ADRs 0005–0010).

How should Unfold decide, per person, Team or Tenant, whether a feature is on, and how does it keep those flags from turning into debt?

## Decision Drivers

* A flag changes by a Git pull request, so Git is the audit trail, and applies without a restart.
* Evaluation stays on the server. The browser receives values only, never targeting rules, because rules can name people and Teams.
* The work follows the industry standard. Moving to a flag service later (flagd, Flipt, Unleash) changes no code that evaluates a flag.
* No new runtime dependency or infrastructure without an owner decision ([ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md): "any other runtime dependency still needs its own decision").
* Every flag has an owner, a kind and a removal date, and CI notices when one is stale.
* People can try a feature early on their own, and an administrator can switch one off for everyone at once.

## Considered Options

* flagd documents evaluated in process, behind OpenFeature's provider and client interface, without a dependency
* `@openfeature/server-sdk` with `@openfeature/flagd-provider` in its in-process mode
* A flag service: Unleash, Flipt, GrowthBook or Flagsmith
* Booleans in the configuration file

## Decision Outcome

Chosen option: **flagd documents evaluated in process behind OpenFeature's interface, without a dependency**. It is the only option that keeps rules in Git, applies them live, needs no new infrastructure or runtime dependency, and still speaks the CNCF standard's vocabulary and file format.

1. **Format.** Rules are [flagd](https://flagd.dev/reference/flag-definitions/) documents: `flags` with `state`, `variants`, `defaultVariant` and JsonLogic `targeting`, plus shared `$evaluators` referenced with `$ref`. Targeting supports flagd's `fractional` (MurmurHash3 x86 32-bit bucketing, deterministic per person), `sem_ver`, `starts_with` and `ends_with`, and sees `$flagd.flagKey` and `$flagd.timestamp`.
2. **Layers.** [`src/flag-registry.json`](../../src/flag-registry.json) is the code's registry. Every flag the code knows is defined there in full, with metadata Unfold adds: `kind` (release, experiment, ops or permission, after Hodgson's Feature Toggles), `owner`, `created`, `expires` (required for release and experiment flags), `title`, `description`, `client` (its value goes to the browser) and `labs` (people may opt in or out). A deployment changes rules in `config.flags` or in the flag file named by `UNFOLD_FLAGS_FILE`. The Helm value `featureFlags` mounts that file as its own ConfigMap, polled every 5 seconds. A deployment may change a known flag's rule, never its metadata. A flag the registry does not know is logged and ignored, so a deployment can name a flag before the version that adds it ships. An invalid file keeps the last good rules.
3. **Interface.** [`src/flags.ts`](../../src/flags.ts) implements OpenFeature's provider methods (`resolveBooleanEvaluation` and siblings), resolution reasons (STATIC, DEFAULT, TARGETING_MATCH, SPLIT, DISABLED, ERROR), error codes and hooks, and a client with typed `get*Value` and `get*Details` calls. Adopting `@openfeature/server-sdk` later means registering this provider, and the calls keep their names.
4. **Context.** Each request evaluates with `targetingKey` (the user id), `userId`, `role`, `teams` (from `ploeg.userTeams`), `tenantId`, `mode`, and the person's Labs choices as `labs` and `labsOff`.
5. **Browser.** `/api/bootstrap` carries `flags`: the evaluated values of `client` flags. [`public/core/flags.js`](../../public/core/flags.js) reads them.
6. **Labs and overrides.** Settings › Labs lets each person choose on, off or default for every `labs` flag. The shared `labs-choice` evaluator honours that choice, and it is stored per person (`flag_choices`). Administrators see every flag with its effective rule, source, expiry and evaluation counts. They can force a variant for everyone with a reason; that override is stored (`flag_overrides`), wins over every rule until cleared, and every change is appended to `flag_audit`. API: [contract](../contracts/api.md#feature-flags).
7. **Lifecycle.** `npm run check` fails when a flag is past its removal date, when a registered flag is evaluated nowhere in `src/` or `public/`, when code evaluates an unregistered flag, or when [the operations guide](../operations/feature-flags.md) does not list it.
8. **Telemetry.** The first time a person reaches a flagged code path in a page load, the browser records the product event `flag.exposed` with OpenTelemetry's `feature_flag.key` and `feature_flag.result.variant`. It travels through the existing insight export (system [ADR-0023](../../../../docs/adr/adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md)). The server logs each evaluation error once per flag and code.

### Consequences

* Good, because changing a flag is a reviewed Git change that reaches a running workbench in about a minute (kubelet ConfigMap sync plus the 5-second poll), with no restart and no new service.
* Good, because the file format and the API names are the standard's, so moving to a flagd daemon, the OpenFeature Operator, Flipt or Unleash replaces only the provider.
* Good, because CI turns flag debt into a failing check rather than a forgotten branch in the code.
* Bad, because Unfold maintains its own JsonLogic subset (about 150 lines). An operator outside that subset, such as `map` or `reduce`, resolves as PARSE_ERROR and falls back to the code default.
* Bad, because overrides and Labs choices live in Unfold's database, outside Git. The audit table records every override, but Git does not.
* Neutral, because Ploeg has no flags yet. When it needs them, the Go SDK `github.com/open-feature/go-sdk` reads the same file format.

### Confirmation

[`test/flags.test.ts`](../../test/flags.test.ts) pins evaluation, layering, `fractional` determinism and spread, MurmurHash3 vectors, overrides, the file watcher's last-good behaviour and registry validation. [`test/api-flags.test.ts`](../../test/api-flags.test.ts) pins the bootstrap values, Labs choices, administrator overrides, the audit trail, restarts and the 403s. [`test/flags-client.test.mjs`](../../test/flags-client.test.mjs) pins the browser reader and the exposure event. `npm run check` enforces the lifecycle rules, and `helm lint` and `helm template` in `mise run verify` render the flags ConfigMap.

## Pros and Cons of the Options

### `@openfeature/server-sdk` with `@openfeature/flagd-provider`

* Good, because it is the reference implementation, with golden-tested evaluation.
* Bad, because the in-process provider is still 0.x and requires `@grpc/grpc-js` even when reading a file: about 58 packages and 20 MB, measured 2026-10-13.
* Bad, because it adds three runtime dependencies that each need their own decision under ADR 0036.

### A flag service

* Good, because it brings a UI, experiments and analytics.
* Bad, because it is another always-on service with its own database and credentials to run, per Tenant later.
* Bad, because Flipt v2's Fair Core License forbids competing use, which a hosted Unfold could be; Unleash's and GrowthBook's open cores lack features that live only in their paid editions.

### Booleans in the configuration file

* Good, because there is nothing to build.
* Bad, because there is no targeting, no rollout, no live change, no per-person choice and no lifecycle check.

## More Information

* Research: OpenFeature (CNCF Incubating), flagd's flag-definition schema, OpenTelemetry's feature-flag semantic conventions (`feature_flag.evaluation` events), Hodgson's [Feature Toggles](https://martinfowler.com/articles/feature-toggles.html).
* The first flag is `work.flight-profile` (release, off, in Labs), which draws a Work Item as a flight on its page.
* 2026-10-13: proposed with its implementation (VIK-2042). The owner accepts or rejects it.
* Re-evaluate when a second application (Ploeg) needs flags, when a Tenant needs to change flags at runtime without Git, or when an experiment needs analysis this event stream cannot give.
