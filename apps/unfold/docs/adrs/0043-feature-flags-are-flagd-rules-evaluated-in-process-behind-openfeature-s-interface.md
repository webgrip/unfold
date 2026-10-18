---
status: proposed
date: 2026-10-13
decision-makers: Ryan Grippeling
review-by: 2027-01-13
---

# Feature flags are flagd rules evaluated in process behind OpenFeature's interface

## Context and Problem Statement

On 2026-10-13 the owner asked to "unlock the potential of feature flips in this project fully", starting with the Work Item flight profile (VIK-2042). Later the same day they asked for "full flags support, so that also means x percentage etc.", built the best way available but vendor-agnostic on Unfold's side.

Before this, Unfold had no flag mechanism. Unfold is self-hosted first, its desired state is in Git (`webgrip/homelab-cluster`, Flux), it has one runtime npm dependency ([ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md)), the browser has no build step, and a hosted service for agencies follows later (root ADRs 0005–0010).

The question is how Unfold decides, per person, Team or Tenant, whether a feature is on. That includes percentage rollouts, schedules, ramps, segments, prerequisites and experiments. It must not tie Unfold to one flag vendor, and it must keep flags from turning into debt.

## Decision Drivers

* Everything the leading platforms treat as table stakes:
  * percentage rollouts with a stable choice of who gets what;
  * segments, prerequisites, weighted variants, scheduled changes and time-based ramps;
  * a kill switch, an audit trail and stale-flag detection.
* Vendor-agnostic in both directions:
  * Unfold's rules run on any flagd-compatible evaluator;
  * Unfold can ask any flag service that speaks the OpenFeature Remote Evaluation Protocol (OFREP);
  * any OpenFeature client can ask Unfold.
* Rules can live in Git, apply without a restart, and administrators can still act in seconds.
* Evaluation stays on the server. The browser receives values only, never targeting rules, because rules can name people and Teams.
* No new runtime dependency or infrastructure without an owner decision (ADR 0036: "any other runtime dependency still needs its own decision").

## Considered Options

* flagd documents evaluated in process behind OpenFeature's provider and client interface, with OFREP in and out, and rollouts authored in Unfold that compile to flagd; no dependency
* `@openfeature/server-sdk` with `@openfeature/flagd-provider` in its in-process mode
* A flag service (Unleash, Flipt, GrowthBook, Flagsmith) as the only source
* Booleans in the configuration file

## Decision Outcome

Chosen option: **flagd documents evaluated in process behind OpenFeature's interface, with OFREP in and out and rollouts that compile to flagd, without a dependency**. It is the only option that keeps rules portable and in Git, adds no infrastructure or dependency, lets a deployment put any OFREP flag service in front, and still gives administrators a console.

