---
type: how-to
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-13
verified_by: "On 2026-10-13 written with the implementation on branch feat/feature-flips: src/flags.ts, src/flag-rollouts.ts, src/flag-ofrep.ts, src/flag-registry.json, src/http.ts flag and OFREP routes, public/core/flags.js, public/views/labs.js, ops/helm/unfold featureFlags (helm template rendered with providers), scripts/check.mjs; test/flags.test.ts, test/flag-ofrep.test.ts (against a local OFREP server), test/api-flags.test.ts and the flags browser flow passed. Not checked: a real flagd, Flipt or GO Feature Flag server, and the YAML examples on a cluster."
---

# Feature flags

A feature flag lets Unfold ship a change switched off, then turn it on without a release for some people, a Team, a percentage, a schedule or everyone. Rules are [flagd](https://flagd.dev/reference/flag-definitions/) documents, so they run on any flagd-compatible evaluator. They live in Git or are authored in Unfold and exported to Git. Unfold evaluates them on the server, behind OpenFeature's interface ([ADR 0043](../adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md)), sends the browser values only, and can ask, or be asked by, any flag service that speaks OFREP.

## The flags in this version

| Key | Kind | Default | Labs | Remove by | What it does |
| --- | --- | --- | --- | --- | --- |
| `work.flight-profile` | release | off | yes | 2027-01-13 | Draws a Work Item as a flight at the top of its page, in place of the four-stage strip. The plane takes off when an agent picks the work up, and every Run is a waypoint (retries are tick marks, readers that start together fly side by side). Fix rounds and waiting for you are holding patterns, failed checks are a go-around, the pull request lands it and production is the arrival. A stopped Work Item diverts to Needs you. Clicking a waypoint opens its Run. Below it, the value stream's waits and work are drawn to scale |

`npm run check` fails when this table misses a registered flag.

## Where a flag's rule comes from

Each layer changes only the fields it names, and later layers win:

1. **Code:** [`src/flag-registry.json`](../../src/flag-registry.json) defines every flag in full, with its metadata: `kind`, `owner`, `created`, `expires`, `title`, `description`, `client` (its value goes to the browser) and `labs` (people may opt in or out).
2. **Configuration file:** `flags` in the JSON configuration, as a flagd document.
3. **Flag file:** the flagd document named by `UNFOLD_FLAGS_FILE`, polled every 5 seconds. The Helm chart mounts the `featureFlags` value there as its own ConfigMap, so a change applies in about a minute without a restart. An invalid file is logged as `flag.file_invalid`, and the previous rules stay in force.
4. **Rollout:** rules an administrator authored under Settings › Labs (see [Rollouts in Unfold](#rollouts-in-unfold)). Set `flags.console: false` to keep every rule in Git.
5. **Override:** an administrator's forced variant under Settings › Labs, stored by Unfold and recorded in the audit trail.

A deployment may change a known flag's `state`, `variants`, `defaultVariant` and `targeting`, never its metadata. A flag this version does not know is logged as `flag.unknown` and ignored, so a deployment can name a flag before the release that adds it.

## Rolling a flag out on a deployment

Set `featureFlags` in the deployment's HelmRelease values. For the homelab that is `webgrip/homelab-cluster`, changed by a pull request there. These examples use the flight profile.

Everyone, while each person can still opt out under Labs:

```yaml
featureFlags:
  flags:
    work.flight-profile:
      defaultVariant: "on"
```

One Team, keeping each person's Labs choice. `labs-choice` returns `off` or `on` for a person who chose, and nothing otherwise:

```yaml
featureFlags:
  flags:
    work.flight-profile:
      targeting:
        or:
          - $ref: labs-choice
          - if: [{ in: [bronze, { var: teams }] }, "on", null]
```

A fifth of people, chosen by a stable hash of the flag and the person, so each person keeps their variant:

```yaml
featureFlags:
  flags:
    work.flight-profile:
      targeting:
        or:
          - $ref: labs-choice
          - fractional: [["on", 20], ["off", 80]]
```

Administrators only:

```yaml
featureFlags:
  flags:
    work.flight-profile:
      targeting:
        if: [{ "==": [{ var: role }, admin] }, "on", null]
```

Switched off for everyone, whatever people chose:

```yaml
featureFlags:
  flags:
    work.flight-profile:
      state: DISABLED
```

Writing targeting by hand is the same language rollouts compile to. Targeting reads `targetingKey` and `userId` (the user id), `role` (`admin`, `operator` or `viewer`), `teams` (from `ploeg.userTeams`), `tenantId`, `mode` (`live` or `demo`), `labs` and `labsOff`, plus `$flagd.flagKey` and `$flagd.timestamp`. Operators are JsonLogic's `var`, `if`, `==`, `===`, `!=`, `!==`, `!`, `!!`, `and`, `or`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`, `/`, `%`, `min`, `max`, `in`, `cat`, `merge`, `missing`, `some`, `all` and `none`, plus flagd's `fractional`, `sem_ver`, `starts_with` and `ends_with`. `fractional` weights are relative whole numbers, or expressions such as `{"-": [{"var": "$flagd.timestamp"}, 1761955200]}` for a linear ramp, exactly as in flagd. Shared rules go under `$evaluators` and are used with `$ref`. Any other operator makes the flag resolve to its code default and logs `flag.evaluation_failed` once.

## Rollouts in Unfold

Under Settings › Labs, an administrator opens a flag and authors a rollout. Rules are tried from the top, and the first whose people and dates match decides.

| Rule part | Choices |
| --- | --- |
| Who | Everyone, a segment, roles, Teams, people (user ids), Tenants, or another flag's variant (a prerequisite) |
| When | Optionally from and until a date and time: a scheduled launch or a time-boxed trial |
| Serves | One variant, a percentage split (shares to 0.01 %, kept per person, per Tenant or per role), or a ramp from one share to another between two dates, in twenty even steps |

The rollout also sets the variant when nothing matches and a switch that serves the code's default to everyone. For a Labs flag, people's opt-ins and opt-outs win over the rules unless you untick that.

A person always lands in the same bucket. The bucket is flagd's hash of the flag key and their id (or Tenant, or role). Raising a share from 10 % to 20 % keeps the first 10 % on, and a ramp only ever adds people.

**Segments** are named groups (roles, Teams, people, Tenants) that rules reuse. Changing a segment changes every rollout that uses it. A segment in use cannot be deleted.

**Prerequisites** make a rule match only when another flag serves one of its variants, one level deep. Unfold evaluates the other flag first and passes `flagVariants` (`key=variant`) on, so a remote flag service's rules can read it too.

A rollout compiles to a plain flagd rule: segments inlined, windows as `$flagd.timestamp` bounds, splits as `fractional`, ramps as twenty `fractional` steps. **Export rollouts as flagd JSON** downloads them as a flagd document. Paste it into `featureFlags` in Git (then remove the rollout here) or load it into any flagd-compatible service.

## Experiments

Give a flag more than two variants, or the kind `experiment`, and split people between the variants with a rollout. The browser records:

* `flag.exposed` the first time a person reaches the flag in a page load;
* `flag.tracked` whenever code calls `track('event-name', { value })` from `public/core/flags.js`, attributed to every flag the person reached in that page load.

The flag's card under Labs shows, for the last 30 days, the people who saw each variant and the share of them who did each tracked event. No significance test is applied. `work.flight-profile` already tracks `work.run_opened` and `work.run_opened_from_flight`, so turning it on for half the people compares how often each half opens a Run.

## Labs and overrides

Settings › Labs lists every flag marked `labs`. Each person picks on, off or default, and the choice follows their account to every device. Administrators also see every flag with:

* its effective rule and the layer it came from;
* its removal date, marked when it has passed;
* its value for them, with the OpenFeature reason;
* how often each variant was served since the process started.

An administrator can force a variant for everyone with a reason. That is the kill switch: it wins over every rule and every Labs choice until cleared. Every override set or cleared is recorded with who, when and why.

## Adding a flag

1. Add it to `src/flag-registry.json`. Name the key `area.feature-name` in lowercase, and give it a `kind` (`release` for unfinished work, `experiment` for a comparison, `ops` for a kill switch, `permission` for something only some people get), your name as `owner`, today as `created` and, for release and experiment flags, an `expires` date at most three months out. Ship it off.
2. Read it where the behaviour forks. In the browser use `enabled('area.feature-name')` or `flag(key, fallback)` from [`public/core/flags.js`](../../public/core/flags.js), or pass `flagValues()` into a view model and read `model.flags?.['area.feature-name']`. On the server use `flags.getBooleanValue(key, false, context)` or another typed call, with the context from `flagContext(user)` in `src/http.ts`. Set `client: true` only when the browser needs the value.
3. Call `exposed(key, { screen })` from `public/core/flags.js` where a person reaches the flagged path. It records `flag.exposed` once per page load, with `feature_flag.key` and `feature_flag.result.variant`.
4. Test both paths: one test with the flag on and one with it off.
5. Add a row to the table above.

## Removing a flag

When a release flag has been on everywhere long enough, or its removal date is near, delete the losing path, the registry entry and the table row in one change. `npm run check` fails once `expires` has passed, when a registered flag is read nowhere, and when code reads a flag the registry does not have. To keep a flag longer, move its date in a commit that says why.

## Seeing what flags do

* `flag.exposed` product events carry the flag and the variant a person saw. With `UNFOLD_INSIGHT_EXPORT` set, they reach Faro or OTLP like every product event.
* The server logs these as JSON lines:
  * `flag.choice`
  * `flag.override_set` and `flag.override_cleared`
  * `flag.rollout_set` and `flag.rollout_cleared`
  * `flag.segment_set` and `flag.segment_deleted`
  * `flag.file_reloaded`, `flag.file_invalid` and `flag.unknown`
  * `flag.provider_refused`
  * `flag.evaluation_failed`, with `feature_flag.key`, `feature_flag.provider.name` and `error.type`
* Administrators see each release flag that served one variant at least fifty times since the last restart marked "ready to remove".

## Using a flag service (OFREP)

Unfold can ask any service that speaks [OFREP](https://github.com/open-feature/protocol), the OpenFeature Remote Evaluation Protocol, before its own evaluator. Known OFREP servers include flagd (`--ofrep-port`, 8016), Flipt, GO Feature Flag's relay proxy and the ConfigCat proxy. Configure providers in `config.flags`, next to the Helm `featureFlags` rules:

```yaml
config:
  flags:
    strategy: first-successful
    providers:
      - kind: ofrep
        name: flagd
        url: http://flagd.flags.svc:8016
        apiKeyEnv: UNFOLD_FLAGD_KEY
        cacheMs: 30000
```

* Providers are asked in order, and Unfold's own evaluator is always the last.
* `first-match` stops at the first provider that knows the flag. `first-successful` also skips a provider that is down, so the Git rules answer during an outage.
* Unfold asks a service's bulk endpoint once per person and keeps the answer for `cacheMs`, revalidating with its ETag.
* A 401 or 403 stops that provider until Unfold restarts. A 429 waits for its `Retry-After`.
* `apiKeyEnv` sends `X-API-Key`, and `tokenEnv` sends a bearer token, both read from the environment.
* The service's rules see the same context: `targetingKey`, `role`, `teams`, `tenantId`, `labs`, `labsOff`, `flagVariants`.
* An override still wins before any provider is asked.

Unfold also **answers** OFREP at `POST /api/ofrep/v1/evaluate/flags` (bulk, with ETag and 304) and `POST /api/ofrep/v1/evaluate/flags/{key}`, for the signed-in person or editor. Only browser-visible flags are answered. Point any OpenFeature web or editor provider that speaks OFREP at `https://<workbench>/api`.
