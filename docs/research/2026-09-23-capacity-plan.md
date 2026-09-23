# Capacity plan for Glide's agent workers

Status: proposal. Measured 2026-09-23 against the live cluster (read-only `kubectl get`, `kubectl top`,
VictoriaMetrics queries). Prices are rough EU second-hand estimates, not quotes. Power is priced at
the owner's heuristic of **1 continuous watt ≈ €3,00 per year** (≈ €0,35/kWh, NL all-in).

## Summary

- **Hardware is not what limits throughput today.** After everything else already running, the three
  worker nodes have room for **7 concurrent writer pods** (or 15 reader pods). Ploeg's configuration
  lets at most **4** run at once (4 ScaledJobs × `maxReplicaCount: 1`). Two of those are
  bronze's, and both bronze ScaledJobs are **paused**, so the real ceiling is 2.
- **The binding limits, in order:** owner review capacity, then the model gateway's daily provider
  caps (Anthropic $5/day, DeepSeek $2/day, Fireworks $5/day), then `maxReplicaCount`. Cluster CPU and
  RAM come after all three.
- **Recommendation: tune, don't buy.** Spend €0,00 now. Buy one used **Ryzen 7 mini-PC with 32 GB**
  (≈ €350,00–450,00, ≈ €45,00/yr power, ≈ 13 extra writer slots) only after a measured trigger fires
  (see §5).
- **Power cost per Run is about €0,001–0,01.** A DeepSeek run costs €0,01–0,05 in model spend, and a
  frontier-model run costs €1,00–3,00. Model spend is 10× to 1000× the electricity.

## 1. Current capacity

### What a worker pod asks for

The chart defaults in `apps/ploeg/ops/helm/ploeg/values.yaml` are **not what runs**. The cluster
HelmRelease overrides them, and ADR-0053 (accepted 2026-08-28) made the agent plane **daemonless**,
so there is no dind sidecar in production any more.

| Pod shape | Where set | CPU | Memory | QoS |
|---|---|---|---|---|
| Writer (live) | `homelab-cluster/kubernetes/apps/ploeg/ploeg/app/helmrelease.yaml` `workerResources` | 1 | 768 Mi | Guaranteed |
| Reader, bronze reviewer (live) | same file, the per-role `workerResources` | 500m | 384 Mi | Guaranteed |
| worker-bin init container | chart `workerBinResources` | 50m | 64 Mi | runs before the worker and does not add to the pod's request |
| Chart-default writer + dind (before ADR-0053) | chart `workerResources` + `dindResources` | 2 | 2,5 Gi | Guaranteed |

"Guaranteed QoS" means requests equal limits on every container. The HelmRelease notes explain why:
Talos's OOM controller kills the *burstable* cgroup tree wholesale under memory pressure, which killed
runs 9 and 10 on 2026-07-25. Worker pods are pinned to `node.webgrip.io/pool: worker`, which covers
fringe-workstation, worker-1 and worker-2. They never land on the soyo control-plane nodes.

### Free room per worker node (allocatable minus current requests)

Live `kubectl describe nodes` on 2026-09-23. No agent pods were running, so these numbers are the
baseline without agent workloads. CI's two warm Forgejo runners are already included.

| Node | CPU alloc | CPU requested | CPU free | Mem alloc | Mem requested | Mem free | Actual use (`kubectl top`) |
|---|---|---|---|---|---|---|---|
| fringe-workstation (i7-4770, 16 GB) | 7,95 | 3,98 (50 %) | **3,97** | 14,9 Gi | 12,9 Gi (87 %) | **1,9 Gi** | 18 % CPU, 70 % mem |
| worker-1 (i5-4670K, 24 GB) | 3,95 | 3,62 (91 %) | **0,33** | 22,9 Gi | 18,8 Gi (82 %) | **4,1 Gi** | 28 % CPU, 64 % mem |
| worker-2 (i7-6700K, 16 GB) | 7,95 | 2,74 (34 %) | **5,21** | 15,1 Gi | 10,2 Gi (67 %) | **4,9 Gi** | 32 % CPU, 62 % mem |
| **Worker pool** | | | **9,5 cores** | | | **10,9 Gi** | |

### Concurrent pods that fit

A pod must fit whole on one node, so count per node and take the smaller of the CPU and memory fits:

