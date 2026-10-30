---
type: how-to
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-25
verified_by: "On 2026-10-25 the linked.split-page row written with the implementation on branch feat/session-page-layout: src/flag-registry.json, public/core/linked-sessions.js linkedSessionPage and public/views/linked-sessions.js; test/linked-sessions-view.test.mjs passed and the page rendered in Playwright at 1400 and 390 px. On 2026-10-24 the linked.trace-comment row written with the implementation on branch feat/agent-trace-for-reviewers: src/flag-registry.json, src/http.ts and src/agent-trace-comments.ts; test/agent-trace-reviewers.test.ts passed. On 2026-10-19 the runs.progress-checks row written with the implementation on branch feat/decider-checks: src/flag-registry.json, src/http.ts and src/tripwire/reader.ts; test/decider-checks.test.ts passed. On 2026-10-19 the now.loop row rewritten with the clean-up on branch fix/loop-cleanup: public/now.js loopMarkup and loopCounts, public/core/counts.js countsFromNow, public/start.js; test/start.test.mjs, test/counts.test.mjs and the loop, now and fleet browser flows passed. On 2026-10-18 the now.loop row written with the implementation on branch feat/dogfood-loop: src/flag-registry.json, public/now.js loopMarkup, public/start.js and public/views/now.js; test/start.test.mjs and the loop browser flow passed. On 2026-10-18 the excludes rule and the work.live-view and work.unified pair checked against src/flags.ts checkRegistry, the choice route in src/http.ts, public/views/labs.js and public/views/work.js; test/flags.test.ts and test/api-flags.test.ts passed, the API test failed with the exclusion removed, and test:workbench rendered every demo Work Item with work.unified on. On 2026-10-18 the work.unified row checked against src/flag-registry.json, public/ploeg.js onePageMarkup, public/views/work.js, public/views/session.js attachSession and onePageFor, and public/live/pages.js; test/live-work.test.mjs and the work-kit and work-pages workbench stories passed. On 2026-10-18 the now.fleet row checked against src/flag-registry.json, public/views/now.js and public/live/fleet.js; test/live-fleet.test.mjs and the fleet-board workbench stories passed. On 2026-10-13 written with the implementation on branch feat/feature-flips: src/flags.ts, src/flag-rollouts.ts, src/flag-ofrep.ts, src/flag-registry.json, src/http.ts flag and OFREP routes, public/core/flags.js, public/views/labs.js, ops/helm/unfold featureFlags (helm template rendered with providers), scripts/check.mjs; test/flags.test.ts, test/flag-ofrep.test.ts (against a local OFREP server), test/api-flags.test.ts and the flags browser flow passed. Not checked: a real flagd, Flipt or GO Feature Flag server, and the YAML examples on a cluster. On 2026-10-17 the cards.rarity row checked against src/flag-registry.json, src/http.ts and src/ploeg.ts useRarity; test/cards-service.test.ts and the rarity browser flow passed. On 2026-10-18 the cards.health.judge row checked against src/flag-registry.json, src/http.ts and src/run-health/service.ts; test/run-health-judge.test.ts passed. On 2026-10-18 the runs.tripwire row written with the implementation on branch feat/tripwire-reader: src/flag-registry.json, src/http.ts and src/tripwire/reader.ts; test/tripwire.test.ts passed."
---

# Feature flags

