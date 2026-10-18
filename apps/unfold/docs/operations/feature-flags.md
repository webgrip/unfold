---
type: how-to
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-18
verified_by: "On 2026-10-18 the work.layouts row checked against src/flag-registry.json, public/ploeg.js onePageMarkup, public/views/work.js, public/views/session.js attachSession and onePageFor, and public/live/pages.js; test/live-work.test.mjs and the work-kit and work-pages workbench stories passed. On 2026-10-18 the now.fleet row checked against src/flag-registry.json, public/views/now.js and public/live/fleet.js; test/live-fleet.test.mjs and the fleet-board workbench stories passed. On 2026-10-13 written with the implementation on branch feat/feature-flips: src/flags.ts, src/flag-rollouts.ts, src/flag-ofrep.ts, src/flag-registry.json, src/http.ts flag and OFREP routes, public/core/flags.js, public/views/labs.js, ops/helm/unfold featureFlags (helm template rendered with providers), scripts/check.mjs; test/flags.test.ts, test/flag-ofrep.test.ts (against a local OFREP server), test/api-flags.test.ts and the flags browser flow passed. Not checked: a real flagd, Flipt or GO Feature Flag server, and the YAML examples on a cluster. On 2026-10-17 the cards.rarity row checked against src/flag-registry.json, src/http.ts and src/ploeg.ts useRarity; test/cards-service.test.ts and the rarity browser flow passed. On 2026-10-18 the cards.health.judge row checked against src/flag-registry.json, src/http.ts and src/run-health/service.ts; test/run-health-judge.test.ts passed. On 2026-10-18 the runs.tripwire row written with the implementation on branch feat/tripwire-reader: src/flag-registry.json, src/http.ts and src/tripwire/reader.ts; test/tripwire.test.ts passed."
---

# Feature flags

