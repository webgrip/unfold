# Review walkthrough: what a non-technical reviewer sees and tries

## Why

The owner asked on 2026-10-18: "I want the agents to also make screenshots of
what they've made or something … I want to have something tangible for a
non-technical person when they look at what has been done. I want a clear test
path defined or something for if they need to do that as the hitl."

The owner then chose:

- screenshots only for now, no preview environment per pull request;
- Approve nudges when steps are unticked and never blocks;
- a change with nothing to see shows where its effect does show up, or says
  plainly that nothing visible changed. It never shows a staged screenshot.

Application: `apps/unfold`. Epic VIK-2226; tickets VIK-2230 and VIK-2231. The
Ploeg half is ploeg-hq ADR-0125 (#185), tickets VIK-2228 and VIK-2229, and
lands first.

## What Changes

- **Application ADR 0054 (proposed)**: the Work Item shows its Walkthrough, and
  Approve only nudges when steps are unticked.
- A new domain term, **Walkthrough**, in `docs/domain/model.yaml`.
- The Work Item page gains "What it looks like" and "Try it yourself" under the
  Problem and solution card.
- A route that serves a Walkthrough screenshot from Ploeg to a person who may
  read the Work Item, and routes to read and set a person's ticks.
- The Approve confirmation, in the page and in `unfold_approve_work`, counts
  unticked steps.
- A `ploeg`-scoped commit moves the pin to the Ploeg release with ADR-0125.

## Capabilities

### New Capabilities

- `review-walkthrough`: how a Work Item shows a Walkthrough, records a
  person's ticks and nudges on Approve.

## Non-goals

- A preview environment per pull request (owner, 2026-10-18).
- Taking screenshots in Unfold. The writing Run takes them (Ploeg ADR-0125).
- Posting screenshots to the forge.
- Blocking Approve on ticks.
- A headless browser in the agent images. That is VIK-2232.

## Impact

- `apps/unfold/src`: Ploeg client fields, the tick store, the image route, the
  approve confirmation.
- `apps/unfold/public`: the Work Item page sections and their stories.
- The API contract gains the new routes.
- No new dependency, no paid model call.
