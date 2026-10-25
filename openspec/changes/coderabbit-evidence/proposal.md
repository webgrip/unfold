# CodeRabbit evidence in Unfold

## Why

The owner requested implementation of CodeRabbit integration on 2026-10-25. Unfold has no supported way to request its reviews or retain its security findings alongside a session. Application: `apps/unfold`. Ticket: the interactive user request; no tracker ticket was available to this session.

## What Changes

Add optional, repository-scoped headless GitHub remote reviews and existing security findings imports. Keep durable review requests, audit events, idempotency, request quotas, cancellation and restart fencing. Show evidence and explicit scope and billing limitations in the session UI. Add Helm Secret references and an operator guide. Application ADR 0056 is proposed with this implementation.

## Non-goals

Do not change Ploeg's contracts, execution engine, budgets, verification receipts, approval or publication. Do not execute fixes, start scans or cloud coding tasks, assert runtime verification, install CodeRabbit into an account, buy a plan or deploy desired state. Do not claim an unpublished candidate matches a pushed GitHub commit.

## Capabilities

### New Capabilities

- `coderabbit-evidence`: explicit external review requests and scoped findings inventories.

## Impact

Optional configuration, additive HTTP routes, session UI and Helm values. No dependency version or Ploeg release change. Default installations and the deterministic demo make no CodeRabbit calls.
