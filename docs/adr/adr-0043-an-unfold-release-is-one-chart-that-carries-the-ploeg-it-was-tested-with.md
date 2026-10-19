---
status: accepted
date: 2026-10-19
decision-makers: Ryan Grippeling
---

# An Unfold release is one chart that carries the Ploeg it was tested with

## Context and Problem Statement

A cluster that runs Unfold pins seven things that belong to one release: the Ploeg chart, the `ploegd` image (daemon and `ploeg-mcp`), the `claude-runner` image, the Unfold chart, the Unfold image and the `unfold-agent` workspace image, and the rule that the Ploeg pins name the release the Unfold pins were tested with. The homelab enforces that rule with a lockstep check and a certified-pair check that reads [apps/unfold/ploeg-release.json](../../apps/unfold/ploeg-release.json) from the Unfold tag, groups all six packages in one Renovate branch, and runs a relay that turns Harbor pushes into Renovate runs.

On 2026-10-19 one Ploeg release took most of a day to reach the homelab. Every way it stalled came from moving the seven pins separately: Renovate paired Ploeg 0.2.0-rc.41 with an Unfold that was tested with rc.40; the Unfold chart reached Harbor while its `unfold-agent` build had failed, so Renovate took the chart and image of rc.99 with the agent of rc.98; and each new Unfold release rewrote the waiting branch. Unfold's release workflow publishes the chart in parallel with the images, so a chart in Harbor does not mean its release is complete.

Unfold already knows the pair: the pin it tested against is in the tag. How does a cluster take one release instead of seven pins?

## Decision Drivers

* A cluster pins one version per Unfold release and nothing it has to keep consistent by hand or by check.
* What Unfold was tested with is recorded by Unfold and nowhere else; no repository writes another repository's deployment.
* A chart in a registry is a complete release, or it is not there.
* Standard Helm and Renovate behaviour, no relay or promotion platform.
* Moving an existing cluster to the new shape keeps Ploeg serving.

## Considered Options

* The Unfold chart depends on the Ploeg chart it was tested with, and the chart is published last
* The Unfold chart names the Ploeg version and image digests in its values, and Ploeg stays its own release
* Keep separate pins and promote them as one bundle with Kargo

## Decision Outcome

Chosen option: "The Unfold chart depends on the Ploeg chart it was tested with, and the chart is published last", because it turns the certified pair into one artifact with Helm's own dependency mechanism, and every consumer then tracks one version with whatever tool it already uses.

* `apps/unfold/ops/helm/unfold/Chart.yaml` lists `ploeg` from `oci://ghcr.io/ploeg-hq/charts` at the release [apps/unfold/ploeg-release.json](../../apps/unfold/ploeg-release.json) pins. [scripts/consume-ploeg-release.sh](../../scripts/consume-ploeg-release.sh) moves the dependency and `Chart.lock` together with the two pins of [ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md), so Ploeg's release stays the one writer ([ADR-0041](adr-0041-a-ploeg-release-opens-unfolds-pin-pull-request-by-running-unfolds-recipe.md)). The packaged Unfold chart vendors that Ploeg chart.
* The Ploeg chart deploys everything a Ploeg release runs, `ploeg-mcp` and `claude-runner` included, and both Ploeg's and Unfold's charts default every image to their own release by digest. A cluster sets configuration, never an image.
* Unfold's release workflow packages and pushes the chart only after every image of the release is pushed, and writes their digests into the chart's default values. A failed image build leaves no chart for that release.
* A cluster deploys Ploeg and Unfold as one Helm release of the Unfold chart, with Ploeg's values under `ploeg:`. Its Renovate follows that one chart.
* An existing cluster moves by adoption: the new release takes over Ploeg's resources under their current names, so Ploeg gets a rolling update and no gap. Unfold keeps the short restart every Unfold upgrade has, because it runs one SQLite writer ([apps/unfold ADR-0002](../../apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md)).
* High availability is not part of this decision. Ploeg replicas and a disruption budget, and an Unfold that can run more than one replica, are separate work.

This amends [ADR-0039](adr-0039-unfold-depends-on-a-released-ploeg-through-its-contract-bundle-and-go-module.md) and [ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md) on one point: Unfold now publishes the Ploeg chart inside its own, unchanged. Ploeg keeps its own chart, images and release train, and a cluster that runs Ploeg without Unfold still installs the Ploeg chart directly.

### Consequences

* Good, because a cluster cannot run a Ploeg and Unfold that were not tested together, without a check that enforces it.
* Good, because a half-published release never reaches a registry, so no consumer sees one.
* Good, because the homelab's lockstep and certified-pair checks, its six-package Renovate group and its Harbor release relay can be removed.
* Good, because the production cluster of [ADR-0040](adr-0040-unfold-production-runs-on-a-rented-eu-talos-cluster-and-the-homelab-is-staging.md) takes the same single version as the homelab.
* Bad, because Ploeg and Unfold upgrade together in one Helm release, so a Ploeg-only fix reaches a cluster only through an Unfold release, which every Ploeg release already causes.
* Bad, because the Ploeg chart must grow templates for `ploeg-mcp` and `claude-runner`, which the homelab runs as its own manifests today.
* Bad, because adopting the existing resources needs one step a person runs once against each existing cluster: removing the old Helm release's storage Secret after the new release owns its resources.

### Confirmation

These checks are built with the change:

* A chart test in Unfold fails when the `ploeg` dependency in `Chart.yaml` or `Chart.lock` names another release than [apps/unfold/ploeg-release.json](../../apps/unfold/ploeg-release.json).
* [scripts/workflow-policy.test.cjs](../../scripts/workflow-policy.test.cjs) fails when the chart job of the release workflow does not need every image job.
* The release refuses a packaged chart that renders an Unfold image without a digest. Ploeg's chart requires a database Secret and a LiteLLM URL, which have no sensible default, so the packaged chart renders with no values only when `ploeg.enabled` is `false`.

## Pros and Cons of the Options

### The Unfold chart depends on the Ploeg chart it was tested with, and the chart is published last

* Good, because a Helm dependency is the standard way one chart carries another, and Renovate and Flux follow one chart without special rules.
* Good, because the version a cluster pins and the pair Unfold tested are the same thing.
* Bad, because the two applications share one Helm release and upgrade together.

### The Unfold chart names the Ploeg version and image digests in its values, and Ploeg stays its own release

* Good, because Ploeg and Unfold keep separate Helm releases.
* Bad, because a cluster still needs something to copy those values into Ploeg's release, which is the coupling this decision removes.

### Keep separate pins and promote them as one bundle with Kargo

* Good, because Kargo is built to promote several artifacts together.
* Bad, because its documented integration is Argo CD, while these clusters run Flux, and its pull-request step lists Gitea but not Forgejo.
* Bad, because it adds a promotion platform for one pair of applications.

## More Information

* 2026-10-19 — The owner chose one chart with Ploeg as a subchart, no image pins in a cluster, the Renovate pull request with the homelab's e2e checks as the gate, adoption without downtime for existing clusters, and high availability as separate work.
* Implementation runs in four phases: the Ploeg chart deploys `ploeg-mcp` and `claude-runner` and defaults images by digest; the Unfold chart gains the dependency and the release workflow publishes it last; the homelab moves to one Helm release; the homelab's pair checks, Renovate group and release relay are removed.