A feature flag lets Unfold ship a change switched off, then turn it on without a release for some people, a Team, a percentage, a schedule or everyone. Rules are [flagd](https://flagd.dev/reference/flag-definitions/) documents, so they run on any flagd-compatible evaluator. They live in Git or are authored in Unfold and exported to Git. Unfold evaluates them on the server, behind OpenFeature's interface ([ADR 0043](../adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md)), sends the browser values only, and can ask, or be asked by, any flag service that speaks OFREP.

## The flags in this version

| Key | Kind | Default | Labs | Remove by | What it does |
| --- | --- | --- | --- | --- | --- |
| `work.live-view` | release | off | yes | 2027-01-17 | Puts the live view at the top of a Work Item page in place of the four-stage strip and the flight profile: the stages as folds, one sentence on what the agent is doing, and the flight path, where every Run is a hop whose height follows its tool calls, machine failures bounce back, a stalled Run circles and tripwire hits are marked. Below it, the questions people ask, answered from the record. Built and checked in the [component workbench](../workbench.md) |
| `work.layouts` | experiment | off | yes | 2027-01-18 | **One Work Item page** (`public/live/pages.js` `workItemPage`): one page for a Work Item and the session that started it. The fold strip, then what waits on the person (the page's own needs-you or review box and the session's questions, permission requests, delivery and review), the flight path and instruments on a dark ground, then views switched without script: **Log**, every entry with its clock time and the spend tape, where each Run opens in place to the same body as the current page (its account, failure, health, findings, what the agent did and its pod logs) and the working Run is open; **Brief** with the acceptance conditions; **Trace** of the whole Shift; and, for a Work Item started in Unfold, **Evidence** (the session's activity, gateway calls, changes, checks and hand-off). The session's Pause, Resume, Cancel and Export sit in the header and its budget, repository hand-off, tool approval and details beside the views. `#session/<id>` opens the session's Work Item once Ploeg has admitted it; before that the session page stays. The intent bar steers (only a Work Item started in Unfold, through its session), asks or adds context and says who reads it before sending. Ploeg reports no proof per acceptance condition yet, so the page says so. Built and checked in the [component workbench](../workbench.md) as Live/Work kit and Live/Work Item page. Tracks the `work.layouts` exposure |
| `now.fleet` | release | off | yes | 2027-01-18 | Adds a **Desk** and **Fleet** switch to Now, remembered per browser. Fleet shows every Team the person can read at once: a headline and totals over the whole fleet, an airspace where each Team is a lane and each Work Item a plane that links to its page (at the gate, in the air, holding, on approach to review, landed in 24 hours, with the Team's last Runs as a contrail), and departures and arrivals boards. It reads the same `GET /api/ploeg/now` and 24-hour summary as the desk and estimates nothing. Built and checked in the [component workbench](../workbench.md). Tracks `now.view_desk` and `now.view_fleet` |
| `cards.rarity` | release | off | yes | 2027-01-17 | Shows each Run card's rarity: its tier from common to legendary, predicted once a Run starts and revealed at release, with the mark, frame ring, reveal and Rarity tab, and the binder's rarity filter and sort. Applies only while the deployment leaves `cards.rules.rarity` unset: `true` shows rarity to everyone and `false` turns it off whatever the flag says. Unfold still freezes revealed tiers while the flag is off, so turning it on shows them ([Unfold ADR 0045](../adrs/0045-unfold-records-the-run-card-rules-it-computes.md#update-2026-10-17-rarity-is-off-by-default-behind-a-feature-flag)). Evaluated on the server: a person whose flag is off never receives a card's rarity |
| `cards.health.judge` | permission | off | no | — | Lets a model judge, while a Run runs, whether it is still working on its Work Item ([RFC-0007](../../../../docs/design/rfc-0007-run-health.md), [ADR 0046](../adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md)). Each judgement is a Ploeg Ask paid from the Team's Ask Allowance, on the models `runHealth.judgeModels` lists (Hetzner's free EU-hosted inference by default) and never another. Shadow only: the verdict can raise the Run's health badge, never lower it, and it never stops, requeues, steers or grades a Run. Evaluated on the server with the Run's `team` in the context, so target it per Team, for example `"targeting": {"if": [{"in": [{"var": "team"}, ["bronze"]]}, "on", null]}`. A viewer's read never starts a judgement, and the demo never judges |
| `runs.tripwire` | permission | off | no | — | Lets the decider tripwire screen every new tool call of the Team's running Runs ([RFC-0008](../../../../docs/design/rfc-0008-decision-models.md), [ADR-0042](../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md)): five checks scored 0 to 3 by the configured `decider`, off the Run's path. Hits scoring 2 or more show in the Run's Tripwire list and the live view's containment panel with Right and Wrong controls. Shadow only: it never stops, cancels, steers or notes a Run. Needs a `decider` block ([live operation](live.md#decider-tripwire)); without one the route says `no_decider`. Evaluated on the server by the reader, for no person, with only the Run's `team` in the context, so target it per Team: `"targeting": {"if": [{"in": [{"var": "team"}, ["bronze"]]}, "on", null]}`. The demo never screens |

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
    work.live-view:
      defaultVariant: "on"
```

One Team, keeping each person's Labs choice. `labs-choice` returns `off` or `on` for a person who chose, and nothing otherwise:

```yaml
featureFlags:
  flags:
    work.live-view:
      targeting:
        or:
          - $ref: labs-choice
          - if: [{ in: [bronze, { var: teams }] }, "on", null]
```

A fifth of people, chosen by a stable hash of the flag and the person, so each person keeps their variant:

```yaml
featureFlags:
  flags:
    work.live-view:
      targeting:
        or:
          - $ref: labs-choice
          - fractional: [["on", 20], ["off", 80]]
```

Administrators only:

```yaml
featureFlags:
  flags:
    work.live-view:
      targeting:
        if: [{ "==": [{ var: role }, admin] }, "on", null]
```

Switched off for everyone, whatever people chose:

```yaml
featureFlags:
  flags:
    work.live-view:
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

The flag's card under Labs shows, for the last 30 days, the people who saw each variant and the share of them who did each tracked event. No significance test is applied. `work.live-view` already tracks `work.run_opened` and `work.run_opened_from_flight`, so turning it on for half the people compares how often each half opens a Run.

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
