---
status: proposed
date: 2026-11-04
decision-makers: Ryan Grippeling
review-by: 2027-02-04
---

# Unfold tracks agent standards in a catalogue that Renovate and a weekly survey keep current

## Context and Problem Statement

Unfold's protocol research arrives in dossiers: [the AHP study](../research/2026-09-10-agent-host-protocol.md), [the protocol-gap dossier](../research/2026-10-13-protocol-integration-gaps.md), [the MCP extensions dossier](../research/2026-10-30-mcp-extensions-fit.md) and one per VS Code release. Each dossier is accurate on its date and goes stale within weeks. Between 2026-10-13 and 2026-11-04 alone, the following changed:
- AHP reached 1.0;
- A2A joined the Agentic AI Foundation;
- the AI Card became the AI Catalog;
- IETF chartered agentproto and DAWN;
- Authentik shipped RFC 8693 delegation.

The watchlist holds the triggers, but nobody checks whether a trigger fired. That depends on someone remembering to look.

The owner asked on 2026-11-04 for the whole landscape, five uses per standard for Unfold, and a catalogue that stays current by itself. The owner decided the following:
- the catalogue lives in this repository, next to the research;
- Renovate watches versions;
- a scheduled survey looks for what has no version;
- every change arrives as a pull request;
- building any of these standards stays a separate decision per ADR.

## Decision Drivers

* A trigger on the watchlist should reach a reviewer when it fires, without anyone remembering to look.
* Use the machinery the repository already has: Renovate, Forgejo Actions, generated docs checked by docs-check.
* Only pull requests: reviewable and revertable. No tickets or messages created by a job.
* A version bump of a spec is a question, never an automatic merge.
* The survey costs nothing when no model is configured.

## Considered Options

* A YAML catalogue checked by docs-check, Renovate for versioned sources, and a weekly survey for the rest (chosen)
* Renovate only
* Re-run a research dossier by hand every month
* Keep the landscape in a spreadsheet or a tracker

## Decision Outcome

Chosen option: **the catalogue with Renovate and a weekly survey**. Renovate catches every release and draft revision of a catalogued standard at no cost. The survey catches what has no version or is not catalogued yet, which Renovate cannot see.

* **The catalogue** is [`standards.yaml`](../research/agent-standards/standards.yaml): 160 standards in twelve layers and 30 concepts. Each standard records its steward, status, latest version, relations, five uses for Unfold, a ring with its reason, a flip trigger, the decisions it bears on and the watchlist ids it feeds. [`scripts/agent-standards.py`](../../../../scripts/agent-standards.py) checks it and generates the pages, and docs-check fails on a broken rule or a stale page.
* **Renovate** reads each one-line `watch` entry of kind `github-releases`, `github-tags` or `ietf-draft` through a custom manager. The IETF datatracker is a custom datasource. Renovate opens one pull request per standard, of type `docs`, so it never cuts a release, and never automerges.
* **The survey** runs in [`on_agent_standards.yml`](../../../../.forgejo/workflows/on_agent_standards.yml) every Monday, off until `AGENT_STANDARDS_SURVEY_ENABLED` is set. It reads feeds newer than each entry's review and new IETF drafts, triages them with a model only if one is configured, and opens a pull request only when it found something. It never edits the catalogue itself.
* **The narrative** stays in dossiers. [The 2026-11-04 dossier](../research/2026-11-04-agent-standards-landscape.md) is the first one built on the catalogue.

### Consequences

* Good, because a fired trigger reaches a reviewer within an hour of Renovate's next run, next to the decisions it touches.
* Good, because the survey is free without a model and bounded by its own key with one.
* Bad, because `loose` versioning on arbitrary spec tags can propose a tag that only looks newer; the reviewer closes it and pins `allowedVersions`.
* Bad, because the deterministic survey is noisy for repositories that publish no releases, since their commit feed is all it has; a model key reduces that noise.
* Bad, because the five uses per standard were drafted by research agents and checked against this repository's documents, not each reviewed by a person; they are a starting point that each review sharpens.

### Confirmation

* `mise run docs-check` runs [`agent-standards.test.py`](../../../../scripts/agent-standards.test.py), which proves each rule rejects its fixture and that the committed pages match the catalogue.
* [`workflow-policy.test.cjs`](../../../../scripts/workflow-policy.test.cjs) proves the survey is off by default, holds only `WEBGRIP_CI_TOKEN` and the optional model key, and pushes only its own branch.
* `renovate-config-validator --strict renovate.json` passes.

## Pros and Cons of the Options

### Renovate only

* Good, because it is deterministic and free.
* Bad, because it never finds a standard that is not already listed. Most of this autumn's changes were of that kind: renames, foundation moves and new working groups.

### Re-run a dossier by hand every month

* Good, because a person reads every source.
* Bad, because it is the arrangement that already let triggers fire unnoticed.

### A spreadsheet or tracker

* Good, because it is easy to edit.
* Bad, because nothing can check it against the decisions, and Renovate cannot read it.

## More Information

* Procedure: [Keep the agent-standards catalogue current](../../../../docs/how-to/keep-the-agent-standards-catalogue-current.md).
* [System ADR-0050](../../../../docs/adr/adr-0050-unfold-integrates-through-open-standards-and-registries-and-never-locks-a-customer-in.md): Unfold integrates through open standards. The catalogue is the list it chooses from.
