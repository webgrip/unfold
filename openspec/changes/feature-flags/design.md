# Design — feature-flags

## Context

Unfold has one runtime dependency (ADR 0036), no browser build step and its
desired state in Git. Research on 2026-10-13 compared OpenFeature's Node SDK
with its flagd provider, flag services (Unleash, Flipt, GrowthBook,
Flagsmith, PostHog) and plain configuration booleans. ADR 0043 records the
choice.

## Decisions local to this change

- **One registry file, JSON.** `src/flag-registry.json` is readable by
  `scripts/check.mjs` without running application code, and by Ploeg later.
- **Labs through targeting, not a side channel.** A person's choices enter the
  evaluation context as `labs`/`labsOff`, and the shared `labs-choice`
  evaluator reads them. A deployment composes it with its own rollout using
  `or`, so a rollout never silently overrides a person's opt-out.
- **Overrides in the database.** An override is the operational kill switch.
  It must act in seconds without a Git round trip, so it is stored with an
  audit trail instead of in Git.
- **The flight profile replaces only the stage strip.** The status panel, its
  primary action and every figure stay, so turning the flag off is safe.
- **Session steps over the operator Run.** For a session-driven Work Item,
  Ploeg records one operator Run. The profile draws the session's
  implementer and reviewer steps instead, because those are what the person
  watched.
- **Time ribbon from the value stream.** The ribbon reuses `streamStats`, so
  the figures match the value-stream chart below on the same page.

## Open Questions

- Should Accept open the pull request as soon as the publisher is configured
  on the homelab (ADR 0040)? The landing leg already says "opened by the Unfold
  bot" when it is.
- When the owner accepts ADR 0043: roll `work.flight-profile` out on the
  homelab through `featureFlags`, or keep it in Labs first.
