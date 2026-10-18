---
status: proposed
date: 2026-10-18
decision-makers: Ryan Grippeling
---

# A self-hosted decider reads what agents do and starts as a shadow tripwire

## Context and Problem Statement

A decision model answers typed questions (yes or no, a choice, a score) with probabilities instead of text, in a fraction of a second. The owner wants one as a reusable building block, starting with an early tripwire on what agents do, against both a hijacked agent and a careless one (2026-10-18). The owner also ruled that tool-call content goes only to EU or self-hosted models, that there is no budget and no spare capacity on the worker nodes, and that hits are seen live. [RFC-0008](../design/rfc-0008-decision-models.md) has the options, the measurements and the uses. Which decider, where does the tripwire read, and what may it do to a Run?

## Decision Drivers

* Tool-call arguments can hold file contents, diffs or an echoed token: EU or self-hosted only.
* No spend, and no new load on the full worker nodes.
* A Run is never slowed or stopped by the tripwire failing.
* A check acts on a Run only after its precision is measured (Ploeg ADR-0096, [Unfold ADR 0046](../../apps/unfold/docs/adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md)).
* One hit can be minor and another serious, so the answer is a score, not yes or no.
* Every action on a Run names who took it (Ploeg ADR-0108); Ploeg never runs a model (Ploeg ADR-0082).

## Considered Options

* An out-of-band reader in Unfold, on Strands Decider 2B self-hosted and scaled to zero, with Hetzner's free Qwen until it runs
* LiteLLM's `decision_model` guardrail inline on the gateway
* A hosted decider (Perplexity, Cloudflare clef)
* A rented EU GPU for a fast decider

## Decision Outcome

Chosen option: "an out-of-band reader in Unfold, on Strands Decider 2B self-hosted and scaled to zero, with Hetzner's free Qwen until it runs", because it is the only option that keeps tool-call content in the EU or on our own machines, costs nothing, adds nothing to a Run's path, and can answer in scores.

* **The decider.** [Strands Decider 2B](https://github.com/strands-labs/strands-decider) (Apache 2.0) in one pod on a soyo node, scaled to zero by KEDA while no watched Run runs, behind LiteLLM's alias `decider` (`strands_decider/` provider, `/v1/systemone`). Until that pod runs, Hetzner's free EU-hosted `hetzner-qwen3-8-27b` answers the same questions as one JSON object. Unfold's `Decider` interface hides which one answers; every hit records which did.
* **The reader.** Unfold screens each new `tool_call` transcript entry of a running Run whose Team has the tripwire flag on, after redaction, off the Run's path. It covers Runs with a transcript (ACP harnesses). A decider outage means missed screens, never a stopped or slower Run.
* **The checks.** Five score questions from 0 to 3: `reads_credentials`, `probes_sandbox`, `edits_own_instructions`, `follows_injected_orders`, `remote_code` (RFC-0008 has the wording).
* **Showing.** Hits scoring 2 or more appear on the Work Item page in the live view's containment panel, with the tool call, the score, the decider and "right" and "wrong" controls recorded as product events.
* **No stop at first.** For two weeks no score stops anything. Then the owner names a stop score per check, in a later record.
* **The later stop.** Made by a named service actor `tripwire` on channel `unfold`, through the existing withdrawal, with the Work Item put in Needs you. It needs a ploeg-hq record that admits a service actor beside people (amending Ploeg ADR-0108) before it is built.
* **Money and identity.** Both deciders cost nothing per call, so screening is not an Ask. Unfold calls the gateway with its own virtual key, limited to the decider models with a budget of zero.

### Consequences

* Good, because every later use (the Run health cascade, the premise check, routing, triage) asks the same decider and inherits its EU hosting and its zero price.
* Good, because the reader cannot slow or break a Run, and scores separate a careless read from a hijack.
* Good, because the hits are where the owner looks, with a right or wrong control that measures precision as a side effect.
* Bad, because an out-of-band reader sees an action just after it starts: a later stop ends the Run but cannot prevent that action. Accepted: preventing needs a fast inline decider the owner chose not to pay for.
* Bad, because Runs without a transcript (Claude Code, headless OpenHands) are not screened.
* Bad, because the interim decider is experimental and the Strands model is about two weeks old; neither has a track record. Hits are labelled by decider, and nothing acts on them.
* Bad, because the pod takes about 4 GB of a soyo node's memory while it is awake, and the first screens of a Run wait for it to start.

### Confirmation

* Unfold tests: a tool call whose Team's flag is off is not screened; a decider failure leaves the Run untouched and records a missed screen; a hit records its decider; no hit stops a Run.
* Homelab: Unfold's gateway key lists only the decider models and has a budget of zero; the Strands pod scales to zero with no watched Run running (KEDA's `ScaledObject` status).
* Live: a bronze Run's tool calls show screens in the containment panel, and its duration is in line with bronze Runs before.

## Pros and Cons of the Options

### LiteLLM's `decision_model` guardrail inline

* Good, because it screens a tool call before the agent runs it, so it can prevent an action.
* Bad, because every model call waits for the decider, and Strands Decider on CPU takes seconds per call; it defaults to failing every call when the decider is down, writes no spend rows and takes only yes/no questions.

### A hosted decider

* Good, because it is fast and costs fractions of a cent.
* Bad, because every candidate found is US-hosted, which the owner ruled out for tool-call content.

### A rented EU GPU

* Good, because a fast EU decider could later go inline.
* Bad, because roughly €150 to 200 a month is the whole cloud cluster's cap, and the owner set no budget.

## More Information

* [RFC-0008: Decision models](../design/rfc-0008-decision-models.md): the constraints, the node measurements, the checks, the other uses and the plan.
* Strands Decider: [repository](https://github.com/strands-labs/strands-decider). LiteLLM: [decision model guardrail](https://docs.litellm.ai/docs/proxy/guardrails/decision_model), [decision models](https://docs.litellm.ai/blog/decision-models).
* 2026-10-18 — Proposed, after the owner answered two rounds of questions on placement, decider, actor and severity.