| Pod shape | fringe | worker-1 | worker-2 | **Total** |
|---|---|---|---|---|
| Writer 1 CPU / 768 Mi (live) | 2 (memory-bound) | 0 (CPU-bound) | 5 (CPU-bound) | **7** |
| Reader 500m / 384 Mi (live) | 5 | 0 | 10 | **15** |
| Chart-default writer 1 / 1 Gi, no dind | 1 | 0 | 4 | **5** |
| Chart-default writer + dind, 2 / 2,5 Gi | 0 | 0 | 1 | **1** |

Removing dind is what multiplied capacity: the old pod shape fit **1** writer, and the current one
fits **7**.

**Caveat: CI shares the same pool.** The `forgejo-runner` ScaledJob keeps 2 warm runners and scales
to 6. Each runner requests 250m / 3 Gi. The 4 extra runners would want 12 Gi, which is more than the
pool's 10,9 Gi free memory. Every agent pull request triggers CI, so a busy agent day brings a busy
CI day with it. When CI bursts, writer capacity drops toward **2–3**. Memory is the resource agents and
CI compete for.

### What Ploeg actually allows

`kubectl get scaledjobs -n ploeg`:

| ScaledJob | max | state |
|---|---|---|
| ploeg-worker-bronze-builder | 1 | **paused** |
| ploeg-worker-bronze-reviewer | 1 | **paused** |
| ploeg-worker-silver | 1 | active |
| ploeg-worker-copper | 1 | active (exec harness, no model calls) |

The effective ceiling today is 2 concurrent runs, and one of the two slots is a $0 smoke team.

## 2. What limits throughput

The glide bottleneck guide gives the bound: `accepted results/week <= min(ready tickets, candidate
production, review capacity)`. Each input, checked against evidence:

| Candidate limit | Verdict | Evidence |
|---|---|---|
| **Review capacity** (owner) | **Binding first** | Stated owner constraint (`docs/landscape/bottlenecks.md`). A bronze Shift is up to 6 runs (writer, reader, 2 fix rounds), but it still ends in one PR the owner must review. |
| **Model gateway spend caps** | **Binding second** | `litellm-config.configmap.yaml` `provider_budget_config`: Anthropic **$5/day**, DeepSeek **$2/day**, Fireworks **$5/day**. At "a couple of euro per frontier run" (benchmark research doc), Anthropic allows about **2 Sonnet runs per day**. At €0,01–0,05 per DeepSeek run, DeepSeek allows about **40–200 runs per day**. |
| **Ploeg config** (`maxReplicaCount: 1`, bronze paused) | **Binding third** | See §1. The benchmark research doc names this too: "the constraint is wall clock and the single `maxReplicaCount: 1` per team". |
| Model gateway throughput | Not binding, one item to verify | LiteLLM runs as 1 replica with `global_max_parallel_requests: 100`. An agent run has about 1 request in flight at a time. **Verify:** `default_team_params` sets `tpm_limit: 100000` (tokens per minute). If Ploeg's per-run keys inherit a team with that default, 3–4 parallel runs with 30–60k-token contexts would hit it. |
| CPU | Loosely binding on reservations, not on use | Each writer reserves a full core but mostly waits on the model. Nodes use 18–32 % CPU while 50–91 % is *requested*. worker-1 is 91 % requested and 28 % used. |
| RAM | Binds on fringe, and binds when CI bursts | fringe has 1,9 Gi free (87 % requested). CI runners take 3 Gi each. |
| Disk I/O for clones | Not binding | Target repos (erfbeeld, ploeg) are small and clone from in-cluster Forgejo over a 1 Gb LAN. Each pod gets an 8 Gi `ci-shared` emptyDir (`sizeLimit`). Ephemeral storage per node is 228 GB on fringe, 897 GB on worker-1 and 1,8 TB NVMe on worker-2. |

**Throughput arithmetic (illustration; typical run length is not yet measured, 30 min assumed).**
One slot running 30-minute runs does about 48 runs a day. Seven slots can do about 330 runs a day.
The DeepSeek cap funds 40–200 of those, the Anthropic cap about 2, and the owner might review 5–10
PRs a day. Hardware sits about two orders of magnitude above the Anthropic cap.

### Right-sized requests

