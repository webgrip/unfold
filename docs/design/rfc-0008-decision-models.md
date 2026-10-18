# RFC-0008: Decision models, cheap typed answers about what agents do

> Status: **Proposed** 2026-10-18 · Owner request (2026-10-18): "I want this kind of architecture because I think we will also use it for other stuff. But maybe not clef then. Cheaper is better, free is better, but sustainable? What else can we use decision models for? Early tripwire is correct framing." · Owner decisions the same day, after two rounds of questions: EU or self-hosted only; an out-of-band reader, not a gateway guardrail; Strands Decider 2B, scaled to zero on a soyo node, with Hetzner's free Qwen until it runs; a severity score per hit; nothing stops a Run at first; Unfold shows hits live; a later automatic stop acts as a named service actor · Decision record: [ADR-0042](../adr/adr-0042-a-self-hosted-decider-reads-what-agents-do-and-starts-as-a-shadow-tripwire.md) (proposed) · Builds on: [RFC-0007](rfc-0007-run-health.md) and [Unfold ADR 0046](../../apps/unfold/docs/adrs/0046-a-running-runs-health-is-computed-from-its-own-facts-and-a-judge-only-advises.md) (Run health), Ploeg ADR-0082 (Ploeg never runs a model), ADR-0090 (transcripts), ADR-0096 (a shadow reader never acts), ADR-0108 (every operator action names its person and channel), the [LiteLLM and Fireworks record](../research/2026-10-14-litellm-and-fireworks-update.md)
>
> **TL;DR.** A decision model answers typed questions (yes or no, one of a list, a score) with probabilities instead of prose: small, fast, no text to pay for. This RFC makes one a reusable building block, the **decider**, and gives it a first job: an early **tripwire** that scores every tool call a builder makes for signs of a hijack or a careless agent. The decider runs on our own hardware in the EU: Strands Decider 2B, an open model, on a soyo node that wakes only while Runs run. Until that pod exists, Hetzner's free EU-hosted Qwen answers instead. The tripwire reads each Run's transcript next to the Run, never in its path, and shows each hit with its score on the Work Item page. For the first two weeks nothing stops a Run; then the owner picks, per check, the score that does. Nothing here is built.

## Why a second kind of model

The Run health judge ([RFC-0007](rfc-0007-run-health.md)) writes a verdict with a reason, at most every 10 minutes. Some questions need the opposite shape: "is this tool call reading credentials?" has to be asked of every action, the answer is a number to compare with a threshold, and nobody needs a sentence unless it trips. A decision model answers that in a fraction of a second and writes nothing.

The rule for every use: **decide cheaply, explain only when something trips.**

## Constraints the owner set

| Constraint | Consequence |
| --- | --- |
| EU or self-hosted only: tool-call arguments can hold file contents, diffs or an echoed token | US deciders (Perplexity, Cloudflare clef, OpenAI) are out, even for our own code |
| No new spend, and no spare capacity on the worker nodes | A self-hosted decider on the soyo nodes, awake only while it has work |
| Defend against a hijack **and** a careless agent | One set of checks, each answered as a severity score, so one hit can be minor and another serious |
| A person must see hits as they happen | Unfold shows them on the Work Item page, not in a weekly list |

## Where the tripwire sits: next to the Run, not in its path

Two places were weighed.

