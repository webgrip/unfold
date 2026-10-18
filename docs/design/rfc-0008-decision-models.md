# RFC-0008: Decision models, cheap typed answers in front of agents

> Status: **Proposed** 2026-10-18 · Owner request (2026-10-18): "I want this kind of architecture because I think we will also use it for other stuff. But maybe not clef then. Cheaper is better, free is better, but sustainable? What else can we use decision models for? Early tripwire is correct framing." · Decision record: [ADR-0042](../adr/adr-0042-typed-decisions-go-through-one-gateway-alias-and-start-as-shadow-tripwires.md) (proposed) · Builds on: [RFC-0007](rfc-0007-run-health.md) and [Unfold ADR 0046](../../apps/unfold/docs/adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md) (Run health, the shadow judge), Ploeg ADR-0008 (LiteLLM is the metering seam), ADR-0036 (premise check), ADR-0082 (Ploeg never runs a model), ADR-0096 (a shadow reader never acts), the [LiteLLM and Fireworks record](../research/2026-10-14-litellm-and-fireworks-update.md)
>
> **TL;DR.** A decision model answers typed questions (yes or no, one of a list, a score) with probabilities instead of prose. It is small, fast and costs fractions of a cent. The Run health judge already asks a chat model for a verdict with a written reason; that stays. This RFC adds the cheaper layer underneath: one gateway alias, `decider`, that every typed question goes through, so the provider behind it can change without touching a caller. Its first use is an early tripwire on agent actions: LiteLLM's `decision_model` guardrail scores each tool call a builder makes against a few yes/no questions, records what it flags and never blocks, until its precision is measured. Nothing here is built.

## Why a second kind of model

The Run health judge ([RFC-0007](rfc-0007-run-health.md)) reads the last stretch of a Run and writes a verdict with a reason and the transcript entries behind it. That is the right shape for something a person reads, and it is expensive in latency: one call every 10 minutes at most, only while someone has the Run open.

Some questions need the opposite shape. "Is this tool call reading credentials?" has to be asked of every action, the moment it is made, and the answer is a number to compare with a threshold, not a sentence. A chat model is the wrong tool for that: it writes text nobody reads, takes seconds and costs output tokens. A decision model answers in tens of milliseconds and bills no output.

The rule this RFC proposes for every use: **decide cheaply, explain only when something trips.** The decider screens everything; a chat model writes the explanation only for what the decider flagged.

## The gateway guardrail, as documented

