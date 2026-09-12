---
status: proposed
date: 2026-09-10
decision-makers: Ryan Grippeling
---

# Delegate interactive execution to Ploeg

## Context and Problem Statement

The owner requested a unified product with De Vloer as the human surface and Ploeg handling backend execution. Both applications already had useful runtimes, workspaces and evidence; combining displays alone would leave two independent execution authorities.

## Decision Drivers

- Preserve the existing workbench and OpenCode integration.
- Admit paid work once and retain stop intent through partial failures.
- Keep human interaction independent from a browser connection.
- Establish an incremental boundary that can be qualified with both real services.

## Considered Options

- Delegate interactive execution under Ploeg admission and versioned commands.
- Keep independent execution engines behind a common display.
- Replace both applications with an external platform.

## Decision Outcome

Chosen option: "Delegate interactive execution under Ploeg admission and versioned commands." The implementation is opt-in through `execution.team`. Ploeg admits one Work Item, Shift and operator Run; De Vloer executes its crew under that authority and retains the human session and native workspace. The [contract](../contracts/ploeg-execution.md) distinguishes this implemented binding from the broader proposed WorkOrder and trusted-publication design.

Consumer identity, team scope, human ownership, command identity, serialized revision and executor generation guard the boundary. Ploeg holds management authority and unresolved accounting. Confirmed pauses may retain the same capped key; uncertain issuance and blocked keys cannot silently authorize replacements. Cooperative turn fencing does not claim to intercept every inference request or fence arbitrary forge writes.

### Consequences

The browser and editor gain a coherent view of both work paths. Human and background supervision preserve the same execution. The workbench remains a single replica and a trusted delegated executor. General agent messaging, tracker identity unification and independent publication still need implementation.

### Confirmation

Run the [ordinary and cross-service qualification commands](../operations/unified-baseline.md#reproduce-qualification). Verify real PostgreSQL admission, idempotent command replay, actor scope, start/cancel races, credential ambiguity, confirmed pause, cancellation, restart and retained evidence. Keep live provider and cluster results separately recorded in [validation](../validation.md).

## More Information

- [Research and alternatives](../research/2026-09-10-unified-workbench-baseline.md)
- [One work authority](0005-one-work-authority.md)
- [Operator read projection](0015-ploeg-operator-read-api.md)
- 2026-09-10 — Recorded during the owner's authorized implementation. Proposed status denotes outstanding architecture ratification, not an absence of source implementation; qualification is reported separately.
