# CI integration: Unfold shows why CI stopped a Work Item, everywhere, and offers Ploeg's CI actions

## Why

On 1 November 2026 a cancelled CI run parked Work Item 314, and Unfold showed
only "CI did not pass". Ploeg is getting a CI port that knows each job, the
required checks and the cause of a failure (ploeg-hq ADR-0190, proposed). This
change makes Unfold show that cause and its fix on every surface the owner
chose, and offer Ploeg's CI actions. The decision is
[ADR-0054](../../../docs/adr/adr-0054-unfold-shows-why-ci-stopped-a-work-item-on-every-surface-and-offers-ploegs-ci-actions.md),
proposed. No ticket is filed yet; task 1.1 files them.

## What Changes

All of it is proposed; nothing is built.

- **CI panel** on the Work Item page from Ploeg's CI facts: jobs, required
  flag, state, cause class, log excerpt link; advisory jobs apart.
- **Actions** Re-run CI, Ignore for Ploeg and Mark as flaky, each confirmed,
  calling Ploeg's routes; Re-run CI links to the forge where the CI cannot
  re-run.
- **Reason copy** for Ploeg's new close reasons.
- **Notifications** when CI stops a Work Item, and **MCP tools** and the
  **Agents window** with the same reads and actions.
- The tracker card and the pull request comment are Ploeg's write-backs;
  Unfold adds nothing there.

## Capabilities

### New Capabilities

- `ci-integration`: reading a Work Item's CI and acting on it from Unfold.

### Modified Capabilities

- None; the Work Item page, Now, notifications and the MCP server gain parts.

## Impact

- `apps/unfold`: `PloegPort` gains the CI facts read and the three actions; the
  Work Item page; `public/core/reasons.js`; notifications; `mcp.ts`; the
  Agents window. The demo adapter shows a CI fixture and says it is a demo.
- Ploeg (upstream): the CI port, causes, close reasons and routes of ADR-0190.
