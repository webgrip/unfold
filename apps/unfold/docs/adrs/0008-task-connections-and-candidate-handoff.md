# 0008 — Shared task connections and portable candidate handoff

Date: 2026-09-09. Status: proposed for team adoption; implemented in the 0.2.0 prototype.

## Context

Operators need to use their existing task system and code host from both the browser and editor. Copying ticket text into each client loses source identity, and harness-specific diff summaries cannot reliably transfer new or binary files. Adding unattended intake directly to Vloer would also duplicate Ploeg's delivery authority.

## Decision

Keep one server-side list/read adapter contract for task providers. Register each connection with an explicit repository mapping and execution owner. The first adapters cover Vikunja, ClickUp, Forgejo, GitHub and GitLab. Both clients use the same normalized task snapshot and explicit import endpoint. Source credentials remain server-only; clients cannot replace repository URLs or runtime policy through task content.

Import refetches a previewed revision and creates a queued operator session. Canonical task identity and revision deduplicate repeated requests in Vloer's single-writer store. Conflicting owners or unresolved earlier execution block competing imports. This lane does not assign tasks, dispatch Ploeg work or claim distributed ownership. Ploeg-owned repositories reject interactive execution, including ad hoc sessions.

Capture a bounded, immutable Git candidate after the crew ends and before supported workspace cleanup. Preserve the original base identity, snapshot trees, full binary patch, a self-contained bundle and manifest. Synthetic snapshot commits make the handoff independent of shallow history or a particular harness. Execute no repository hooks, filters or project checks during capture. A Kubernetes export pod receives the workspace volume read-only after the writer pod's deletion is observed. Its helper is supplied by the control plane and receives no model, Git or Kubernetes authority.

The export manifest explicitly records independent verification and publication as not performed. A human takes the candidate through trusted checks and the forge's normal review process. Unsupported layouts, recognizable secrets, size limits and uncertain interruption produce an explicit unavailable result and retain recoverable workspace state.

## Consequences

The editor remains a thin client, another task provider can use the existing clients, and results travel through standard Git. Local accounts and one SQLite application replica remain the prototype's operating model. Registered source visibility is shared across authenticated users. Source-level team permissions, graphical authorization, rich ticket context, shared Ploeg claims and unattended publication remain separate work.

The task adapters and Kubernetes operations have fixture coverage; live account and target-cluster qualification is still required. The local workspace backend shares the server OS user and is limited to a trusted pilot. A credential-path heuristic does not prove that arbitrary source is free of secrets.

## Reconsider when

Adopt canonical Ploeg WorkOrders before introducing unattended execution or cross-process claims. Add a trusted verifier/publisher and fenced takeover before automatic forge writes. Revisit snapshot storage for large repositories, Git LFS, submodules and retention requirements. Add membership-aware source authorization before serving mutually untrusted teams from one workbench.

Evidence: [HTTP contract](../contracts/api.md), [connection setup](../operations/task-connections.md), [release walkthrough](../operations/iteration-0.2.0.md), [validation](../validation.md).
