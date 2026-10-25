## Context

Remote reviews are GitHub Cloud operations, whereas Unfold's trusted publisher supports Forgejo. Session candidate exports can have synthetic unpublished history. The integration therefore records explicitly scoped external evidence and cannot issue the canonical-candidate receipt described by application ADR 0019.

## Goals / Non-Goals

Deliver the optional adapter, its UI, operation guide and failure-boundary tests. The proposal lists excluded provider capabilities and account operations.

## Decisions

Durable policy is in application ADR 0056. Change-local choices: reuse the encrypted internal store rather than add a migration; keep the latest 20 request summaries with individual evidence accessible by durable request ID; run the trusted CLI outside any checkout with a fresh private home; allow only the documented cloud findings endpoint and reject redirects; preserve the previous security snapshot on every failed import.

## Risks / Trade-offs

The CLI interface is vendor-controlled and requires live qualification for each deployed pin. The Agentic key briefly appears in the local auth process arguments. Request quotas cannot bound a provider-side invoice. Scope validation deliberately fails closed if CLI event fields change. A base branch may move, so only the source commit is immutable. Evidence is supplemental and cannot authorize delivery.

## Migration Plan

Ship switched off through absent configuration. An operator supplies an approved CLI image and separately scoped keys, then qualifies an installed GitHub repository before enabling broader access. Removing the configuration stops new requests while retained evidence remains readable to the session's authorized reader.

## Open Questions

Provider support for immutable candidate review on Forgejo and headless runtime-verification evidence remains unestablished. These require a separate integration design if the vendor adds contracts.
