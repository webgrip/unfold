---
status: accepted
date: 2026-10-30
decision-makers: Ryan Grippeling
---

# Unfold's production runs on a rented EU Talos cluster, and the homelab is staging

## Context and Problem Statement

[ADR-0009](adr-0009-one-tenant-per-agency.md) puts a rented EU cloud cluster in the hosted phase and has the owner's homelab serve Unfold's own development until then. [ADR-0005](adr-0005-unfold-is-offered-to-agencies.md) starts the hosted phase's spending once the self-hosted phase works and there is money to fund it. On 2026-10-03 the owner decided to rent a cluster now, before the hosted phase, for jobs the homelab cannot do: a public install proof, a webhook endpoint that is not on a home connection, nightly checks against GitHub, GitLab and Forgejo, and a watch-only public demo. Those decisions, and the hardware and bootstrap decisions taken on 2026-10-17 and 2026-10-18, exist only in board comments. What is the rented cluster for, what may it cost, what runs on it, and how does it relate to the homelab?

## Decision Drivers

* Unfold must be installable by a stranger from public artifacts and a guide, and the owner's own production must prove it.
* GitHub.com and GitLab.com webhooks need an endpoint that does not depend on a residential uplink.
* Agent Runs execute untrusted code; production must run them in a micro-VM, not only in a container ([ploeg ADR-0106](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0106-a-run-declares-an-isolation-floor-and-a-cell-runs-it-at-the-strictest-class-it-can-honour.md)).
* A fixed monthly cap, because the self-hosted phase earns nothing yet.
* Nothing in production may depend on the homelab to restart, and nothing in the cluster's repository is a secret, not even an encrypted one.

## Considered Options

* Rent one production cluster now, with the homelab as staging
* Keep everything on the homelab until the hosted phase
* Rent the cluster only when the first agency pays for it (ADR-0009 as written)

## Decision Outcome

Chosen option: "Rent one production cluster now, with the homelab as staging", because it is the only option that gives Unfold a public install proof and a webhook endpoint before the first agency, at a cost the owner caps.

