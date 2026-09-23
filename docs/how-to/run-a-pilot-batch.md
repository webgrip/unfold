---
type: how-to
audience: [owner]
owner: glide
last_verified: 2026-09-23
verified_by: "node --test scripts/eval/eval.test.mjs; mise run evaluate; read apps/vloer/public/ploeg.js, apps/ploeg/pkg/shiftengine/{engine,reviewloop}.go and the assign and review how-tos on 2026-09-23"
---

# Run a pilot batch

Use this to put ten real Work Items through Glide and write down what happened. Result: a dated research record with one row per Work Item (outcome, Rounds, settled spend, your review minutes, merged or not, rework) and a short summary. That record is the evidence for deciding whether a Team and plan can run unattended.

Terms: a **Work Item** is Ploeg's copy of a ticket. A **Shift** is one Team's whole attempt at it, run in **Rounds**, and a **Run** is one Role working once. **Ready** means the ticket states something you have decided to do, or describes a problem well enough that a solution can be conceived. See the [glossary](../reference/glossary.md#ready).

**Before you start:** assigning a ticket already works end to end ([assign work to an agent](assign-work-to-an-agent.md)), the target repositories are [prepared](prepare-a-repository.md), and you can open the **Awaiting review** lane in Vloer ([review an agent pull request](review-an-agent-pr.md)).

## Pick ten Work Items

1. Take real work you would otherwise do yourself. Invented tickets measure nothing you care about.
2. Mix the sizes. A workable split is three small (one file, under an hour for you), four medium (a few files, half a day) and three large (a day or more, several modules).
3. Mix the kinds: bug fixes, small features, refactors, missing tests, a documentation change and a dependency bump. Keep at most three of one kind.
4. Check each ticket against Ready before you assign it:
   - The title and description are the whole brief. They are the only ticket text the agent receives.
   - It has acceptance conditions you can check from the diff and the tests.
   - The repository's `AGENTS.md` names a verify command that runs offline in the worker.
   - It needs no secrets, no image pulls and no change to production desired state, and it does not ask the agent to edit instruction files such as `AGENTS.md`.
5. Create a new ticket for each item. Re-assigning an old ticket resets its attempts and opens a second Shift on an existing branch, so it measures the send-back path instead of a cold start.
6. Before assigning, write your own estimate of the minutes the item would take you. It is the baseline the batch is judged against.

## Choose the Team and plan

1. Use one Team and one plan for all ten items. If you change the model, harness or plan halfway, the halves are two small batches that cannot be compared.
2. Start from a writer followed by a reviewer, with a small fix loop:

   ```yaml
   teams:
     pilot:
       assignees: [pilot-agent]
       plan:
         pool: "6"
         maxFixRounds: 1
         rounds:
           - roles: [{name: builder, writes: true, cap: "3.00"}]
           - roles: [{name: reviewer, writes: false, cap: "0.75"}]
   ```

   The keys and the matching `executor.teams` entry are described in [assign work to an agent](assign-work-to-an-agent.md#configure-the-board-and-team).
3. Give the reviewer a model from a different family than the writer when you can. A reviewer on the writer's own model is close to grading itself ([benchmark research, §3.8](../../apps/ploeg/docs/research/2026-08-08-benchmarking-the-loop.md)).
4. Set the pool so that ten times the pool is an amount you accept losing. With the example, the worst case for the batch is $60.00.
5. Write down what you run: the ploegd version, the Team's models, harness, plan, `pool` and `maxFixRounds`, and the Git commit of Ploeg's desired state. They go in the record header.

## Run the batch

1. Assign the items in small groups, two or three at a time, so a systematic failure shows up before all ten are spent.
2. Do not touch a Shift while it runs. If you have to (a stuck Run, a wrong route), write down what you did in the item's notes.
3. When an item reaches `awaiting_review`, review it as in [review an agent pull request](review-an-agent-pr.md) and time yourself.
4. When an item reaches `needs_human`, record the close reason before you do anything else.

## Record each item

Record one row per Work Item. Read the values from Vloer's review screen and the Work Item's detail.

| Field | What to write | Where it comes from |
| --- | --- | --- |
| `ticket` | Tracker id, such as `VIK-812` | The tracker |
| `size`, `kind` | Your classification from the picking step | You |
| `estimate_min` | Your own estimate in minutes | You, before assigning |
| `outcome` | `awaiting_review` or `needs_human`, and the close reason, such as `review_approved` | Review screen |
| `rounds` | The number of Rounds the Shift ran, fix Rounds included | Highest Round under **Execution & review** |
| `settled_usd` | The Shift's **Recorded spend**, two decimals | **Shifts & spending**, after settlement |
| `review_min` | Minutes from opening the pull request to your merge or send-back decision | Your timer |
| `merged` | `yes`, `yes-after-edits` or `no` | The forge |
| `rework` | `none`, `owner-<minutes>` for edits you made, or `reassigned-<count>` for send-backs | You |
| `notes` | What went wrong or surprised you, in one line | You |

ploegd settles a Run's spend from LiteLLM's spend logs after `PLOEG_LLM_SETTLE_AFTER`, 15 minutes by default. Until then the amount shows under **Reserved**. Write `settled_usd` only after settlement; if an amount stays reserved, record it with a `reserved` note.

Count a send-back and its new Shift in the same row: add the Rounds and spend of every Shift, and your review minutes for every pass.

## Write the record

Put the results in a dated research record, `docs/research/<date>-pilot-batch.md`, dated on the day you finish the batch. Records are not edited afterwards, so write it when the last item is settled. Start from this template:

```markdown
# Pilot batch: <Team> on <repositories>

Date: <yyyy-mm-dd>, items assigned <first date> to <last date>. This is a record.

Setup: ploegd <version>, Team `<name>`, harness `<name>`, builder `<model>`, reviewer `<model>`,
pool $<amount>, maxFixRounds <n>, desired state at `<commit>`.

| ticket | size | kind | estimate_min | outcome | rounds | settled_usd | review_min | merged | rework | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VIK-812 | S | bug | 30 | awaiting_review / review_approved | 2 | 0.84 | 6 | yes | none | |

## Summary

- Merged without rework: <n>/10. Merged after edits: <n>/10. Not merged: <n>/10.
- Total settled spend $<amount>; spend per merged item $<amount>.
- Median review minutes <n>, against a median estimate of <n>.
- Close reasons: <reason> ×<n>, …

## What to change

<One paragraph per finding, each with the rows that support it.>
```

To keep the rows in a spreadsheet while the batch runs, use the same columns as CSV and paste them into the record at the end:

```text
ticket,size,kind,estimate_min,outcome,rounds,settled_usd,review_min,merged,rework,notes
```

Ten items is a small sample. Three merged out of ten and six out of ten are hard to tell apart statistically: a 95% interval at n = 10 can be more than 50 points wide ([benchmark research, §10](../../apps/ploeg/docs/research/2026-08-08-benchmarking-the-loop.md)). Report counts, not rates, and let the notes carry the findings: which kinds of work failed, and why.

## Compare variants before a batch

A pilot batch is expensive to repeat. To choose between two prompts, models or harnesses first, use the evaluation harness in [`scripts/eval`](../../scripts/eval/eval.mjs). It runs fixture Work Items through each variant and grades them with known-good tests. It is a development tool beside Ploeg: it does not dispatch through Ploeg, so it says nothing about Ploeg's Shifts, reviews or settlement.

### Run it deterministically

```sh
mise run evaluate
mise run evaluate -- --trials 3 --fixture order-rounding
```

By default it runs the [deterministic variants](../../scripts/eval/variants/deterministic.json) against a local fake LiteLLM gateway. Scripted harnesses make fixed edits, so the run makes no model calls and records no spend. Those variants calibrate the grader, not any model: the known-good fix must pass on every fixture, and editing the tests or changing nothing must fail. `mise run verify` runs the same check through [its tests](../../scripts/eval/eval.test.mjs).

Each trial:

1. copies the fixture repository to a temporary directory;
2. mints a capped key for the trial on the gateway;
3. runs the variant's harness with the composed prompt;
4. blocks the key and, on a live run, reads the key's spend;
5. restores the fixture's protected test files, so editing the tests cannot pass, and records which protected files the harness changed;
6. runs the fixture's check command. Exit code 0 is a pass.

Results go to `.build/eval/<timestamp>/`: `results.json` with every trial and a summary per variant and per variant and fixture, and `trials.csv` with one row per trial. The columns are `passed`, `steps`, `tamperedPaths`, `changedFiles`, `spendUsd` and `modelCalls`. `steps` is the number of scripted actions, or what a command harness writes as `{"steps": n}` to the file named by `GLIDE_EVAL_OUTCOME_FILE`; it stays empty otherwise. The summary gives a Wilson 95% interval for each pass rate, so overlapping intervals read as "not separated".

### Add a fixture

A fixture is a directory under [`scripts/eval/fixtures`](../../scripts/eval/fixtures/order-rounding/fixture.json) with:

- `fixture.json`: the repository path, the check command and the `protected` test paths;
- `task.md`: the ticket text, written to be Ready;
- `scripted/oracle.json`, `scripted/tamper-tests.json` and `scripted/no-op.json`: the calibration edits.

The `order-rounding` fixture reuses Vloer's demo repository; `split-bill` carries its own `repo/`. A new fixture is only usable when its oracle passes and its no-op and tamper scripts fail.

### Add a variant

A variant file lists variants with an `id`, a `harness`, a `prompt` template and a `model`. The template's `{{task}}` becomes the fixture's ticket text and `{{check}}` its check command. Keep two variants identical except for the one thing you compare. A `command` harness runs a real agent program; its arguments and `env` values may use `{prompt}`, `{promptFile}`, `{model}`, `{gatewayUrl}`, `{gatewayKey}` and `{outcomeFile}`. It receives only `PATH`, locale, `TERM`, a fresh `HOME` and the values you map, never the gateway's admin key. [live.example.json](../../scripts/eval/variants/live.example.json) shows an A/B pair that differs only in the prompt.

### Run it live

A `command` variant can call models and spend money, so the harness refuses it unless you opt in:

```sh
GLIDE_EVAL_LIVE=1 \
GLIDE_EVAL_LITELLM_URL=https://litellm.example.internal \
GLIDE_EVAL_LITELLM_MASTER_KEY=... \
mise run evaluate -- --variants scripts/eval/variants/my-pair.json --trials 5
```

Each trial's key is limited to the variant's `model` and `maxBudgetUsd` (default $1.00), and deleted afterwards. `spendUsd` is the spend LiteLLM reports on the key right after the harness exits. It is observed, not settled, and late spend-log entries can add to it.

Limits of a live run:

- The agent runs on your machine, in a temporary copy, with your `PATH`. Run it in a container if the harness can reach anything you care about.
- It holds the gateway's admin key for the duration of the run, and the per-trial key cap is its only spend limit. [ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md) makes Ploeg the authority for every agent run, so treat live evaluation as an owner's lab tool, not a way to run work.
- Five trials per variant separate only large differences. Escalate the trial count only for a comparison worth paying for.

Next: take the winning variant into a Team's configuration and confirm it with a pilot batch.