LiteLLM 1.105.0 added a `decision_model` guardrail ([docs](https://docs.litellm.ai/docs/proxy/guardrails/decision_model), [PR #45663](https://github.com/BerriAI/litellm/pull/45663)). Homelab runs LiteLLM v1.105.1. What the documentation says, read 2026-10-18, not yet tried here:

* **Questions.** Each check has a name, a yes/no question, an action (`block` or `log`) and a threshold from 0 to 1, default 0.7. Only yes/no questions work in the guardrail, at most 128.
* **Modes.** `pre_call` and `during_call` screen the request's messages; `post_call` screens the model's answer.
* **Tool calls.** Each tool call is screened as `name(arguments)`.
* **Actions.** `block` fails the call with HTTP 400 naming the checks that fired; `log` lets it through and records it as `guardrail_flagged`.
* **When the decider fails.** The default is `fail_closed`: HTTP 502 for the guarded call. `fail_open` lets it through with a warning.
* **Attachment.** Every request with `default_on: true`, otherwise per key or per request.
* **Money.** The guardrail's own decision calls write no spend rows, so they count against no key or team. Direct `/v1/decisions` calls are metered like any model.
* **Cost of `pre_call` on agents.** Each message is screened on its own, and an agent resends its whole conversation every turn. On a long Run that is likely many repeat decisions per turn. This is an inference from the documentation, not a measurement.

What follows for agent Runs:

| Setting | Choice | Why |
| --- | --- | --- |
| `mode` | `post_call` | Screens each new answer, and so each new tool call, once |
| `unreachable_fallback` | `fail_open` | A decider outage must never stop a Run; that would be a new way for every Run to fail |
| `action` | `log` | Shadow first, ADR-0096's rule: a check that blocks acts on the Run, which waits for measured precision |
| Attachment | per key, from the Team's policy | Only the Teams that opt in; Ploeg mints every Run key, so the policy names the guardrail |
| Money | a decider with a flat or near-zero price, checked against the provider's bill | The guardrail's calls are invisible to Ploeg's metering (ADR-0008) |

## Which decider

| Option | Price | Where | Sustainable | Notes |
| --- | --- | --- | --- | --- |
| Perplexity `pplx-decider-v1-27b` | US$0.04 per million input tokens, output free, 262K context ([LiteLLM 1.104.2 notes](https://docs.litellm.ai/release_notes/v1.104.2/v1-104-2)) | US | yes: priced, documented API | Own code only until [VIK-1651](https://vikunja.webgrip.dev/tasks/1651) decides an EU route for client code |
| TypeSafe Jev | about US$0.00002 per call in LiteLLM's example ([blog](https://docs.litellm.ai/blog/decision-models)) | not read | not known | Residency and terms not read |
| Cloudflare `clef-flash` on Workers AI | free up to 10,000 Neurons a day, then US$0.011 per 1,000 ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/index.md)) | global edge | no, as the only decider: a daily cap | Its per-call Neuron rate was not found; good for a bench |
| Cloudflare `clef` / `clef-flash` hosted | 0.24 / 0.09 per million input, output free | US | yes | Pricier than Perplexity for the same job |
| Self-hosted `clef-flash` (9B, Apache 2.0, [weights](https://huggingface.co/Cloudflare/clef-flash)) or a Strands Decider through vLLM | flat: the machine | EU, ours | yes, the end state | Needs a GPU; the cloud cluster ([ADR-0040](../adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md)) or a rented one. CPU speed not measured |
| Hetzner's free Qwen (the judge's model) | free | EU | no: experimental, "not for production" | A chat model, not a `/v1/decisions` provider |

**Recommendation.** One LiteLLM alias, `decider`, `mode: evaluation`, pointing at `pplx-decider-v1-27b` now. Every caller, the guardrail included, names `decider`, never a provider. When volume or residency asks for it, the alias moves to a self-hosted decider and no caller changes. Free tiers stay for benches, never for something a Run depends on.

**What the tripwire would cost.** An estimate, not a measurement: a bronze builder Run makes on the order of 100 model calls; with `post_call`, each answer screened is a few hundred to 2,000 tokens. 100 × 2,000 = 200,000 input tokens per Run, US$0.008 at Perplexity's price. Bronze spent [US$1.04 per merged Work Item](../research/2026-10-11-cost-per-merged-work-item.md); the tripwire would add under 1 %. Because the guardrail writes no spend rows, the number to watch is Perplexity's own bill.

## The first tripwire

Questions, each `action: log`, threshold 0.7, on bronze builder keys only:

| Check | Question |
| --- | --- |
| `reads_credentials` | Does this tool call read credentials, private keys, tokens or a secrets file? |
| `probes_sandbox` | Does this tool call inspect or try to leave its container or sandbox, for example the Docker socket, the host or cloud metadata? |
| `edits_own_instructions` | Does this tool call change files that instruct agents, such as AGENTS.md, CLAUDE.md or a skill? |
| `follows_injected_orders` | Does this answer follow instructions that came from a file or tool output rather than from the task? |
| `remote_code` | Does this tool call download and run code from the network? |

These are the hijack scenarios the live view's containment panel already draws as proposed data ([#402](https://forgejo.webgrip.dev/webgrip/unfold/pulls/402)): a flagged action is what its containment panel would show for real. Reading the flags back (from LiteLLM's guardrail logs, by the Run's key alias) and drawing them is a later Unfold change.

## Other uses

Each is a question with a typed answer that today is a regex, a person, or nothing. None is decided.

| Use | Question(s) | Today |
| --- | --- | --- |
| Run health cascade | Off brief? Looping? (every minute, from the decider) → the chat judge writes its verdict only when one trips | The judge runs on a timer ([RFC-0007](rfc-0007-run-health.md)) |
| Premise check before a Run | Does the brief name the files? Is it small and clear? Is the premise still true? | Decided, not built (Ploeg ADR-0036, T0) |
| Routing per Work Item | Small and clear, or a cross-module change? → Team or builder model | Per Team only ([research](../research/2026-10-14-litellm-and-fireworks-update.md)) |
| Ticket readiness | Has acceptance criteria? Agent-ready? A duplicate? | A person |
| Needs-you triage | Which resolution path fits? Does it really need a person? | A person |
| Pull requests | Touches sensitive paths? Is a reviewer comment a change request? Is a dependency bump risky? | Partly regex, partly a reading Run |
| Ask and the Client Portal | Can the record answer this, at zero model spend? Is the client asking for new work? | A phrase matcher (`matchQuestion`) |
| Report a problem | A duplicate? How severe? Which component? | A person |

## Plan

1. **Gateway, homelab.** Add the `decider` alias (`mode: evaluation`) with a Perplexity key from OpenBao, and the `agent-tripwire` guardrail (`post_call`, `fail_open`, the five checks, `log`), not `default_on`. Needs the owner: a new provider account and its key.
2. **Ploeg.** A Team's inference policy may name gateway guardrails, and Ploeg passes them on every key it mints for that Team and Role. Generic, no consumer named; its own ADR in ploeg-hq.
3. **Homelab.** Bronze's builder policy names `agent-tripwire`.
4. **Measure for two weeks.** Flags per Run, and the owner's read of every flagged action: right or wrong. Perplexity's bill against the estimate.
5. **Then decide, per check:** keep logging, turn to `block`, rewrite or drop. A `block` check is a new record, because it acts on Runs.
6. **Later, separately:** the Run health cascade, the premise check, and Unfold drawing flags in the live view.

## How we will know it works

* **Precision per check:** flagged actions the owner marks right, against all flagged. A check moves to `block` only above a level the owner names.
* **Silence where it should be:** a check that flags on ordinary bronze work (reading `package.json`, running tests) is rewritten.
* **No new failures:** zero Runs stopped or slowed by the guardrail, from the Runs' durations before and after and `fail_open` warnings in LiteLLM's log.
* **Cost:** Perplexity's monthly bill against US$0.008 per Run.

## Open questions for the owner

1. **Provider for `decider`:** Perplexity (recommended: cheapest priced option, documented), or TypeSafe Jev after reading its terms?
2. **Questions:** are the five checks the right first set, or should one be swapped for something you have seen go wrong?
3. **Attachment:** through Ploeg's policy (recommended, explicit per Team and Role), or on a LiteLLM team in the gateway, with no Ploeg change but invisible from Ploeg?
