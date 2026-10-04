# 0005 — One work authority across unattended and interactive delivery

Date: 2026-09-09. Status: proposed for the governed delivery milestones.

## Context

Ploeg already dispatches work and stores delivery state in PostgreSQL. Vloer stores interactive sessions in SQLite and currently reads only queue depths from Ploeg. Adding independent ticket intake to Vloer would allow two owners to act on the same task. A human clicking Start cannot be a substitute for a distributed claim.

## Decision

Ploeg owns immutable WorkOrders and fenced DeliveryAttempts. Tracker state remains authoritative for priority and accepted task revisions; the forge remains authoritative for code review and merge. Vloer owns sessions and human decisions that reference the same work and attempt. Add an authenticated, object-authorized operator protocol rather than exposing existing worker endpoints to an editor.

An interactive takeover requires the current generation, confirmed worker stop, retained candidate state, resolved publication barriers and an explicitly admitted replacement attempt. A stale owner is fenced at the trusted publication boundary. A database lease by itself cannot revoke an already-issued direct Git write token; the governed lane therefore uses the publisher specified in ADR 0006. An external write with an unknown result blocks ownership transfer until reconciled.

Keep Vloer's single-instance SQLite implementation during the initial pilot. Do not query Ploeg tables directly or create a second canonical work queue. Introduce contracts, migrations and compatibility mode explicitly; existing ad hoc Vloer sessions remain recognizable until canonical registration is implemented.

## Consequences and acceptance

This adds an API contract and failure modes at a real service boundary. Acceptance requires duplicate-delivery, stale-claim, lost-response, material-ticket-update and takeover tests across both services. Migrate only after the Ploeg authentication, secret-isolation, routing and crash-accounting prerequisites in the backlog pass.

Reconsider ownership only if measured deployment constraints make Ploeg unsuitable as the authority. A replacement must migrate all claim and work-order ownership together; adding another queue is not an incremental migration strategy.

See [system design](../design/00-product-system-design.md), [ticket contract](../design/ticket-integration.md) and [platform design](../design/platform-and-governance.md).
