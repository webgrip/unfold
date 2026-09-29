---
status: accepted
date: 2026-09-29
decision-makers: Ryan Grippeling
---

# One tenant per agency, isolated by namespace, network, runtime and credentials

## Context and Problem Statement

Glide runs in one cluster for one owner. Selling it to agencies ([ADR-0005](adr-0005-glide-is-offered-to-agencies.md)) puts several agencies' repositories, credentials, agents and previews on shared nodes. Each Run executes agent-written code driven by untrusted text. What is the isolation boundary, and what must hold before the second agency joins?

## Decision Drivers

* One agency's Run must not read another agency's code, credentials or previews.
* A prompt-injected harness must not leak a credential that outlives its Run ([Ploeg ADR-0034](../../apps/ploeg/docs/adrs/0034-the-harness-gets-placeholders-the-worker-keeps-credentials.md)).
* Security is on by default. An install that works is an install that is isolated.
* Self-hosting stays possible: an agency can run Glide in its own cluster with the same boundary.

## Considered Options

* A tenant is an agency: one namespace set, default-deny network, sandboxed runtime and per-Run credentials
* A tenant is an agency, isolated only in Ploeg's database
* One cluster per agency

## Decision Outcome

Chosen option: "A tenant is an agency: one namespace set, default-deny network, sandboxed runtime and per-Run credentials", because it isolates at the layers an attacker would cross, on shared hardware.

* Each tenant gets its own namespaces for Runs and previews. Ploeg records the tenant on every Team, Work Item, Shift and credential.
* Run and preview pods deny all egress by default. A Run may reach only the model gateway and its own repository, through the worker's proxies.
* Runs and previews use a sandboxed RuntimeClass (gVisor or Kata) where the node supports it.
* Real credentials never enter a tenant's Run pod. The in-worker proxy from Ploeg ADR-0034 is enough for a single tenant without DinD. For tenants, a per-tenant egress gateway outside the pod swaps a per-Run placeholder for the credential, because a sidecar shares the pod's network, NetworkPolicy and, under Kata, its VM. The [credential isolation cluster plan](../../apps/ploeg/docs/research/2026-09-28-credential-isolation-cluster-plan.md) lists what the cluster needs.
* DinD is not offered to tenants: a privileged DinD sidecar reaches the node.
* Each tenant has its own LiteLLM team and budget, so one agency's spend cannot exhaust another's.
* Clients of an agency are users inside that tenant, not tenants.
* Every item above is in place before a second, external agency shares a cluster with another tenant. The first external pilot agency runs on its own dedicated pilot cluster until then.
* Paying agencies run on a rented EU cloud cluster. The homelab cluster serves webgrip and development.
* Each agency chooses EU-only model routing or EU plus US under the Data Privacy Framework. DeepSeek is used only as open weights hosted in the EU, never through its own API, for client data.
* The homelab cluster reconciles from the Forgejo repository; the GitHub mirror of `homelab-cluster` is stale and is not evidence of what runs.

Not implemented yet.

### Consequences

* Good, because each boundary is enforced by Kubernetes or the kernel, not only by application code.
* Good, because the same boundary serves a self-hosted install.
* Bad, because a sandboxed runtime can break harnesses that need privileged features; each harness must be qualified.
* Bad, because per-tenant namespaces add operational objects to reconcile.

### Confirmation

Confirmed when a cross-tenant test Run fails to reach another tenant's namespace, repository and preview, and a harness that dumps its environment finds no real credential, both in CI.

## Pros and Cons of the Options

### Isolation only in the database

* Bad, because a Run pod can reach anything its network and kernel allow, whatever the database says.

### One cluster per agency

* Good, because it is the strongest isolation.
* Bad, because a cluster per customer costs more than a small agency pays. It stays an option for large customers and self-hosters.

## More Information

* 2026-09-28 — The owner asked for secure defaults and multi-tenancy as the base of the agency offering.
* 2026-09-29 — Accepted. The owner set the full isolation set as the gate for the second agency, a rented EU cloud for customers, per-agency model routing, and Forgejo as the cluster's source of truth.
* 2026-09-29 — The owner allowed the first external pilot agency on a separate dedicated cluster before shared tenancy exists.
