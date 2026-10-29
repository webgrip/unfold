---
name: brief
description: Writes an Unfold Delivery Brief for the work this session did - one evidence-backed record of what changed, why, how it was checked, how to roll it out and back - and publishes it as a branded page with a fold per audience (reviewer, operator, Client). Use when the person asks for a brief, a write-up, an explainer or a hand-over of a pull request or Work Item, asks to explain what was done to a reviewer, operator, manager or Client, or asks for a rollout checklist for a change.
argument-hint: "[pull request URL or Work Item id]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/evidence-ledger.mjs *) Bash(node ${CLAUDE_PLUGIN_ROOT}/brief/render-brief.mjs *)
---

# Write a Delivery Brief

A Delivery Brief is one record, rendered once per audience. Its contract is [`brief.schema.json`](../../brief/brief.schema.json) (`unfold.delivery-brief/1`); the renderer refuses anything else. Every claim in it points at evidence. A claim nobody checked is written **unverified**, never smoothed over: the brief exists so a reader can tell "CI was green" from "it is running".

## 1. Gather what happened

1. Read this session's evidence ledger. The plugin's hooks wrote one entry for every test, lint, render, CI, live-cluster and delivery command, with its outcome, exit code and last lines of output, secrets redacted:

   ```sh
   node ${CLAUDE_PLUGIN_ROOT}/scripts/evidence-ledger.mjs
   ```

   It reads the most recent session's ledger; pass the session id from the plugin's session line ("Unfold records this Claude Code session as …") when several sessions run. `--json` prints the raw entries.
2. Find the change: the pull requests the person named or this session opened, their diffs (`git log`, `git diff <base>...HEAD`) and their state on the forge.
3. Find the Work Item: from `$ARGUMENTS`, the plugin's session line or `unfold_get_work`.

## 2. Decide each claim's status

| Status | Only when |
| --- | --- |
| `verified` | A ledger entry with outcome `passed` checked exactly this claim (cite it in `source.ledger`, e.g. `e14`), or a CI run or live check you can link (`source.url`) says so now |
| `failed` | The last check of it failed and nothing later passed |
| `stale` | It was checked, but something it depends on changed afterwards: a later commit, a merge, a deploy |
| `unverified` | Anything else, including everything you remember but did not check in this session |

Re-check every `verified` claim against its source before you publish, and downgrade what does not hold. A green pipeline proves the pipeline; "the change is live" needs a live check. Never let a summary sentence claim more than its evidence.

## 3. Write the record

Write `delivery-brief.json` in the session's scratch or temp directory, following the schema:

- `summary`: the sheet everyone reads, in plain words, no jargon a Client would not know.
- `intent`, `changes` (by area, with why), `evidence`, `risks`: the reviewer's fold.
- `rollout` (each step with the check that proves it and the evidence ids) and `rollback`: the operator's fold.
- `client`: only what the Agency may show its Client: the outcome, the Preview Environment, what to try. Never internal hosts, credentials, costs or infrastructure detail.
- `decisions`: what waits on a person, with a recommendation.

Say Work Item, never Ticket. Keep employer, client and tenant names out unless this repository is theirs.

## 4. Render and publish

```sh
node ${CLAUDE_PLUGIN_ROOT}/brief/render-brief.mjs <dir>/delivery-brief.json <dir>/delivery-brief.html
```

Fix every validation error it prints; do not loosen a status to make it pass. Then publish `<dir>/delivery-brief.html` with the Artifact tool (`icon: "plane"`, a one-sentence `description`). Republish the same path to update it; the link stays the same. If the Artifact tool is not available, give the person the HTML file's path.

## 5. Connect it

- Add the brief's link to the Work Item with `unfold_add_note`, and to the pull request description when the person asks.
- When the person wants comments on the page to reach this session, watch it with the `ArtifactComments` tool, and answer or rework from there.
- Tell the person, in one screen: the link, the counts per status, and every `unverified`, `stale` or `failed` claim by name.
