# Architecture decisions

Trunk is `development`. Each accepted decision records its consequences and a trigger for reconsideration. New implementation evidence may supersede a decision; preserve the old record and link its replacement.

| Decision | Status |
| --- | --- |
| [0001 — The human workbench beside Ploeg](0001-the-human-workbench-beside-ploeg.md) | Accepted for v0.1 |
| [0002 — Native Node and one durable writer](0002-native-node-and-single-writer-storage.md) | Accepted for v0.1 |
| [0003 — Keep harness, workspace and credential seams distinct](0003-runtime-workspace-and-credential-seams.md) | Accepted for v0.1 |
| [0004 — Portable operating procedure, explicit local contracts](0004-portable-procedures-and-explicit-contracts.md) | Accepted for v0.1 |
| [0005 — One work authority](0005-one-work-authority.md) | Proposed for governed delivery |
| [0006 — Trusted verifier and publisher](0006-trusted-verifier-and-publisher.md) | Proposed; bounded independent verifier implemented by [0019](0019-verify-canonical-candidates-outside-agent-workspaces.md) |
| [0007 — Thin editor client](0007-thin-editor-client.md) | Accepted for the v0.1 extension |
| [0008 — Shared task connections and portable candidate handoff](0008-task-connections-and-candidate-handoff.md) | Implemented in 0.2.0; proposed for team adoption |
| [0009 — Workspace placement is a per-session choice](0009-workspace-placement-is-a-session-choice.md) | Accepted for 0.3.0; Docker qualified locally, Kubernetes unqualified on a cluster |
| [0010 — One release train, hardened images with a zero-finding budget](0010-one-release-train-with-zero-cve-images.md) | Accepted; first pipeline release pending estate prerequisites |
| [0011 — Sandboxes dial out through a relay](0011-sandboxes-dial-out-through-a-relay.md) | Accepted; Docker qualified, Kubernetes by fixture |
| [0012 — Every session is an Agent Host Protocol host](0012-agent-host-protocol-host.md) | Accepted for 0.3.0; VS Code attachment documented |
| [0013 — Sandbox CRD placement with warm Kata pools](0013-sandbox-crd-placement-with-warm-kata-pools.md) | Accepted as an option; unqualified on the cluster |
| [0014 — Candidates are signed](0014-signed-candidates.md) | Accepted for 0.3.0 |
| [0015 — Ploeg exposes a read-only operator API and De Vloer projects it](0015-ploeg-operator-read-api.md) | Read projection implemented; fleet lossless events and AHP projection remain proposed |
| [0016 — People sign in with the estate and link their own accounts](0016-sign-in-and-link-your-own-accounts.md) | Accepted in part; OIDC sign-in and GitLab link implemented, publication not |
| [0017 — Delegate interactive execution to Ploeg](0017-delegate-interactive-execution-to-ploeg.md) | Opt-in implementation; proposed for architecture ratification |
| [0018 — Bind tracker selections to canonical Ploeg work](0018-bind-tracker-imports-to-existing-ploeg-work.md) | Opt-in implementation; proposed for architecture ratification |
| [0019 — Verify canonical candidates outside agent workspaces](0019-verify-canonical-candidates-outside-agent-workspaces.md) | Bounded Docker verifier and Ploeg approval; proposed for architecture ratification |
| [0020 — The name and mark are trademarks](0020-the-name-and-mark-are-trademarks.md) | Accepted for 0.3.0 with its CI check |
| [0021 — The extension ships through Open VSX first](0021-the-extension-ships-through-open-vsx-first.md) | Accepted for 0.3.0; Open VSX claimed, Marketplace deferred |
| [0022 — Apache-2.0 is a decision here, not an inheritance](0022-apache-2-0-is-the-estate-licence.md) | Accepted; licence, copyright line and CI check ship together |