* **Jobs.** The cluster runs the owner's own production Unfold, the public install proof, the webhook endpoint for GitHub and GitLab, nightly forge qualification, and a watch-only public demo. The first pilot agency gets its own cluster from the same repository when it signs, paid for by the pilot. Client-facing shared hosting stays in the hosted phase of ADR-0009.
* **Budget.** At most €185 a month excluding VAT for infrastructure (decided at €150 on 2026-10-03, raised on 2026-10-18), and €100 a month for models across production, demo and qualification. Above a cap, the design is cut back.
* **Hardware.** Hetzner, Falkenstein or Nuremberg: three Cloud CPX22 control planes, one Cloud CPX32 worker dedicated to Unfold by label and taint, and one AX41 dedicated server as the bare-metal worker for agent Runs and CI, joined to the Cloud Network over vSwitch with MTU 1400. About €164 a month. The bare-metal worker runs the Kata RuntimeClass, because Hetzner Cloud's shared-CPU VMs do not expose hardware virtualisation; CI and agent Runs are separate pools on it, each under Kata with its own quota. When Hetzner's CX stock returns, the control planes move to CX23 one at a time.
* **Platform.** Talos without Omni. Machine configs come from the same `nodes.yaml` inventory and `talosctl gen config` generator as the homelab. Hetzner resources are OpenTofu. Admin APIs are reachable only over WireGuard or Tailscale. The cluster runs its own OpenBao, LiteLLM and a lean metrics, logs and dashboards stack.
* **GitOps.** Flux in the cluster reconciles from the public repository `webgrip/unfold-cluster`, read anonymously through its GitHub mirror, so reconciliation continues when the homelab is down. Images and charts are on GHCR, signed with cosign.
* **Secrets.** Nothing secret is in the repository, encrypted or not. Three items form the floor: the Talos secrets bundle, the Hetzner API token and the OpenBao static-seal key. The owner holds them with an offline copy; the token and the seal key enter the cluster through Talos inline manifests. OpenBao unseals itself with its static seal after any restart. An external KMS seal replaces it when a paying client's data lands on the cluster.
* **Staging and promotion.** The homelab is staging. Production moves by a manual version-bump pull request in `webgrip/unfold-cluster`.
* **Accepted dependency.** The owner's own production work still reads Vikunja and Forgejo on the homelab, and CI runners on the bare-metal worker reach Forgejo there. During a homelab outage, production keeps serving and reconciling, and intake and CI stop. Clients' trackers and forges are their own.
* **Demo.** A separate, read-only Unfold fed from a separate public Vikunja board, showing real Runs and their real euros, at `unfoldhq.dev`. This is a live view of real work, not [ADR-0015](adr-0015-the-hosted-demo-is-a-recorded-replay-of-the-deterministic-demo.md)'s recorded replay of the deterministic demo; both keep ADR-0015's rule that a demo never pretends: the live demo shows real Runs only, never an invented one.
* **Site.** The marketing site stays on Cloudflare ([ADR-0012](adr-0012-the-marketing-site-releases-and-deploys-on-its-own.md)).
* **Gate.** Staging may run on the cluster now ([unfold-cluster ADR-0017](https://forgejo.webgrip.dev/webgrip/unfold-cluster/src/branch/main/docs/adr/0017-staging-runs-here-with-agents-under-gvisor-on-the-hub.md)). Production (the owner's own production Unfold, the install proof, the webhook endpoint, nightly qualification and the demo) starts only after the P0 items of the remediation epic (VIK-1714) have merged, including [VIK-1732](https://vikunja.webgrip.dev/tasks/1732) (delivery facts come from the forge) and [VIK-1740](https://vikunja.webgrip.dev/tasks/1740) (people see only the sources and repositories they are entitled to).

Staging runs on the cluster; production does not yet.

### Consequences

* Good, because a stranger's install path is exercised by the owner's own production before any agency relies on it.
* Good, because production Runs execute in micro-VMs on hardware that does not depend on the owner's house.
* Good, because a full restart needs no human: OpenBao unseals itself and Flux reads a public mirror.
* Bad, because the spend starts before revenue, against ADR-0005's phasing; the cap bounds it.
* Bad, because the single Unfold node and the single bare-metal worker have no failover inside the cluster.
* Bad, because an emergency commit pushed straight to the GitHub mirror during a homelab outage is overwritten by the next Forgejo push-mirror sync; the cluster repository's runbook must say so.

### Confirmation

* `webgrip/unfold-cluster` exists and `flux get kustomizations -A` on the cluster reports every Kustomization Ready from a `GitRepository` whose URL is the GitHub mirror.
* The monthly Hetzner invoice is at or below €185 excluding VAT.
* A pod with `runtimeClassName: kata` runs on the bare-metal worker and reports a guest kernel that differs from the host's.
* With the homelab's uplink cut for an hour, the production Unfold answers, OpenBao stays unsealed after a node restart, and Flux keeps reconciling.
* `git grep -I -E 'BEGIN (AGE|PGP)|ENC\[' -- .` in `webgrip/unfold-cluster` finds nothing.

## Pros and Cons of the Options

### Keep everything on the homelab until the hosted phase

* Good, because it costs nothing more.
* Bad, because public webhooks, the install proof and the demo would depend on a residential uplink and a single house.

### Rent the cluster only when the first agency pays for it

* Good, because no spend precedes revenue.
* Bad, because the first agency would be the first install from public artifacts, and its pilot would carry every bug that proof would have found.

## More Information

* Board: the cloud cluster epic [VIK-1764](https://vikunja.webgrip.dev/tasks/1764), the provider spike [VIK-1767](https://vikunja.webgrip.dev/tasks/1767), the repository and bootstrap spike [VIK-1768](https://vikunja.webgrip.dev/tasks/1768), the no-Omni spike [VIK-1766](https://vikunja.webgrip.dev/tasks/1766), and this record's ticket [VIK-1765](https://vikunja.webgrip.dev/tasks/1765).
* Ploeg: [ADR-0107](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0107-execution-runs-in-cells-that-pull-from-one-hub.md) makes this cluster the production hub and the homelab a second `isolated` cell.
* 2026-10-03 — The owner decided the jobs, a €150 cap, Talos without Omni, Flux from a public repository, and the homelab as staging.
* 2026-10-17 — The owner waived booting a throwaway node to test gVisor; the first node boot runs that test instead.
* 2026-10-18 — The owner raised the cap to €185 for a bare-metal Kata worker, dedicated the cloud worker to Unfold, put CI on the bare-metal worker under Kata, and chose the static seal, the GitHub mirror and the three-item secrets floor.
* 2026-10-18 — Proposed.
* 2026-10-18 — Accepted by the owner. `webgrip/unfold-cluster` now holds the OpenTofu, Talos inventory and workflow for this cluster.
* 2026-10-30 — The owner split the gate: staging may run on the cluster before VIK-1714's P0 items merge, production may not.
