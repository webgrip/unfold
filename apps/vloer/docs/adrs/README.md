# Architecture decisions

Trunk is `development`. Each accepted decision records its consequences and a trigger for reconsideration. New implementation evidence may supersede a decision; preserve the old record and link its replacement.

| ADR | Decision | Scope and evidence | Status | Last updated |
| --- | --- | --- | --- | --- |
| [0001](0001-the-human-workbench-beside-ploeg.md) | The human workbench beside Ploeg | Accepted for v0.1 | accepted | 2026-09-09 |
| [0002](0002-native-node-and-single-writer-storage.md) | Native Node and one durable writer | Accepted for v0.1 | accepted | 2026-09-09 |
| [0003](0003-runtime-workspace-and-credential-seams.md) | Keep harness, workspace and credential seams distinct | Accepted for v0.1 | accepted | 2026-09-09 |
| [0004](0004-portable-procedures-and-explicit-contracts.md) | Portable operating procedure, explicit local contracts | Accepted for v0.1 | accepted | 2026-09-09 |
| [0005](0005-one-work-authority.md) | One work authority | Proposed for governed delivery | proposed | 2026-09-09 |
| [0006](0006-trusted-verifier-and-publisher.md) | Trusted verifier and publisher | Proposed; bounded independent verifier implemented by [0019](0019-verify-canonical-candidates-outside-agent-workspaces.md) | proposed | 2026-09-09 |
| [0007](0007-thin-editor-client.md) | Thin editor client | Accepted for the v0.1 extension | accepted | 2026-09-09 |
| [0008](0008-task-connections-and-candidate-handoff.md) | Shared task connections and portable candidate handoff | Implemented in 0.2.0; proposed for team adoption | proposed | 2026-09-09 |
| [0009](0009-workspace-placement-is-a-session-choice.md) | Workspace placement is a per-session choice | Accepted for 0.3.0; Docker qualified locally, Kubernetes unqualified on a cluster | accepted | 2026-09-09 |
| [0010](0010-one-release-train-with-zero-cve-images.md) | One release train, hardened images with a zero-finding budget | Accepted; first pipeline release pending estate prerequisites | accepted | 2026-09-10 |
| [0011](0011-sandboxes-dial-out-through-a-relay.md) | Sandboxes dial out through a relay | Accepted; Docker qualified, Kubernetes by fixture | accepted | 2026-09-10 |
| [0012](0012-agent-host-protocol-host.md) | Every session is an Agent Host Protocol host | Accepted for 0.3.0; 1.138 handshake verified, single-minor negotiation recorded as a defect | accepted | 2026-09-17 |
| [0013](0013-sandbox-crd-placement-with-warm-kata-pools.md) | Sandbox CRD placement with warm Kata pools | Accepted as an option; unqualified on the cluster | accepted | 2026-09-10 |
| [0014](0014-signed-candidates.md) | Candidates are signed | Accepted for 0.3.0 | accepted | 2026-09-10 |
| [0015](0015-ploeg-operator-read-api.md) | Ploeg exposes a read-only operator API and De Vloer projects it | Read projection implemented; fleet lossless events and AHP projection remain proposed | proposed | 2026-09-10 |
| [0016](0016-sign-in-and-link-your-own-accounts.md) | People sign in with the estate and link their own accounts | Accepted in part; OIDC sign-in and GitLab link implemented, publication not | accepted | 2026-09-10 |
| [0017](0017-delegate-interactive-execution-to-ploeg.md) | Delegate interactive execution to Ploeg | Opt-in implementation; proposed for architecture ratification | proposed | 2026-09-10 |
| [0018](0018-bind-tracker-imports-to-existing-ploeg-work.md) | Bind tracker selections to canonical Ploeg work | Opt-in implementation; proposed for architecture ratification | proposed | 2026-09-11 |
| [0019](0019-verify-canonical-candidates-outside-agent-workspaces.md) | Verify canonical candidates outside agent workspaces | Bounded Docker verifier and Ploeg approval; proposed for architecture ratification | proposed | 2026-09-11 |
| [0020](0020-the-name-and-mark-are-trademarks.md) | The name and mark are trademarks | Accepted for 0.3.0 with its CI check | accepted | 2026-09-11 |
| [0021](0021-the-extension-ships-through-open-vsx-first.md) | The extension ships through Open VSX first | Accepted for 0.3.0; Open VSX claimed, Marketplace deferred | accepted | 2026-09-11 |
| [0022](0022-apache-2-0-is-the-estate-licence.md) | Apache-2.0 is a decision here, not an inheritance | Accepted; licence, copyright line and CI check ship together | accepted | 2026-09-11 |
