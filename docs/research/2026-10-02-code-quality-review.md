# Code quality review, 2 October 2026

Status: research record, 2026-10-03. It summarizes an external code quality, security and architecture review of `development @ 2d0496f` dated 2026-10-02, and records which findings still hold on `development @ 8a834e6` and which ticket fixes each one. The review PDF and its evidence bundle (probes, logs, file manifest) are kept outside the repository; ask the owner for them. Commit ids here are after the 2026-10-03 history rewrite; the review itself cites the pre-rewrite id `6394c6d`.

## Verdict

The review rates the domain model (Work Item, Shift, Run, Lease, authorized versus settled spend) and the control-plane concurrency design as strong. It found the weaknesses where outside input enters, at webhooks, sign-in, the editor handoff and the signup form, and in the unfinished move to Ploeg as the only engine ([ADR-0002](../adr/adr-0002-ploeg-is-the-only-engine.md), Vloer ADR-0023). It advises against a framework rewrite, microservices, event sourcing or a message broker.

The reviewed snapshot failed `mise run verify`. On `8a834e6` every gate passes, including the PostgreSQL suites and `runtime-docker.test.ts` that the auditor could not run as root.

## Findings

Evidence labels are the review's own: *reproduced* (a local probe showed it), *source* (the code path establishes it), *deployment* (exposure depends on configuration outside this repository).

| # | Finding | Evidence | Status on `8a834e6` | Ticket |
| --- | --- | --- | --- | --- |
| F01 | Forge webhook records the delivery id before checking the signature | source | Open | VIK-1715, inbox VIK-1727 |
| F02 | Vikunja and ClickUp webhooks accept unsigned events when no secret is set | reproduced | Open | VIK-1716 |
| F03 | Editor sign-in hands the initiator a session without the user approving | reproduced | Open | VIK-1718 |
| F04 | OIDC sign-in is not bound to the browser that started it | reproduced | Open | VIK-1717 |
| F05 | Vendored Three.js 0.186.1 disagrees with the 0.165.0 pin | reproduced | Fixed by `10bb764` | — |
| F06 | Recorded demo replay is stale | reproduced | Fixed by `39e500c` | — |
| F07 | Release jobs do not wait for the warnings gate | source | Deliberate per [CI](../operations/ci.md) and `scripts/workflow-policy.test.cjs`; owner to decide whether to keep it | VIK-1719 |
| F08 | Signup body limit trusts `Content-Length` | reproduced | Open | VIK-1720 |
| F09 | VS Code checkout matches `owner/repo` across forges | reproduced | Open | VIK-1722 |
| F10 | ClickUp `client_secret` sent in the token URL | source | Open | VIK-1721 |
| F11 | Custom WebSocket accepts invalid frames, ignores backpressure | reproduced | Open; owner chose the `ws` library | VIK-1723 |
| F12 | Health probes read every session; event replay has no limit | source | Open | VIK-1724 |
| F13 | ploegd has no read or idle timeout | source | Open | VIK-1725 |
| F14 | Migrations are not serialized across processes | source | Open | VIK-1726 |
| F15 | Review comments to the forge are best-effort | source | Open, deliberate trade-off | VIK-1728 |

## Recommendations

| # | Recommendation | Where it goes |
| --- | --- | --- |
| A01 | Finish the Ploeg-only execution boundary | Vloer ADR-0023's increments |
| A02 | Make worker isolation a deployment contract before hostile code | VIK-1731 (Homelab Roadmap) |
| A03 | Prove the bot token cannot merge or bypass branch protection | VIK-1731 |
| A04 | One admission cap across tracker and workbench work | With A01 |
| A05 | Versioned wire contracts between Ploeg and Vloer | When feature work touches the client |
| A06 | Split large modules by invariant (`engine.ts`, `ploeg.ts`, `card.go`, `extension.ts`) | When feature work touches them |
| A07 | Exact Money type before billing | VIK-1730, phase 2 |
| A08 | Secret scanning, govulncheck, shipped-asset inventory, pinned actions | VIK-1729; action pinning in VIK-1719 |

All tickets sit under the epic VIK-1714 on the Glide board.

## Limitations

The auditor attacked no deployed service, made no paid model calls and inspected no cluster, Forgejo settings or provider permissions. Package scans (`npm audit`, `pnpm audit`, `govulncheck`) were clean for the analyzed dependency graphs; they do not cover vendored browser files or container images. No accessibility, load, fuzz or history-wide secret scan was done.
