---
status: proposed
date: 2026-10-29
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# A Delivery Brief is one evidence-backed record, rendered per audience

## Context and Problem Statement

A pull request Unfold delivers is read by several people who need different things: the Agency's developer reviews the diff and its risks, whoever deploys it needs the rollout order, the checks between steps and the way back, and the Client needs to know what changed for them and what to try on the Preview Environment. Today the agent writes one pull request description for all of them, and its claims are prose. Nothing separates "CI was green" from "it runs".

On 2026-10-29 that gap cost an evening in the homelab: a release merged with its lint check red, an OpenBao upgrade reported "upgrade succeeded" while the pod still ran the old version under `OnDelete`, and a rebuilt pull request said "the volume is pruned" when the chart keeps it. Each claim read as true and none had been checked.

How does an agent hand over work so that every reader gets their part, and every claim shows whether anyone checked it?

## Decision Drivers

* Pull requests are small, whole and explained ([system ADR-0010](../../../../docs/adr/adr-0010-pull-requests-are-small-whole-and-explained.md)); the explanation has to scale to several audiences without several documents drifting apart.
* A claim is only as good as its evidence, and the harness can capture evidence the model cannot invent.
* Unfold never contacts a Client directly; what a Client sees is the Agency's to share.
* It has to work in a person's own Claude Code session and in a Run, without an Unfold server.

## Considered Options

* **One structured record (`unfold.delivery-brief/1`), an evidence ledger written by the plugin's hooks, and a renderer that draws a fold per audience in the Unfold brand**
* A longer pull request description with sections per audience
* A page the Unfold application renders from its own database

## Decision Outcome

Chosen option: "**one record, a hook-written ledger and a renderer**", because the record is the single source every audience reads, the ledger makes "verified" mean something, and the plugin can do all of it locally.

1. **The ledger.** The plugin's `PostToolUse` and `PostToolUseFailure` hooks on `Bash` append an entry for every command that proves something - tests, lints and validators, renders, CI reads, live cluster reads, deliveries - with its outcome, exit code and last three lines of output. Secrets are redacted before anything is written. It lives in `${CLAUDE_PLUGIN_DATA}/evidence/<session>.jsonl`, at most 500 entries, and never leaves the machine. It is recorded even without `UNFOLD_URL`; `UNFOLD_EVIDENCE=0` turns it off.
2. **The record.** [`brief.schema.json`](../../extensions/claude-code/brief/brief.schema.json) holds the summary, intent, changes, evidence, risks, rollout, rollback, decisions and the Client's part. Each evidence item is `verified`, `unverified`, `stale` or `failed`, and points at a ledger entry, a CI run, a live check or a document. Rollout steps name the evidence that proves them.
3. **The renderer.** [`render-brief.mjs`](../../extensions/claude-code/brief/render-brief.mjs) validates the record and writes one self-contained page: the sheet everyone reads, with an approach-lights strip that lights a Baken light only for a step marked done whose every check is verified (a done step without that is drawn half-lit as "unproven"), and a fold each for the reviewer, the operator, the Client and open decisions. Failure is shown by shape and word, never by the accent red. The brand's tokens and mark are copies of `docs/brand`, and a test fails when they drift.
4. **The skill.** `/unfold:brief` gathers the ledger and the change, writes the record with the status rules, renders it, publishes it as a claude.ai Artifact and adds its link to the Work Item.

### Consequences

* Good, because a reader sees at a glance which claims were checked, and an agent cannot mark a claim verified without a source to cite.
* Good, because one record feeds every audience, so the Client's summary and the reviewer's risks cannot contradict each other.
* Bad, because the ledger classifies commands by pattern; a check run in an unusual way is missed and its claim stays unverified until the agent cites another source.
* Bad, because a published Artifact is a copy at publish time; a stale brief needs republishing.

### Confirmation

`apps/unfold/test/claude-code-evidence.test.ts` covers classification, redaction, outcomes and exit codes, the ledger's limit, and recording without Unfold configured. `apps/unfold/test/delivery-brief.test.ts` covers validation, escaping, the brand copies and the page contract.

## More Information

The ledger is the first of the Claude Code integrations proposed on 2026-10-29. Later ones build on the record: brief comments that reach the session, a scribe role in a Shift plan, and a headless run in CI that writes the brief when a pull request opens and checks it is live after merge.
