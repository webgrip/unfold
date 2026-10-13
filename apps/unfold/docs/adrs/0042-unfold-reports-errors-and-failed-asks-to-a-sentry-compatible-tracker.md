---
status: accepted
date: 2026-10-13
decision-makers: Ryan Grippeling
review-by: 2027-01-13
---

# Unfold reports errors and failed Asks to a Sentry-compatible tracker

## Context and Problem Statement

On 2026-10-11 an Ask on the homelab showed "The model returned no answer." Nobody would have known why without reading LiteLLM's spend log by hand. A reasoning model had spent all 400 output tokens thinking. Unfold had no record of that failure beyond the stored Ask, and no other failure reached anyone either: server errors went to a log line, and every model failure became the same "did not answer". On 2026-10-13 the owner asked for failures to be explained to the person who asked and to reach Sentry, so someone can act on them.

How does Unfold report what needs attention, and how does a person learn why an Ask has no answer?

## Decision Drivers

* A person sees why there is no answer and whether another try may help, never a bare "no answer".
* Whoever runs Unfold finds out about failures without reading pod logs, and can group them by cause.
* Nothing secret or personal leaves: Ask keys, configured secrets and user ids stay inside.
* Self-hosted first: any Sentry-compatible tracker works, and Unfold runs exactly as before without one.
* Unfold keeps its small dependency set; its Faro and OTLP exports have no SDK either.

## Considered Options

* Sentry envelopes sent by Unfold itself, to any Sentry-compatible DSN
* The `@sentry/node` SDK
* Only structured log lines, alerted on in Grafana

## Decision Outcome

Chosen option: **Sentry envelopes sent by Unfold itself**, because the envelope format is small and stable, Sentry, GlitchTip and Bugsink all accept it, and it adds no dependency tree to the image.

1. **Reporter** ([`src/error-reports.ts`](../../src/error-reports.ts)). `UNFOLD_SENTRY_DSN` enables it. It sends at most 30 events a minute, waits at most three seconds for each, and never fails or delays its caller. It scrubs secrets, credentials and the DSN from every value and hashes user ids. It logs every report as `error.reported`, with or without a DSN.
2. **What is reported.** HTTP 5xx answers, grouped by route; unhandled rejections; uncaught exceptions, which still stop the process; failed Asks; and an Ask key that Ploeg could not block.
3. **Ask failures** ([`src/ask/service.ts`](../../src/ask/service.ts)). Each failed or refused Ask stores one of fifteen failure codes and whether asking again may help. The Work Item page, the VS Code chat and `unfold_ask` all show the same plain message. A used-up allowance is the allowance doing its job, so it is logged but not reported. [Live operation](../operations/live.md#error-reports) lists the codes.
4. **The call itself.** The Ask asks for `reasoning_effort: low` and allows 1,500 output tokens. It waits 60 seconds. A gateway that refuses `reasoning_effort` is asked once more without it.

### Consequences

* Good, because each Ask failure has its own message and its own group in the tracker, keyed by code and model.
* Good, because a self-hosted Unfold without a tracker still gets every failure as a log line.
* Bad, because Unfold owns a small Sentry protocol client: a change to the envelope format is Unfold's to follow.
* Bad, because a tracker outside the EU would receive stack traces and Work Item ids. The DSN decides where events go, so choose the tracker accordingly.

### Confirmation

[`test/error-reports.test.ts`](../../test/error-reports.test.ts) checks the envelope, scrubbing, rate limit and DSN parsing. [`test/ask-service.test.ts`](../../test/ask-service.test.ts) checks that each gateway failure maps to its code, message, report level and fingerprint, and that the key is always finished.

## More Information

* Follows Ploeg ADR-0082 (an Ask is a read-only Run paid from an allowance) and system ADR-0031 (people ask about a Work Item).
* Where the events go is open: no tracker runs on the homelab yet, so `UNFOLD_SENTRY_DSN` is unset there until one is chosen.
* 2026-10-13: accepted by the owner's request and implemented.
