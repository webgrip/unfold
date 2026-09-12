# 0006 — Verify and publish outside the agent workspace

Date: 2026-09-09. Status: proposed; current writer evidence does not satisfy this decision.

## Context

An agent can change repository files, including tests and build scripts. Its log is useful evidence but cannot establish that protected acceptance policy ran against the complete candidate. A reviewer sharing a mutable writer workspace is not an independent verification executor. Direct Git write credentials also allow a stale worker to publish after its database lease expires.

## Decision

Freeze a complete candidate identified by base SHA, candidate SHA, tree and content-addressed artifact manifest. Include new/deleted files, file modes and binary changes subject to artifact policy. Run independently provisioned verification against that exact candidate using a versioned policy held outside candidate-controlled code. Candidate scripts remain untrusted and execute in a disposable environment without model, management, production or publication credentials.

A separate trusted publisher holds the necessary Git write capability. It validates candidate identity, required checks, current attempt generation and publication authorization, then reserves the operation through the same serialized authority that transfers ownership. A durable publication barrier prevents generation transfer while the external operation is in flight or its result is unknown. Reconcile the remote ref/proposal before closing that barrier; a timeout or expired publisher lease alone cannot prove that an external write stopped. This deliberately favors a visible blocked takeover over an unfounded fencing guarantee. The publisher never executes candidate hooks. Workers receive source-read capability; a compatibility mode that gives workers direct write tokens cannot claim the same fencing guarantee.

Human approval binds to a specific candidate and policy revision. Required forge checks, merge and release authority remain with the existing delivery workflow. Agent review is an additional signal and never silently substitutes for human approval.

After a publisher crash or partition, a negative forge read alone cannot prove that an old request will never complete. Require evidence that the old actor and remote operation ended or are fenced, then reconcile the external state. If the forge adapter cannot establish this, the barrier remains blocked and requires explicit recovery. Do not silently trade the guarantee away by expiring a database lease.

## Consequences and acceptance

Verification and publication become explicit steps with independent failure/reconciliation states. Preserve the last valid candidate when either step is unavailable. Test changed heads after approval, modified candidate tests, untracked/binary files, stale publishers, partial uploads, lost forge responses and revoked claims.

For Vloer itself, the intentional failing demonstration fixture must remain intact. A trusted gate runs the approved product suite, not a blanket discovery command that treats the fixture's intended failure as a product regression.

Reconsider placement when an existing CI platform can supply the same isolated execution, identity, evidence and fencing guarantees. Reusing trusted forge CI is preferable to maintaining a custom verifier solely for implementation symmetry.

See [self-improvement](../design/self-improvement.md), [gap register](../design/gap-register.md) and PV-005 through PV-011 and PV-078 in [the backlog](../../backlog/README.md).