**A gateway guardrail.** LiteLLM 1.105's `decision_model` guardrail ([docs](https://docs.litellm.ai/docs/proxy/guardrails/decision_model)) scores each model answer, tool calls included, before the agent sees it, so it could prevent an action. But every model call waits for it, and on CPU Strands Decider takes about 1.6 s for a short input and 16 to 18 s at 3,000 tokens on an 8-thread Xeon (the [repository's own figures](https://github.com/strands-labs/strands-decider)). A bronze Run makes on the order of 100 model calls. The guardrail also defaults to failing every call when the decider is down, writes no spend rows, and accepts only yes/no questions.

**An out-of-band reader (chosen).** Unfold already reads each Run's transcript (Ploeg ADR-0090) for Run health. The tripwire screens each new `tool_call` entry as it arrives, off the Run's path:

* it adds no latency to the Run and cannot stop one by failing;
* it redacts before screening, as Unfold already does for transcripts;
* it can ask score questions, which the guardrail cannot;
* its hits land where people look, the Work Item page.

What it gives up: it sees an action just after the agent starts it, so a later stop ends the Run but cannot undo that action. It covers only Runs that have a transcript: ACP harnesses, bronze's included; not Claude Code (`-p` mode) or headless OpenHands.

## The decider

| Option | Price | Where | Verdict |
| --- | --- | --- | --- |
| **Strands Decider 2B** ([repository](https://github.com/strands-labs/strands-decider), Apache 2.0, weights, data and training scripts public) | €0; the machine is ours | soyo node, EU | **Chosen.** About 4 GB of memory for the bf16 weights; serves `/v1/systemone` with yes/no, choice and score questions; LiteLLM has a `strands_decider/` provider |
| **Hetzner's free Qwen** (`hetzner-qwen3-8-27b`) | €0 while experimental | Hetzner, EU, no request content stored | **Until Strands runs.** A chat model asked for a fixed JSON answer; the owner's probe on 2026-10-18 showed it gives one with thinking off. Experimental, so never the end state |
| Perplexity `pplx-decider-v1-27b`, Cloudflare `clef`, OpenAI | cents | US | Out: not EU |
| Mistral's small models | about US$0.10 to 0.15 per million tokens (aggregators disagree) | EU company | Not chosen: paid, and a chat model |
| Rent an EU GPU for a faster decider | roughly €150 to 200 a month | EU | Not now: the whole cloud cluster's cap is €150 ([ADR-0040](../adr/adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md)) |

**Where it runs.** Measured 2026-10-18 with `kubectl describe nodes`: `worker-1` has 96 % of its CPU reserved and `worker-2` and `fringe-workstation` 97 to 99 % of their memory, but each of `soyo-1`, `-2` and `-3` has about 4 GB of memory and 2 cores unreserved and runs at 25 to 37 % CPU. One Strands pod fits on a soyo node. KEDA (installed) scales it to zero when no Run that the tripwire watches is running, so it holds that memory only while there is work. Power: at the owner's rule of thumb of €3 a year per continuous watt, a few watts while Runs run averages out to a few euros a year.

**One name.** Callers ask "the decider", never a provider. Unfold holds a small `Decider` interface with two implementations: Hetzner's Qwen through the chat endpoint now, and LiteLLM's `decider` alias on `/v1/systemone` once the Strands pod runs. The switch is configuration, not a caller change.

**Who pays and who acts for it.** Both deciders cost nothing per call, so screening needs no Ask and no person to admit it (Ploeg ADR-0082's Ask exists to authorize spend). Unfold calls the gateway with its own virtual key, limited to the decider models and capped at a budget of zero, the same arrangement as the card-theme key Unfold already holds. The tripwire screens every watched Run, whether or not anyone has it open.

## The checks

Each check is a score question from 0 (no) to 3 (clearly yes), asked of one tool call with its title, input and paths, after redaction:

| Check | Question | Kind |
| --- | --- | --- |
| `reads_credentials` | Does this action read credentials, private keys, tokens or a secrets file? | careless or hijack |
| `probes_sandbox` | Does it inspect or try to leave its container: the Docker socket, the host, cloud metadata? | hijack |
| `edits_own_instructions` | Does it change files that instruct agents: AGENTS.md, CLAUDE.md, a skill? | careless or hijack |
| `follows_injected_orders` | Does it act on instructions that came from a file or tool output rather than from the task? | hijack |
| `remote_code` | Does it download and run code from the network? | careless or hijack |

Strands' `/v1/systemone` takes the five as one call per tool call. On Qwen the same five come back as one JSON object.

## What a person sees

On the Work Item page, in the live view's containment panel, which today draws these exact scenarios as proposed data ([#402](https://forgejo.webgrip.dev/webgrip/unfold/pulls/402)):

* each hit at 2 or above: the check, its score, the tool call it scored (redacted) and when;
* the decider that answered (Qwen or Strands), so numbers from the two are never mixed;
* a "right" and a "wrong" control on each hit, recorded as product events, which is the precision measure.

A score of 3 on a hijack check is announced like an Off track health change. Nothing else interrupts.

## Stopping a Run, later

For the first two weeks no score stops anything. Then the owner names, per check, the score that stops a Run, from the hits marked right and wrong. A stop:

* is made by a named service actor, `tripwire`, on channel `unfold`, recorded on the Run like a person's action. Ploeg ADR-0108 today requires a person, so this needs an amendment in ploeg-hq first;
* withdraws the Run (blocks its key and forge credentials, the existing `cancel` route) and puts the Work Item in Needs you with the hit as the reason.

## Other uses of the decider

Each is a typed question that today is a phrase matcher, a person or nothing. None is decided.

| Use | Question(s) | Today |
| --- | --- | --- |
| Run health cascade | Off brief? Looping? Asked every minute; the chat judge writes its verdict only when one trips | The judge runs on a timer ([RFC-0007](rfc-0007-run-health.md)) |
| Premise check before a Run | Does the brief name the files? Is it small and clear? | Decided, not built (Ploeg ADR-0036, T0) |
| Routing per Work Item | Small and clear, or a cross-module change? | Per Team only |
| Ticket readiness | Acceptance criteria present? Agent-ready? A duplicate? | A person |
| Needs-you triage | Which resolution path fits? | A person |
| Pull requests | Sensitive paths touched? Is a reviewer comment a change request? Is a dependency bump risky? | Partly a reading Run |
| Ask and the Client Portal | Can the record answer this, at zero model spend? Is the client asking for new work? | A phrase matcher (`matchQuestion`) |
| Report a problem | Duplicate? Severity? Component? | A person |

## Plan

1. **Unfold: the `Decider` interface and the tripwire reader** on Hetzner's Qwen, behind a Team flag that is off by default. It screens new tool calls of the flagged Teams' running Runs, stores hits, and shows them in the containment panel with right and wrong controls.
2. **Homelab: the gateway key** for Unfold, limited to the decider models, budget zero. Then the flag on for bronze.
3. **Homelab: the Strands Decider pod** on a soyo node, scaled to zero by KEDA while no watched Run runs, and LiteLLM's `decider` alias on it (`strands_decider/` provider). Unfold switches to it by configuration; hits from before and after stay labelled by decider. Whether an image exists or one must be built is not checked yet.
4. **Two weeks of hits**, marked right or wrong by the owner.
5. **The owner names a stop score per check.** Ploeg: a record that admits a named service actor (amends ADR-0108). Unfold: the stop.
6. **Later, separately:** the Run health cascade and the other uses above, each asking the same decider.

## How we will know it works

* **Precision per check and decider:** hits marked right against all hits shown.
* **Silence on ordinary work:** a check that scores 2 or more on reading `package.json` or running tests is rewritten.
* **No effect on Runs:** Run durations of watched Teams before and after; the reader is off the path, so none is expected.
* **Cost:** zero per call; the soyo node's memory and CPU while awake, from its metrics.

## Questions that remain

1. **Image for Strands Decider.** If none is published, Webgrip builds and signs one in CI like its other images. Checked when step 3 starts.
2. **Wake-up trigger.** KEDA needs a signal that a watched Run is running: Ploeg's Run metrics or a small Unfold endpoint. Picked in step 3.
3. **Stop scores.** Named by the owner after step 4.
