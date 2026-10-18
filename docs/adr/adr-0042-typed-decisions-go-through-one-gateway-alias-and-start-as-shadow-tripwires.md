---
status: proposed
date: 2026-10-18
decision-makers: Ryan Grippeling
---

# Typed decisions go through one gateway alias and start as shadow tripwires

## Context and Problem Statement

A decision model answers typed questions (yes or no, a choice, a score) with probabilities instead of text, in tens of milliseconds and for fractions of a cent. LiteLLM serves them on `/v1/decisions` and, since 1.105.0, as a `decision_model` guardrail that scores each model answer and tool call against yes/no questions. The owner wants this as a building block for more than one use, starting with an early tripwire on what agents do, and asked for it cheap, preferably free, but sustainable (2026-10-18). [RFC-0008](../design/rfc-0008-decision-models.md) has the options, the prices and the uses. Where do typed decisions go through, which model answers them, and what may a tripwire do to a Run?

## Decision Drivers

* A provider can be swapped without changing any caller.
* Nothing a Run depends on rests on a free tier or an experimental service.
* Money is visible: the guardrail's own calls write no spend rows in LiteLLM, so they bypass Ploeg's metering (Ploeg ADR-0008).
* A check acts on a Run only after its precision is measured (Ploeg ADR-0096, [Unfold ADR 0046](../../apps/unfold/docs/adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md)).
* A decider outage never stops a Run.
* Ploeg never runs a model (Ploeg ADR-0082) and never names its consumer.

## Considered Options

* One gateway alias, `decider`, on a priced provider, with the tripwire as a logging guardrail on opted-in Teams
* Each caller names its own decision model
* A free tier (Workers AI `clef-flash`, Hetzner's experimental inference) as the decider
* Self-host a decider before using one

## Decision Outcome

Chosen option: "one gateway alias, `decider`, on a priced provider, with the tripwire as a logging guardrail on opted-in Teams", because it is the only option that is both cheap now and changeable later without touching callers, and it keeps every tripwire in shadow until it has earned the right to act.

* **One alias.** Homelab's LiteLLM defines `decider` with `model_info.mode: evaluation`. Every typed decision, the guardrail included, names `decider`, never a provider. It points at Perplexity `pplx-decider-v1-27b` (US$0.04 per million input tokens, output free) unless the owner picks otherwise (RFC-0008, open question 1). It moves to a self-hosted decider when volume or EU residency asks for it.
* **Own code only, for now.** `decider` runs at a US provider, so it screens only Teams that work on our own repositories until [VIK-1651](https://vikunja.webgrip.dev/tasks/1651) names an EU route for client code.
* **The tripwire.** A guardrail `agent-tripwire` with `guardrail: decision_model`, `decision_model: decider`, `mode: post_call`, `unreachable_fallback: fail_open`, not `default_on`, and only checks with `action: log`.
* **Attachment.** A Team's Ploeg inference policy may name gateway guardrails, and Ploeg passes them on each key it mints for that Team and Role. That is a Ploeg change with its own record in ploeg-hq. Bronze's builder is the first.
* **Acting.** A check moves from `log` to `block` only by a later record, after the owner has read its flags and named the precision it must reach.
* **Money.** The tripwire's cost is read from the provider's bill each month, because the gateway does not record it.

### Consequences

* Good, because every later use (the Run health cascade, the premise check, routing, triage) asks `decider` and inherits the provider choice, its budget and its residency.
* Good, because a tripwire in `log` changes no Run, and `fail_open` means an outage changes none either.
* Good, because at the estimated US$0.008 per bronze Run the tripwire adds under 1 % to a merged Work Item's cost.
* Bad, because the guardrail's spend is invisible to Ploeg and Unfold; a provider bill is a monthly, manual check. Accepted while the decider is this cheap; a self-hosted decider removes it.
* Bad, because a US provider sees the screened text. Accepted for own code; client code waits for VIK-1651.
* Bad, because a shadow tripwire catches nothing in time: it records what it would have blocked. That is the price of measuring before acting.

### Confirmation

* Homelab: `decider` answers `/health` as a `mode: evaluation` deployment, and `agent-tripwire` is listed by LiteLLM's guardrail API with `fail_open` and only `log` checks.
* Ploeg: a key minted for a Team whose policy names `agent-tripwire` carries it, and a key for any other Team does not (a test in ploeg-hq's own change).
* Live: one bronze Run shows `guardrail_flagged` entries or none in LiteLLM's log, and its duration is in line with bronze Runs before.

## Pros and Cons of the Options

### Each caller names its own decision model

* Good, because each use can pick the best model for its question.
* Bad, because a provider change, a residency rule or a price change touches every caller.

### A free tier as the decider

* Good, because it costs nothing.
* Bad, because Workers AI's free allocation is capped per day and Hetzner's inference is experimental and not a `/v1/decisions` provider; a tripwire on every action would outgrow or outlive either.

### Self-host a decider before using one

* Good, because EU-hosted, flat cost, spend under our control.
* Bad, because it needs a GPU the homelab does not have, and weeks before the first measured flag.

## More Information

* [RFC-0008: Decision models](../design/rfc-0008-decision-models.md): the guardrail as documented, the providers and prices, the first five checks, the other uses and the plan.
* LiteLLM: [decision model guardrail](https://docs.litellm.ai/docs/proxy/guardrails/decision_model), [decision models](https://docs.litellm.ai/blog/decision-models), [v1.105.0 notes](https://docs.litellm.ai/release_notes/v1.105.0/v1-105-0).
* 2026-10-18 — Proposed, after the owner asked for decision models as a reusable layer starting with an early tripwire.
