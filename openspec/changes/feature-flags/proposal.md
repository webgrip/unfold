# Feature flags, and the Work Item flight profile as the first

## Why

The owner asked on 2026-10-13: "Make a feature flip for this. I want to unlock
the potential of feature flips in this project fully. Research etc. I want to
have work item flight profile as a feature flip. Build it completely." Unfold
had no way to ship a change switched off, to try it with some people first or
to switch it off again without a release.

Application: `apps/unfold`. Ticket: VIK-2042.

## What Changes

- **Application ADR 0043 (proposed)**: flags are flagd rules evaluated in
  process behind OpenFeature's interface, with no new dependency. Rules come
  from the code's registry, the configuration file, a watched flag file (Helm
  `featureFlags`) and administrator overrides.
- Settings › Labs: each person opts in or out of Labs flags. Administrators see
  every flag, force a variant with a reason and read the audit trail.
- `/api/bootstrap` carries evaluated flag values; new routes under
  `/api/flags` and `/api/admin/flags` (see the API contract).
- `npm run check` enforces each flag's lifecycle: owner, kind, a removal date
  for release and experiment flags, no unused or unregistered flags, and every
  flag listed in the operations guide.
- `flag.exposed` product events carry OpenTelemetry's `feature_flag.key` and
  `feature_flag.result.variant`.
- The first flag, `work.flight-profile`, draws a Work Item as a flight in place
  of the four-stage strip at the top of the Work Item page.

## Capabilities

### New Capabilities

- `feature-flags`: how a flag is defined, evaluated, changed and retired.
- `work-item-flight-profile`: the flight profile on the Work Item page.

### Modified Capabilities

None.

## Non-Goals

- Flags in Ploeg. The Go SDK reads the same format when Ploeg needs one.
- A flag service (flagd daemon, Flipt, Unleash). ADR 0043 keeps that move to
  one provider.
- Experiment analysis beyond exposure events.
- Production desired state: turning a flag on for the homelab is a
  `webgrip/homelab-cluster` change.
- The flight profile's vertical phone layout; on a phone the profile scrolls
  sideways inside its frame.