A feature flag lets Unfold ship a change switched off, then turn it on without a release for some people, a Team, a percentage, a schedule or everyone. Rules are [flagd](https://flagd.dev/reference/flag-definitions/) documents, so they run on any flagd-compatible evaluator. They live in Git or are authored in Unfold and exported to Git. Unfold evaluates them on the server, behind OpenFeature's interface ([ADR 0043](../adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md)), sends the browser values only, and can ask, or be asked by, any flag service that speaks OFREP.

## The flags in this version

| Key | Kind | Default | Labs | Remove by | What it does |
| --- | --- | --- | --- | --- | --- |
| `work.live-view` | release | off | yes | 2027-01-17 | Puts the live view at the top of a Work Item page in place of the four-stage strip and the flight profile: the stages as folds, one sentence on what the agent is doing, and the flight path, where every Run is a hop whose height follows its tool calls, machine failures bounce back, a stalled Run circles and tripwire hits are marked. Below it, the questions people ask, answered from the record. Built and checked in the [component workbench](../workbench.md) |
| `work.unified` | experiment | off | yes | 2027-01-18 | **Unified Work Item page** (`public/live/pages.js` `workItemPage`): one page for a Work Item and the session that started it. The fold strip, then what waits on the person (the page's own needs-you or review box and the session's questions, permission requests and delivery; the pull request is the one review), the flight path and instruments on a dark ground, then views switched without script: **Log**, every entry with its clock time and the spend tape, where each Run opens in place to the same body as the current page (its account, failure, health, findings, what the agent did and its pod logs) and the working Run is open; **Brief** with the acceptance conditions; **Trace** of the whole Shift; and, for a Work Item started in Unfold, **Evidence** (the session's activity, gateway calls, changes, checks and hand-off). The session's Pause, Resume, Cancel and Export sit in the header and its budget, repository hand-off, tool approval and details beside the views. `#session/<id>` opens the session's Work Item once Ploeg has admitted it; before that the session page stays. The intent bar steers (only a Work Item started in Unfold, through its session), asks or adds context and says who reads it before sending. Ploeg reports no proof per acceptance condition yet, so the page says so. Built and checked in the [component workbench](../workbench.md) as Live/Work kit and Live/Work Item page. Tracks the `work.unified` exposure |
| `now.fleet` | release | off | yes | 2027-01-18 | Adds a **Desk** and **Fleet** switch to Now, remembered per browser. Fleet shows every Team the person can read at once: a headline and totals over the whole fleet, an airspace where each Team is a lane and each Work Item a plane that links to its page (at the gate, in the air, holding, on approach to review, landed in 24 hours, with the Team's last Runs as a contrail), and departures and arrivals boards. Each waiting plane says how long it has waited and, while holding, why; the Holding total names the longest wait. Tracker tasks Ploeg refused are listed by name with why and the fix, a lane's stuck count links to those Runs, and a stuck or agent-failed arrival says what to do. Teams that did not fly in 24 hours are left out. It reads the same `GET /api/ploeg/now` and 24-hour summary as the desk and estimates nothing. Built and checked in the [component workbench](../workbench.md). Tracks `now.view_desk` and `now.view_fleet` |
| `now.loop` | release | off | yes | 2027-01-18 | **The loop on Now** (`public/now.js` `loopMarkup` and `loopCounts`, `public/start.js`): Now in the order a person works it. One line says how many things need you, the same number as the Now badge (pull requests and proposals to decide, Work Items stuck, tasks Ploeg could not start), with what runs and what was spent today; it is amber only when that got worse since your last visit (a new item waiting on you, a new refusal, or budget held on stopped work), and an empty **Decide** folds into it as "nothing to decide". Then **Decide**, **Unstick** (each stopped Work Item with its last failed Run and why it failed, the buttons its reason names, and **Try again** in the row that asks for an optional note and restarts it from Round 1 through `POST /api/ploeg/work-items/<id>/requeue`, behind **Check Status** when the last Runs failed on infrastructure; then the refused tasks) and **Up next** (the first five open tasks agents can take on the boards Ploeg runs, in the tracker's order of priority, due date and list place, each row saying why it is there; epics left out; **Show all** with a board switch, **Include tasks agents cannot take** with each one's reason; the size and `team/<name>` label on each row; and how many more reviews you can take of the review room of 4, as [Browser UI](../browser-ui.md#now) describes). A lane with nothing in it folds to one line, and the digest shows only when something changed since your last visit. `h` or a click on a task opens the hand-off sheet: what the task says about its readiness, each Team on offer with its Roles, queue and last 7 days (the task's `team/<name>` label picks the suggested Team), what handing it over does, and one button that calls the same hand-off route as Tasks. The hand-off then shows under **Just handed over** with **Take back** until a worker starts it. **Recently ended** lists one row per Work Item and none for work already in a lane. With the Fleet board on too, the Now switch reads **Loop** and **Fleet**. Tracks `now.start_sheet`, `now.start_handoff`, `now.start_take_back`, `now.loop_retry`, `now.cancel`, `now.snooze`, `now.dismiss` and `now.unsnooze` |
| `linked.split-page` | release | off | yes | 2027-01-25 | **Agent session page in two columns** (`public/core/linked-sessions.js` `linkedSessionPage` with `split`, `public/views/linked-sessions.js`): a head with the session's state, when it was last heard, harness, model, repository and branch, Work Items, API-price estimate and, for its owner, the resume command. Below it, from 60 rem of page width, what the owner acts on sits on the left (tool prompts waiting for an answer, Messages, and one **Hand to Ploeg** card with Let Ploeg finish and the new Work Item form) and Work Items, Telemetry, Commits and Details on the right; narrower pages stack them in that order. Someone else's session shows only the reference cards. Same reads and actions as the single column. Tracks the `linked.split-page` exposure |
| `cards.rarity` | release | off | yes | 2027-01-17 | Shows each Run card's rarity: its tier from common to legendary, predicted once a Run starts and revealed at release, with the mark, frame ring, reveal and Rarity tab, and the binder's rarity filter and sort. Applies only while the deployment leaves `cards.rules.rarity` unset: `true` shows rarity to everyone and `false` turns it off whatever the flag says. Unfold still freezes revealed tiers while the flag is off, so turning it on shows them ([Unfold ADR 0045](../adrs/0045-unfold-records-the-run-card-rules-it-computes.md#update-2026-10-17-rarity-is-off-by-default-behind-a-feature-flag)). Evaluated on the server: a person whose flag is off never receives a card's rarity |
| `cards.health.judge` | permission | off | no | — | Lets a model judge, while a Run runs, whether it is still working on its Work Item ([RFC-0007](../../../../docs/design/rfc-0007-run-health.md), [ADR 0046](../adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md)). Each judgement is a Ploeg Ask paid from the Team's Ask Allowance, on the models `runHealth.judgeModels` lists (Hetzner's free EU-hosted inference by default) and never another. Shadow only: the verdict can raise the Run's health badge, never lower it, and it never stops, requeues, steers or grades a Run. Evaluated on the server with the Run's `team` in the context, so target it per Team, for example `"targeting": {"if": [{"in": [{"var": "team"}, ["bronze"]]}, "on", null]}`. A viewer's read never starts a judgement, and the demo never judges |
| `runs.tripwire` | permission | off | no | — | Lets the decider tripwire screen every new tool call of the Team's running Runs ([RFC-0008](../../../../docs/design/rfc-0008-decision-models.md), [ADR-0042](../../../../docs/adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md)): five checks scored 0 to 3 by the configured `decider`, off the Run's path. Hits scoring 2 or more show in the Run's Tripwire list and the live view's containment panel with Right and Wrong controls. Shadow only: it never stops, cancels, steers or notes a Run. Needs a `decider` block ([live operation](live.md#decider-tripwire)); without one the route says `no_decider`. Evaluated on the server by the reader, for no person, with only the Run's `team` in the context, so target it per Team: `"targeting": {"if": [{"in": [{"var": "team"}, ["bronze"]]}, "on", null]}`. The demo never screens |
| `runs.progress-checks` | permission | off | no | — | Lets the decider read what the Team's running agents write ([RFC-0009](../../../../docs/design/rfc-0009-judging-a-run-by-its-kind-of-work.md)): three checks scored 0 to 3 on each thought or message (already done, asks for a person, off the brief), and a Work Kind guessed from the title of a Run no rule recognises. Hits scoring 2 or more list under Progress checks in the Run's Decider list with Right and Wrong; a 3 on a shown check raises the Run's health to Watch. Same `decider` block, key and rate as the tripwire; never stops, cancels, steers or notes a Run. Evaluated on the server by the reader with only the Run's `team` in the context. The demo never reads |
| `linked.trace-comment` | permission | off | no | — | Keeps one comment, keyed `agent-trace`, on the newest open pull request of a Work Item with Linked Sessions (`src/agent-trace-comments.ts`): AI-written lines per commit from the Agent Trace records of the Work Item's Linked Sessions of that repository, with a link to each session's page, and no model, cost or telemetry. Written through Ploeg's keyed pull request comment ([Ploeg ADR-0079](../../../ploeg/docs/adrs/0079-run-cards-belong-to-the-consumer-and-ploeg-supplies-delivery-facts.md)) five minutes after a record arrives, once per Work Item and window, and only when the text changed. Needs a connected Ploeg; the demo never writes. Evaluated on the server for no person, with only the Work Item's `team` in the context, so target it per Team: `"targeting": {"if": [{"in": [{"var": "team"}, ["bronze"]]}, "on", null]}` |
| `client.sign-off` | permission | off | no | — | Lets an administrator or operator record and withdraw a Client Sign-off on the Client's behalf on a Work Item's newest open pull request (`src/client-sign-off.ts`, [system ADR-0049](../../../../docs/adr/adr-0049-a-client-sign-off-is-input-to-acceptance-bound-to-the-head-commit-and-each-client-has-an-approver.md), proposed): looks good or needs changes, bound to the head commit from Ploeg's delivery facts and dismissed for good by a newer head. It covers the changed files minus the exclusion globs an administrator sets per repository. Input to the Agency's Acceptance only; it changes no Ploeg or forge state. Needs a connected Ploeg with delivery facts; the demo answers `facts_unavailable`. Evaluated on the server with only the Work Item's `team` in the context, so target it per Team: `"targeting": {"if": [{"in": [{"var": "team"}, ["bronze"]]}, "on", null]}` |
| `client.sign-off-comment` | permission | off | no | — | Keeps one comment, keyed `client-sign-off`, on the newest open pull request of a Work Item with a Client Sign-off: the answer, the head commit, what it covers, and that the Agency decides Acceptance. It names the Client only, never the person, the note, a price or spend. Written through Ploeg's keyed pull request comment ([Ploeg ADR-0079](../../../ploeg/docs/adrs/0079-run-cards-belong-to-the-consumer-and-ploeg-supplies-delivery-facts.md)) as `unfold-cards` 30 seconds after a change, only when the text changed; a Ploeg that requires proven attribution refuses that write, which Unfold logs once. Evaluated per Team like `client.sign-off` |
| `billing.export` | permission | off | no | — | Writes one line per accepted Work Item, and one credit line per Reversal an administrator confirms, into the billing tool the `billing` block configures, at the Agency's own price per Client (`src/billing.ts`, [Bill accepted tickets through Simplicate](billing-simplicate.md)). Needs a `billing` block and a mapping per Client under Settings, Billing. The tool makes and sends the invoice; Unfold never does. Evaluated per Tenant: the context carries the Tenant id as `tenantId` and `targetingKey` `tenant:<id>` |

`npm run check` fails when this table misses a registered flag.

## Where a flag's rule comes from

Each layer changes only the fields it names, and later layers win:

1. **Code:** [`src/flag-registry.json`](../../src/flag-registry.json) defines every flag in full, with its metadata: `kind`, `owner`, `created`, `expires`, `title`, `description`, `client` (its value goes to the browser), `labs` (people may opt in or out) and optional `excludes` (Labs flags that cannot be on together for one person; both flags name each other, and the registry refuses a one-sided pair).
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

Settings › Labs lists every flag marked `labs`. Each person picks on, off or default, and the choice follows their account to every device. Choosing a flag on also records off for each flag it `excludes`, and its Labs row says so; choosing it off or default leaves the others as they were. `work.live-view` and `work.unified` exclude each other: the one page replaces the page the live view sits on. Administrators also see every flag with:

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