| Pod | Today | Suggested | Why |
|---|---|---|---|
| Writer | 1 CPU / 768 Mi | **Keep 1 CPU / 768 Mi** | At 500m, the OpenHands Python cold import took 2m20s. At 1 core it takes about 19 s (both measured, HelmRelease notes). The measured peak is 438 Mi, so 768 Mi leaves healthy headroom. Don't shrink further on one sample. |
| Reader | 500m / 384 Mi | **500m / 512 Mi** | 384 Mi is *below* the 438 Mi peak measured for the same OpenHands harness. A reader that peaks like a writer gets OOM-killed. The 500m CPU costs about 2 minutes of cold import per review, which is acceptable for a reader. |
| Namespace guard (new) | none | **ResourceQuota on `ploeg`**, e.g. 6 CPU / 6 Gi | Keeps an agent burst from starving the CI runners that agent PRs depend on. |
| Non-agent tenants | worker-1 91 % CPU requested vs 28 % used | Right-size the largest over-requesters | Freeing about 1 core on worker-1 adds a writer slot at €0,00. |
| Proposal (not built) | fixed 1 CPU | In-place pod resize: start at 1 CPU, then drop requests and limits together to about 250m after the harness warms up | Resize is stable in Kubernetes 1.35+ (cluster is on 1.36). Moving requests and limits together keeps Guaranteed QoS. This roughly triples CPU-bound slots. It needs ploegd to be allowed to resize worker pods, and it needs a design review. |

**Measure before the next decision.** VictoriaMetrics has no per-pod CPU or memory history for worker
pods: a 60-day query came back empty, and the last worker pod ran 41 days ago. Recording these three
series is what turns this plan's assumptions into data:

- scheduling wait per run (pod created to Running)
- per-run peak memory and average CPU
- run duration

## 3. Scaling options

Every node already runs about 0,5 CPU and 2,5–3 Gi of per-node system pods (DaemonSets: Cilium 1 Gi,
Longhorn manager 832 Mi, Alloy 498 Mi, and others). That overhead is subtracted in the slot counts.
"Slots" means live-shape writers at 1 CPU / 768 Mi.

| Option | Upfront (used, EU) | Added power, typical | Power €/yr | Writer slots added | € per slot upfront | Notes |
|---|---|---|---|---|---|---|
| **A. Tuning only** (§2 table) | €0,00 | 0 W | €0,00 | +1 to +2 now. About +10 with the in-place resize proposal. | — | Raise `maxReplicaCount` to 2–3 on the DeepSeek teams. Unpause bronze deliberately. |
| **B. worker-2 +16 GB DDR4** (2 × 8 GB DDR4-2133, 2 free DIMM slots) | €30,00–50,00 | +1–2 W | €3,00–6,00 | 0 writers (worker-2 is CPU-bound). About +5 readers, or +4 CI runners. | — | Cheapest fix for CI and agent memory contention. The cluster's own infrastructure doc already lists it as the top upgrade. |
| C. N100 mini-PC, 16 GB (4C/4T, same family as the soyo nodes) | €120,00–170,00 | ~8–10 W | €24,00–30,00 | +3 | ≈ €50,00 | 16 GB is the platform's practical ceiling, and system pods take about 3 GB of it. |
| D. N305 mini-PC, 32 GB (8C/8T) | €250,00–350,00 | ~10–12 W | €30,00–36,00 | +7 | ≈ €43,00 | Efficient, but 8 threads caps it. |
| **E. Ryzen 7 mini-PC, 32 GB** (7840HS/8845HS, 8C/16T; Minisforum UM780/790, Beelink SER7/SER8) | €350,00–450,00 | ~12–15 W typical (idles about 8–10 W, bursts to 50–65 W) | €36,00–45,00 | **+13** | **≈ €31,00** | Best slots per euro and per watt. Supports 64 GB later. |
| F. Replace worker-1 with E (later) | €350,00–450,00 | **−35 to −45 W** (Haswell box averages 35 W for CPU and RAM alone per Kepler; wall power is higher) | **saves €105,00–135,00** | about +9 net | — | Pays back in about 3–4 years. worker-1 is a Longhorn storage node, so this is a migration project, not a purchase. |

Where to buy: Tweakers V&A and Marktplaats for mini-PCs and DDR4. Kleinanzeigen (DE) has the largest
supply of used Minisforum and Beelink units. Avoid US listings: import VAT and duty wipe out the
discount.

### Recommendation

1. **Now, €0,00:** apply the tuning column.
   - Raise the reader memory to 512 Mi.
   - Add a `ploeg` ResourceQuota.
   - Raise `maxReplicaCount` to 2 on the DeepSeek-model teams when bronze is unpaused.
   - Start recording scheduling wait, per-run resource use and run duration.
   - Verify the LiteLLM TPM inheritance.
