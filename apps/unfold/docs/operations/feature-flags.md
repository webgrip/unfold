---
type: how-to
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-13
verified_by: "On 2026-10-13 written with the implementation on branch feat/feature-flips: src/flags.ts, src/flag-registry.json, src/http.ts flag routes, public/core/flags.js, public/views/labs.js, ops/helm/unfold featureFlags (helm template rendered), scripts/check.mjs; test/flags.test.ts, test/api-flags.test.ts and the flags browser flow passed. The YAML rollout examples were not applied to a cluster."
---

# Feature flags

A feature flag lets Unfold ship a change switched off, then turn it on for some people, a Team, a percentage or everyone, without a release. Rules are [flagd](https://flagd.dev/reference/flag-definitions/) documents in Git. Unfold evaluates them on the server, behind OpenFeature's interface ([ADR 0043](../adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md)), and sends the browser values only.

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
4. **Override:** an administrator's forced variant under Settings › Labs, stored by Unfold and recorded in the audit trail.

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

Targeting reads `targetingKey` and `userId` (the user id), `role` (`admin`, `operator` or `viewer`), `teams` (from `ploeg.userTeams`), `tenantId`, `mode` (`live` or `demo`), `labs` and `labsOff`, plus `$flagd.flagKey` and `$flagd.timestamp`. Operators are JsonLogic's `var`, `if`, `==`, `===`, `!=`, `!==`, `!`, `!!`, `and`, `or`, `<`, `<=`, `>`, `>=`, `in` and `cat`, plus flagd's `fractional`, `sem_ver`, `starts_with` and `ends_with`. Shared rules go under `$evaluators` and are used with `$ref`. Any other operator makes the flag resolve to its code default and logs `flag.evaluation_failed` once.

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
* The server logs `flag.choice`, `flag.override_set`, `flag.override_cleared`, `flag.file_reloaded`, `flag.file_invalid`, `flag.unknown` and `flag.evaluation_failed` as JSON lines.

## Moving to a flag service later

The rules are flagd's file format and the evaluator implements OpenFeature's provider interface. To run flagd as a daemon, use the OpenFeature Operator or adopt Flipt or Unleash, replace `FlagdProvider` in `src/flags.ts` with that provider. The registry, Labs, the API and every call site stay the same.
