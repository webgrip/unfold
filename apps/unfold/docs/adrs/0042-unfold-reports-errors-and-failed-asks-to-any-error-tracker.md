---
status: accepted
date: 2026-10-13
decision-makers: Ryan Grippeling
review-by: 2027-01-13
---

# Unfold reports errors and failed Asks to any error tracker

## Context and Problem Statement

On 2026-10-11 an Ask on the homelab showed "The model returned no answer." Finding out why meant reading LiteLLM's spend log by hand: a reasoning model had spent all 400 output tokens thinking. Unfold kept no record of that failure beyond the stored Ask, and no other failure reached anyone either. Server errors went to a log line, and every model failure became the same "did not answer". On 2026-10-13 the owner asked for two things. First, failures are explained to the person who asked. Second, they reach an error tracker, so someone can act on them. The owner also asked for Unfold to stay tracker-agnostic, preferring free software, even if one tracker is chosen later.

How does Unfold report what needs attention without tying itself to one tracker, and how does a person learn why an Ask has no answer?

## Decision Drivers

* A person sees why there is no answer and whether another try may help, never a bare "no answer".
* Whoever runs Unfold finds out about failures without reading pod logs, and can group them by cause.
* No vendor lock-in. Any tracker works, including free-software ones and the OpenTelemetry stack a self-hosted estate often already runs.
* Nothing secret or personal leaves: Ask keys, configured secrets and user ids stay inside.
* Unfold keeps its small dependency set; its Faro and OTLP product-event exports have no SDK either.

## Considered Options

* Unfold's own reporter with two destinations: OpenTelemetry logs and the Sentry envelope protocol
* The `@sentry/node` SDK
* Only structured log lines, alerted on in Grafana

## Decision Outcome

Chosen option: **Unfold's own reporter with two destinations**. OpenTelemetry is the vendor-neutral standard: any collector and backend accepts an OTLP log record with `exception.*` attributes. The Sentry envelope is the de facto protocol of dedicated error trackers: Sentry, GlitchTip (MIT-licensed) and Bugsink all accept it. Supporting both, with no SDK, keeps the choice of tracker a deployment setting.

1. **Reporter** ([`src/error-reports.ts`](../../src/error-reports.ts)). `UNFOLD_ERROR_OTLP_URL` and `UNFOLD_SENTRY_DSN` turn on each destination; either, both or neither may be set. At most 30 reports a minute leave. Each send waits at most three seconds and never fails or delays its caller. Secrets, credentials and the DSN are scrubbed line by line, and user ids are hashed. Every report is logged as `error.reported`, with or without a destination.
2. **What is reported.** HTTP 5xx answers, grouped by route; unhandled rejections; uncaught exceptions, which still stop the process; failed Asks; and an Ask key that Ploeg could not block.
3. **Ask failures** ([`src/ask/service.ts`](../../src/ask/service.ts)). Each failed or refused Ask stores one of fifteen failure codes and whether asking again may help. The Work Item page, the VS Code chat and `unfold_ask` all show the same plain message. A used-up allowance is the allowance doing its job, so it is logged but not reported. [Live operation](../operations/live.md#error-reports) lists the codes.
4. **The call itself.** The Ask asks for `reasoning_effort: low` and allows 1,500 output tokens. It waits 60 seconds. A gateway that refuses `reasoning_effort` is asked once more without it.

### Consequences

* Good, because changing trackers means changing a setting, not code; on the homelab the existing Alloy → VictoriaLogs → Grafana path can take reports before any tracker is chosen.
* Good, because each Ask failure has its own message and its own group, keyed by code and model.
* Bad, because Unfold owns two small protocol clients; a change to either format is Unfold's to follow.
* Bad, because a destination outside the EU would receive stack traces and Work Item ids. The URLs decide where reports go, so choose them accordingly.

### Confirmation

[`test/error-reports.test.ts`](../../test/error-reports.test.ts) checks the envelope, the OTLP record, scrubbing, both destinations together, the rate limit and the settings. [`test/ask-service.test.ts`](../../test/ask-service.test.ts) checks that each gateway failure maps to its code, message, report level and fingerprint, and that the key is always finished.

## More Information

* Follows Ploeg ADR-0082 (an Ask is a read-only Run paid from an allowance) and system ADR-0031 (people ask about a Work Item).
* The homelab destination is not set yet. The OTLP route through Alloy needs no new service; a dedicated tracker is a later choice.
* 2026-10-13: accepted by the owner's request and implemented.