2. **If CI runners or agent pods show `Pending` for memory: option B** (€30,00–50,00, about
   €5,00/yr).
3. **Buy a node only on a measured trigger.** Buy when agent pods wait more than 60 s for scheduling
   on more than 10 % of runs over a week, *and* the provider caps have been raised enough to fund
   more than about 6 concurrent runs. The node to buy is **E** (Ryzen 7, 32 GB, ≈ €400,00, ≈ €40,00/yr).
   It more than doubles writer capacity for the lowest cost per slot and per watt. D is the
   fallback if a quieter, lower-peak box matters more than slots.

A fourth N100/N150-class box (C) is the familiar choice because it matches the soyo nodes. It is the
worst value here: it adds 3 slots for about €30,00/yr, while E adds 13 slots for about €40,00/yr.

## 4. Infrastructure cost per Run (power only)

Kepler RAPL, 7-day average, measures CPU package and DRAM only, so wall power is higher. The readings
were fringe 31,7 W, worker-1 35,2 W, worker-2 23,6 W, and 2,7–4,2 W per soyo, about 101 W in total.
At a typical 1,7–2,5× wall multiplier the cluster draws about 170–250 W, or about €510,00–750,00 a
year. That power is spent whether or not agents run.

**Marginal power of one Run** (assumptions: 30 min run, the agent mostly waiting on the model,
average 0,1–0,3 of a core busy, about 3–8 W extra at the wall on these desktop CPUs):

| Case | Energy | Cost at €0,35/kWh |
|---|---|---|
| Typical run (30 min × ~5 W) | ~2,5 Wh | **€0,00** (about 0,1 cent) |
| Worst case (1 full core, ~20 W wall, full 100 min timeout) | ~33 Wh | **€0,01** |
| CI pipeline triggered by the Run's PR (5–10 min, 1–2 busy cores) | ~2–7 Wh | €0,00 (about 0,1–0,2 cent) |

**Side by side with model spend:**

| | Infra power per Run | Model spend per Run | Power as a share |
|---|---|---|---|
| DeepSeek run (bronze, silver fallback) | €0,00–0,01 | €0,01–0,05 (measured, benchmark doc) | ~5–20 % |
| Frontier run (Sonnet 5, silver) | €0,00–0,01 | ~€1,00–3,00 (cap $6/run) | < 1 % |
| Bronze Shift, worst case (6 runs) | ~€0,02 | ≤ $7,20 cap against the $8 pool | < 1 % |

Hardware amortisation outweighs the power. Option E written off over 4 years is about €100,00 a year.
At 10 Runs a day that is about €0,03 per Run, still below one DeepSeek run's model spend. At either
scale, adding execution capacity is cheap next to the model bill and the owner's review time.

## Evidence and method

- Node hardware: `homelab-cluster/docs/techdocs/docs/general/infrastructure.md` (measured
  2026-08-02) and `talos/talconfig.yaml`, `talos/patches/worker/*.yaml`.
- Live capacity: `kubectl describe nodes`, `kubectl get nodes` (allocatable), `kubectl top nodes`,
  `kubectl get scaledjobs -A`, `kubectl -n ploeg get scaledjob ploeg-worker-bronze-builder -o yaml`
  (the pod template, init container and `ci-shared` 8 Gi emptyDir).
- Worker sizing and history: `homelab-cluster/kubernetes/apps/ploeg/ploeg/app/helmrelease.yaml`, and
  chart defaults in `glide/apps/ploeg/ops/helm/ploeg/values.yaml`.
- CI competition: `kubectl -n forgejo get scaledjob forgejo-runner` (250m / 3 Gi request, min 2,
  max 6).
- Gateway limits: `homelab-cluster/kubernetes/apps/ai/litellm/app/litellm-config.configmap.yaml`.
- Power: VictoriaMetrics `avg_over_time(kepler_node_cpu_watts{zone=~"package|dram"}[7d])` by node.
- Model spend per run: `glide/apps/ploeg/docs/research/2026-08-08-benchmarking-the-loop.md` §3.8.
- **Not measured:** run duration, per-run CPU and memory history, and scheduling wait. The Ploeg
  database was not queried (read access to production data was declined), and cAdvisor holds no
  worker-pod series. Numbers that depend on these are labelled as assumptions.
