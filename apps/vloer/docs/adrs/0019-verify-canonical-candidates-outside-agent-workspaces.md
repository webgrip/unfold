---
status: proposed
date: 2026-09-11
decision-makers: Ryan Grippeling
---

# Verify canonical candidates outside agent workspaces

## Context and Problem Statement

The owner authorized the next unified baseline. A captured candidate contains synthetic snapshot history; pushing that commit would not preserve the real repository ancestry. Worker transcripts and signed capture provenance also do not establish independent verification. [ADR 0006](0006-trusted-verifier-and-publisher.md) describes the intended trust boundary.

## Decision Drivers

- Bind human review and external effects to exactly the commit that was checked.
- Keep verification policy and its credentials outside the agent's control.
- Make crash ambiguity durable in Ploeg before any publication effect.

## Considered Options

- Canonicalize using an operator-provided approved base bundle and execute fixed checks in fresh Docker containers.
- Accept worker check summaries or the captured synthetic commit directly.
- Require a deployed CI verifier before qualifying any local baseline.

## Decision Outcome

Chosen option: "Canonicalize using an operator-provided approved base bundle and execute fixed checks in fresh Docker containers." The initial policy explicitly pins the base commit, image content digest, trusted policy files and black-box checks. De Vloer's control service imports and validates Git objects, reconstructs one deterministic commit on the approved base, and supplies its immutable identity to Ploeg. A separately authorized verifier consumer submits the real container exit and control-side assertion results. Worker-generated logs never determine the number of checks or a passing verdict.

Ploeg owns candidate approval and publication reservation. A stopped execution remains uniquely bound to its Work Item; this increment does not invent a successor-attempt model. Publication effects require their durable operation identity and retain an uncertainty barrier through timeouts. Live publication remains disabled unless an operator configures an explicit adapter and credential.

### Consequences

The first verifier supports bounded black-box checks with fixed expected output. Policies and approved base bundles are provisioned by the operator and must be updated as the repository advances. This makes the qualified scope precise; arbitrary project test discovery, Kubernetes verifier scheduling and automatic policy changes remain future work. A passing check is evidence for its stated assertions, not a proof of general correctness.

### Confirmation

Run [candidate delivery tests](../../test/delivery.test.ts) with real temporary Git repositories; qualify the [Docker verifier](../../scripts/qualify-delivery.ts) against a pinned local image. Test artifact/tree mismatch, protected policy input changes, nonzero exit with fake success output, zero configured checks and stale candidate approval. Ploeg's delivery tests exercise operation replay and ambiguous external effects.

## More Information

- [Candidate delivery contract](../contracts/candidate-delivery.md)
- [Shared execution contract](../contracts/ploeg-execution.md)
- 2026-09-11 — Recorded before implementation; architecture ratification remains with the owner.
