---
status: proposed
date: 2026-10-18
decision-makers: Ryan Grippeling
review-by: 2027-01-18
---

# Agent workspaces reach the forge in the cluster, never through a gateway

## Context and Problem Statement

An agent workspace runs model-directed code. In Kubernetes it reaches only what `workspaceEgress` allows. Repository URLs name the forge's public host, such as `https://forgejo.example.dev/...`, and inside a cluster that host resolves to an ingress gateway. To let the clone container fetch, an operator has to open the gateway to the workspace, and a gateway serves every application behind it: dashboards, the tracker, the registry, the secrets UI. On the owner's homelab that was the case until 2026-10-18 (homelab ADR-0071).

How does a workspace fetch from the forge without a route to everything else the gateway serves?

## Decision Drivers

* A workspace reaches DNS, the model gateway, the forge and Unfold's relay, and nothing else.
* Repository URLs keep their public form: people, Ploeg and the publisher read them, and the delivery checks compare them.
* The clone credential is unchanged: the askpass helper answers for any host.
* No forge-specific code in Unfold.

## Considered Options

* Git URL rewrites (`url.<in-cluster>.insteadOf <public>`) set on the clone and agent containers.
* Rewrite `repository.url` before the clone.
* Keep the gateway open and narrow it with an L7 policy by host name.

## Decision Outcome

Chosen option: git URL rewrites, because git applies them below every command, so the public URL stays everywhere Unfold and people see it, and the workspace's network needs only the forge's Service.

* `kubernetes.gitRewrites` (chart value `workspaceGitRewrites`) lists `{ url, insteadOf }` pairs, both HTTP(S) URL prefixes ending in `/`, without credentials, at most 16.
* Unfold sets them as `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>` and `GIT_CONFIG_VALUE_<n>` on the clone container and the agent container of the pod provisioner, the cold sandbox, and the warm sandbox's relay assignment. Git reads these even with `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1`, which the clone program sets.
* `REPOSITORY_URL` and the repository's `origin` keep the public URL.
* The operator then leaves the gateway out of `workspaceEgress` and allows the forge's pods on their HTTP port.

### Consequences

* Good, because a workspace has no route to applications that happen to share the forge's gateway.
* Good, because nothing outside the workspace changes: Ploeg, the publisher and the delivery verifier never see the in-cluster address.
* Bad, because the in-cluster forge Service usually speaks plain HTTP, so the clone credential crosses the cluster network unencrypted, as Ploeg's own workers' already does. The network policy and the cluster's network are its protection.
* Bad, because agent code can read the environment and learn the forge's in-cluster address. It already could resolve it; it can reach nothing more than the policy allows.

### Confirmation

`test/workspace.test.ts` checks that a rewrite reaches the clone and agent containers, is absent by default, leaves `REPOSITORY_URL` public, and that git follows it with global and system configuration switched off (a real `git ls-remote` against a local repository). `test/runtime-sandbox.test.ts` checks the warm sandbox's assignment, and `test/config.test.ts` the validation. On a cluster, a workspace whose `workspaceEgress` has no gateway rule clones and reaches `forge` pods only.

## Pros and Cons of the Options

### Rewrite `repository.url` before the clone

* Good, because no git configuration.
* Bad, because the in-cluster address becomes the workspace's `origin`, and every place that compares or shows the URL would need to know both forms.

### L7 policy on the gateway by host name

* Bad, because the gateway terminates TLS after the policy decides; a network policy sees an encrypted stream to the gateway, not the host the agent asks for.
* Bad, because it is specific to one network plugin.

## More Information

Homelab ADR-0071 (webgrip/homelab-cluster, `docs/techdocs/docs/adr/adr-0071-agent-egress-reaches-only-what-it-needs.md`) records the cluster side: the workspace egress values and the Ploeg worker policies.