1. **Format.** Rules are [flagd](https://flagd.dev/reference/flag-definitions/) documents: `flags` with `state`, `variants`, `defaultVariant` and JsonLogic `targeting`, plus shared `$evaluators` used with `$ref`.
   * Targeting supports JsonLogic's comparison, logic, arithmetic, `in`, `cat`, `merge`, `missing`, `some`, `all` and `none`.
   * It also supports flagd's `fractional`, `sem_ver`, `starts_with` and `ends_with`, and sees `$flagd.flagKey` and `$flagd.timestamp` (Unix seconds).
   * `fractional` follows flagd's current algorithm exactly:
     * the bucketing value defaults to the flag key followed by the targeting key, and without a targeting key there is no bucket;
     * the bucket is `(uint64(murmur3(value)) × total) >> 32`, with relative whole-number weights totalling at most 2³¹−1;
     * weights may be JsonLogic expressions, so a ramp can be written as timestamp arithmetic.
2. **Layers.** Each layer changes only the fields it names, and later layers win:
   1. [`src/flag-registry.json`](../../src/flag-registry.json) defines every flag the code knows, with metadata: `kind` (release, experiment, ops or permission), `owner`, `created`, `expires` (required for release and experiment flags), `title`, `description`, `client` and `labs`.
   2. `config.flags`.
   3. A watched flag file (Helm `featureFlags`, `UNFOLD_FLAGS_FILE`, polled every 5 seconds; an invalid file keeps the last good rules).
   4. **Rollouts authored in Unfold** (step 4 below).
   5. An administrator's **override**.

   A deployment may change a known flag's rule, never its metadata. An unknown flag is logged and ignored.
3. **Interface and providers.** [`src/flags.ts`](../../src/flags.ts) implements OpenFeature's provider methods, resolution reasons, error codes and hooks, and an async client with typed `get*Value` and `get*Details` calls.
   * The client asks an ordered list of providers like OpenFeature's MultiProvider. Under `first-match`, a provider that does not know the flag passes it on. Under `first-successful`, any failure does.
   * The providers are the in-process flagd evaluator and any number of OFREP services ([`src/flag-ofrep.ts`](../../src/flag-ofrep.ts), OFREP 0.4.0): flagd, Flipt, GO Feature Flag, the ConfigCat proxy.
   * The OFREP client asks the bulk endpoint once per context, caches the answer for `cacheMs` and revalidates it with `If-None-Match`.
     * A 401 or 403 stops it until a restart. A 429 waits for `Retry-After`.
     * Credentials come from environment variables the configuration names (`X-API-Key` or a bearer token).
   * The in-process evaluator is always the last fallback. An override wins before any provider is asked. Adopting the OpenFeature SDK later means registering these providers, and every call keeps its name.
4. **Rollouts authored in Unfold** ([`src/flag-rollouts.ts`](../../src/flag-rollouts.ts)). An administrator authors, per flag:
   * a default variant and a kill switch;
   * ordered rules, where the first match wins. Each rule has:
     * an audience: everyone, a segment, roles, Teams, people, Tenants, or another flag's variant as a prerequisite;
     * an optional time window;
     * what it serves: one variant, a weighted split, or a ramp from one share to another over a window.

   Shares are basis points (precise to 0.01 %). A split buckets by person, Tenant or role.

   A rollout **compiles to a plain flagd rule**:
   * segments are inlined;
   * windows become `$flagd.timestamp` bounds;
   * splits become `fractional`;
   * a ramp becomes twenty fixed `fractional` steps;
   * a Labs flag's opt-in and opt-out come first.

   It can be exported as a flagd document and moved into Git or any flagd-compatible service. Prerequisites are evaluated first and passed on as the context attribute `flagVariants` (`key=variant`), one level deep, so a remote provider's rules can read them too. `flags.console: false` turns authoring off for deployments that keep every rule in Git.
5. **Context.** Each evaluation sees `targetingKey` (the user id), `userId`, `role`, `teams` (from `ploeg.userTeams`), `tenantId`, `mode`, and the person's Labs choices as `labs` and `labsOff`.
6. **Browser and clients.**
   * `/api/bootstrap` carries the evaluated values of `client` flags, read through [`public/core/flags.js`](../../public/core/flags.js).
   * Unfold also answers OFREP at `/api/ofrep/v1/evaluate/flags`, in bulk with an ETag and 304, and per flag, for the signed-in person or editor. Only `client` flags are answered, and a client cannot replace the identity attributes. Any OpenFeature web or editor provider that speaks OFREP can use it.
7. **Labs, overrides, segments and audit.**
   * Each person chooses on, off or default for every `labs` flag (`flag_choices`).
   * Administrators force a variant for everyone with a reason (`flag_overrides`), and author rollouts (`flag_rollouts`) and segments (`flag_segments`).
   * Every override, rollout and segment change is appended to `flag_audit` with who, when and why.
   * API: [contract](../contracts/api.md#feature-flags).
8. **Lifecycle.** `npm run check` fails when:
   * a flag is past its removal date;
   * a registered flag is evaluated nowhere;
   * code evaluates an unregistered flag;
   * [the operations guide](../operations/feature-flags.md) does not list a flag.

   Administrators also see a release flag that served one variant at least fifty times since the process started marked as ready to remove.
9. **Telemetry and experiments.**
   * The first time a person reaches a flagged path in a page load, the browser records `flag.exposed` with OpenTelemetry's `feature_flag.key` and `feature_flag.result.variant`.
   * `track(event, {value})` records `flag.tracked` against every flag reached in that page load, as OpenFeature's tracking API does.
   * Both travel through the existing product-event export (system [ADR-0023](../../../../docs/adr/adr-0023-unfold-measures-happiness-and-confusion-with-first-party-events-surveys-and-bug-reports.md)).
   * For experiment flags, and flags with more than two variants, administrators see people exposed per variant and the share who did each tracked event over 30 days. No significance test is applied.
   * The server logs evaluation errors once per flag and code with OpenTelemetry's attribute names.

### Consequences

* Good, because every percentage, schedule, ramp, segment and prerequisite an administrator authors is a plain flagd rule, so it runs on flagd, the OpenFeature Operator or any flagd-compatible service, and it can move into Git.
* Good, because a deployment can put Flipt, flagd, GO Feature Flag or the ConfigCat proxy in front over OFREP without code changes, and any OFREP client can read Unfold's flags.
* Good, because CI turns flag debt into a failing check.
* Bad, because Unfold maintains its own JsonLogic evaluator (about 200 lines). An operator outside it, such as `map` or `reduce`, resolves as PARSE_ERROR and falls back to the code default.
* Bad, because overrides, authored rollouts, segments and Labs choices live in Unfold's database, outside Git. The audit table records every change, the export moves rollouts into Git, and `flags.console: false` forbids authoring.
* Bad, because OFREP is pre-1.0 (0.4.0). A breaking change there touches one file.
* Neutral, because holdouts, mutual-exclusion layers, approvals and metric-guarded automatic rollback are not built. The research found them only in the paid or experimentation-focused platforms.
* Neutral, because Ploeg has no flags yet. The Go SDK `github.com/open-feature/go-sdk` reads the same format when it needs them.

### Confirmation

* [`test/flags.test.ts`](../../test/flags.test.ts) pins:
  * evaluation and layering;
  * flagd's integer bucketing and the MurmurHash3 vectors;
  * relative and expression weights, timestamp ramps and parse errors;
  * authored rollouts (segment split, window, prerequisite, Labs first, ramp steps, export) and `flags.console: false`;
  * overrides and the file watcher.
* [`test/flag-ofrep.test.ts`](../../test/flag-ofrep.test.ts) pins the OFREP client against a local server (bulk call, cache, ETag and 304, 401, 429, first-match and first-successful, type mismatch) and the server helpers.
* [`test/api-flags.test.ts`](../../test/api-flags.test.ts) pins the bootstrap values, Labs choices, overrides, rollouts, segments, export, OFREP endpoints, the experiment readout, the audit trail and the 403s.
* [`test/labs-view.test.mjs`](../../test/labs-view.test.mjs) and the `flags` browser flow pin the rollout editor.
* `npm run check` enforces the lifecycle rules, and `helm lint` and `helm template` render the flags ConfigMap.

## Pros and Cons of the Options

### `@openfeature/server-sdk` with `@openfeature/flagd-provider`

* Good, because it is the reference implementation.
* Bad, because the in-process provider is still 0.x and requires `@grpc/grpc-js` even when reading a file: about 58 packages and 20 MB, measured 2026-10-13.
* Bad, because it adds three runtime dependencies that each need their own decision under ADR 0036. It also brings no authoring, segments, Labs or experiments.

### A flag service as the only source

* Good, because it brings a polished UI and, for some, experiments.
* Bad, because it is another always-on service with its own database and credentials, per Tenant later. Flipt v2's Fair Core License forbids competing use. Unleash's and GrowthBook's open cores lack features that live only in their paid editions.
* Neutral, because this decision still lets a deployment put one in front over OFREP.

### Booleans in the configuration file

* Good, because there is nothing to build.
* Bad, because there is no targeting, rollout, live change, per-person choice or lifecycle check.

## More Information

* Research, 2026-10-13:
  * [OpenFeature](https://openfeature.dev/specification/) (providers, tracking, MultiProvider) and [OFREP](https://github.com/open-feature/protocol);
  * flagd's [flag definitions](https://flagd.dev/reference/flag-definitions/) and [fractional operation](https://flagd.dev/reference/custom-operations/fractional-operation/) (bucketing checked against `core/pkg/evaluator/fractional.go`);
  * the [OpenTelemetry feature-flag semantic conventions](https://opentelemetry.io/docs/specs/semconv/feature-flags/feature-flags-events/);
  * the rollout, segment, prerequisite and experiment features of LaunchDarkly, Unleash, GrowthBook, Flagsmith, Statsig, PostHog, ConfigCat and Flipt;
  * Hodgson's [Feature Toggles](https://martinfowler.com/articles/feature-toggles.html).
* The first flag is `work.flight-profile` (release, off, in Labs). On 2026-10-17 the owner retired it in favour of `work.live-view`, which the component workbench checks ([ADR 0048](0048-components-are-built-and-checked-in-a-workbench-outside-the-app.md)).
* 2026-10-13: proposed with its implementation (VIK-2042).
* 2026-10-13 (later): widened to:
  * flagd's current bucketing;
  * authored rollouts with segments, percentages, windows, ramps and prerequisites;
  * the OFREP client and server, and MultiProvider strategies;
  * experiments and settled-flag detection.

  The owner accepts or rejects it.
* Re-evaluate when Ploeg needs flags, when OFREP reaches 1.0, or when an experiment needs analysis this event stream cannot give.
