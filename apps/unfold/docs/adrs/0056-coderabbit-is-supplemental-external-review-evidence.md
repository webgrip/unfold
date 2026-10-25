---
status: proposed
date: 2026-10-25
review-by: 2026-11-24
---

# CodeRabbit is supplemental external review evidence

## Context and Problem Statement

The owner requested CodeRabbit integration. Its cloud CLI can review an installed GitHub repository, and its security API exports existing findings. Unfold's captured candidate can be an unpublished synthetic commit, and its publisher currently targets Forgejo. A remote review therefore cannot safely stand in for the independent canonical-candidate receipt required by application ADR 0019 or the human acceptance in ADR 0040.

## Decision Drivers

- Preserve Ploeg's execution authority and existing approval protocol.
- Keep client credentials outside agent workspaces.
- Make paid requests explicit, durable and safe across reconnects.
- Distinguish static review and scan provenance from test or runtime evidence.

## Considered Options

- Add opt-in, repository-scoped external review evidence to the workbench.
- Treat CodeRabbit review completion as an independent verification receipt.
- Run the CLI inside the writing agent's workspace with its credential.

## Decision Outcome

Chosen option: "add opt-in, repository-scoped external review evidence to the workbench", because this preserves the distinction between vendor review and trusted delivery. This remains proposed for owner ratification, with the supported scope documented in [CodeRabbit operation](../operations/coderabbit.md). The workbench invokes only the pinned remote-review CLI and the read-only security findings endpoint. It never runs a coding task, starts a security scan, changes a Run's authorization, executes finding instructions, issues a verification receipt or records acceptance from these results.

An operator supplies an immutable source SHA for an explicitly configured GitHub repository and accepts provider billing. Review request IDs are durable and cannot be reused for another scope. Cancellation and restart never authorize retries. The configured request quota is not represented as a monetary cap; unknown review cost remains separate from measured Run spend.

Security findings are imported only after complete pagination and exact repository/organization checks, replacing the prior snapshot only on success. Primary provenance is preserved; cross-repository context is not exposed. Missing provenance and incomplete reviews remain visible as such.

### Consequences

This adds no Ploeg contract change or Node package dependency. Deployments that enable remote reviews must provide a trusted CLI binary and credentials. There is no claim of frozen-candidate equivalence or runtime-verification support. A future local-candidate reviewer or coding provider needs a separate design under Ploeg authority, rather than extending this adapter into an execution engine.

### Confirmation

`apps/unfold/test/coderabbit.test.ts`, `test/api-coderabbit.test.ts` and `test/coderabbit-view.test.mjs` exercise scope checking, credentials, completion, idempotency, quotas, restart, cancellation, HTTP protection and evidence wording. `mise run verify` and `mise run docs-check` are the delivery gates. Live provider qualification remains an operator step.

## More Information

The [OpenSpec change](../../../../openspec/changes/coderabbit-evidence/proposal.md) records the owner's request, implementation scope and acceptance requirements. Revisit this choice if CodeRabbit publishes a supported contract for frozen-candidate review or headless runtime evidence.
