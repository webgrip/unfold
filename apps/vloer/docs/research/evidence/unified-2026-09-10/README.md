# Connected execution qualification

Recorded 2026-09-10 against the local implementation changes in both checkouts. De Vloer base revision: `60e8737f0b16ba9bfeff2b8dfaa5de7dbbf92a55`. Ploeg base revision: `67c4bc968455a99ef767bc8a24791ea1a87319cb`. The tested changes are additional working-tree source, not a published release.

The [opt-in Go integration test](https://forgejo.webgrip.dev/webgrip/ploeg) starts real PostgreSQL and Ploeg HTTP handlers and invokes [the De Vloer qualification script](../../../../scripts/qualify-ploeg.ts). The script runs the real workbench HTTP API and its deterministic runtime. This evidence proves the service boundary and execution lifecycle; it does not claim live inference or a deployed Kubernetes cluster.

| Check | Observed result |
| --- | --- |
| Common admission | One Work Item, Shift and operator Run for the workbench session |
| Actual code and checks | Intentionally failing Git fixture, real patch, passing verification, independent passing review |
| Detached client | Stream disconnected; server-owned work completed under the same execution |
| Human/background supervision | Same execution identity and workspace throughout |
| Durable history | Per-execution replay after a revision matched the retained suffix |
| Pause/resume | Confirmed interruption; explicit resume advanced the generation |
| Cancel | Terminal cancellation; no later runtime invocation |
| Application restart | Reopened durable state remained interrupted; no automatic execution |
| Candidate | Ready, with preserved export and review evidence after restart |
| Inference | Zero model calls; zero spend; demonstration mode prominently labelled |

The final capture used Chromium `151.0.7922.34`, a real Ploeg work item `5` and linked session `8751e875-4e58-4c5e-ba2f-da93cf8a3d1d`. These are ephemeral qualification identities. The services and temporary database were cleaned up after the test.

- [Connected session, desktop](completed-session-desktop.png)
- [Connected session, mobile](completed-session-mobile.png)
- [Actual Ploeg work item, desktop](completed-ploeg-desktop.png)
- [Actual Ploeg work item, mobile](completed-ploeg-mobile.png)

The page-wide demo banner describes the deterministic executor. The Ploeg detail is a real upstream database record, not an illustrative dashboard fixture. Successful operator completion is shown as a finished Run with its evidence; it does not claim publication or a no-change outcome.

## Related regression evidence

De Vloer's final suite passed 174 tests. The execution-specific cases include concurrent start, cancellation during admission, local stop before a queued remote request finishes, safe first mint after an early pause, reused capped credentials, blocked-key denial, stale command receipt replay, authority loss before a brief call, fencing between crew roles, and restart without repetition.

Ploeg's Go suites passed, including PostgreSQL concurrency, consumer and acting-user scope, idempotency, generation-aware credential issuance, stale mint cleanup, provisional spending and retained authorization. Expired execution cleanup attempts the full batch and persists fair rotation: the 101st execution is cleaned up even if the first 100 remain unresolved, including across a reconstructed controller.

An isolated archive of the original Ploeg chart was rendered with Helm `4.2.3`. All 13 workers across the three executor cases inherited `LITELLM_MASTER_KEY` (9 KEDA, 1 CronJob, 3 GitLab). The changed chart renders zero such worker references and 13 scoped bootstrap references. Controller credentials and operator consumer references remain absent from worker manifests. This is before/after regression evidence, not a claim of hostile-process confinement inside a shared container.

The full browser flow, Ploeg desktop/mobile flow, 41 extension tests, extension compilation, strict TypeScript, source checks, Go build/vet, Helm lint and all four chart goldens passed. Native VS Code activation, live LiteLLM/Fireworks billing, live Kubernetes placement and high-concurrency throughput were not exercised in this increment.

Reproduction and configuration: [the unified operating guide](../../../operations/unified-baseline.md).
