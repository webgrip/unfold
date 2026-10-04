---
status: proposed
date: 2026-10-04
decision-makers: Ryan Grippeling
---

# Agents are briefed from a per-Tenant knowledge base exchanged as OKF

## Context and Problem Statement

Every Run starts without what earlier Runs learned. It rediscovers how a repository builds, which conventions bind it and where earlier work failed, and spends tokens and rounds doing it. The owner asked on 2026-10-04 for agents to get information from the Open Knowledge Format (OKF v0.1, Google Cloud, June 2026) and Omnigraph. Agencies (ADR-0005) multiply the problem: many client repositories, each with conventions that live in people's heads.

Where does Unfold keep what agents should know, in what format, how does it reach a Run, and how does what a Run learned come back without a model writing unreviewed knowledge?

## Decision Drivers

* A Run gets knowledge without any harness needing a new tool or credential (Ploeg ADR-0011, ADR-0034).
* Every Run records which knowledge it was given, so a reviewer can explain it.
* Nothing a model writes reaches another Run before a person accepts it.
* Tenants never see each other's knowledge (ADR-0009, ADR-0017).
* A Tenant can take all its knowledge away in an open format.
* Durable state stays where Ploeg R6 puts it unless a decision adds a store explicitly.

## Considered Options

* A per-Tenant knowledge base in Omnigraph, exchanged as OKF, selected into a file-based pack per Run
* Repository `knowledge/` directories only
* A live knowledge tool agents call over MCP
* Vector retrieval over the repository at Run time

## Decision Outcome

Chosen option: "A per-Tenant knowledge base in Omnigraph, exchanged as OKF, selected into a file-based pack per Run", because it is the only option that spans repositories, keeps learnings reviewable before use, records provenance and needs nothing from any harness.

* **Format.** OKF is the format at every boundary: a repository's `knowledge/` directory, the pack a Run reads, a Tenant's export and an import of existing documentation. A concept is one markdown file with a `type` in its frontmatter.
* **Sources.** A Run's pack draws on its repository's `knowledge/` directory (in git, owned by the client), its Tenant's knowledge base, OKF concepts inside context bundles (ADR-0022), and later pitfalls derived from Run outcomes.
* **Store.** One Omnigraph graph per Tenant, with one actor per Tenant that reads `main` and writes only learning branches. This is a new durable store beside Postgres and git, accepted here for knowledge only.
* **Delivery.** Ploeg's worker selects the concepts bearing on the Work Item, writes them outside the clone and puts only their index in the prompt, framed as evidence below the delivery contract (Ploeg ADR-0065).
* **Learnings.** A Run may propose up to 10 learnings in its outcome report. Each is a proposal until a person accepts it in Unfold; a learning about one repository may instead become a pull request to its `knowledge/` directory (Ploeg ADR-0066).
* **Not in scope.** The owner's personal `brain` graph is never a source. Runs use a per-Tenant actor, not the homelab `act-glide` actor that can read it.

The design is in the [RFC: agents learn from a knowledge base exchanged as OKF](../research/2026-10-04-rfc-agent-knowledge.md).

### Consequences

* Good, because conventions, decisions and pitfalls are written once and reach every relevant Run on every harness.
* Good, because every Run's knowledge is recorded by digest or graph commit, so a pull request can be explained by what its Run was told.
* Good, because OKF is plain markdown: Tenants can read, edit, version and export their knowledge without Unfold.
* Bad, because Omnigraph becomes a production dependency with its own backups, upgrades and per-Tenant policy, beyond the homelab.
* Bad, because learnings add a review queue. If people ignore it, knowledge stops improving.
* Neutral, because packs are evidence: they can be wrong, and the prompt says the code wins.

### Confirmation

Proposed checks, none implemented beyond the proof of concept:

* Ploeg: `go test ./pkg/okf/ ./pkg/knowledge/ ./pkg/worker/` covers parsing, selection, the empty pack for unrelated work, the pack outside the clone, the prompt framing and the Omnigraph round trip (proof of concept, branch `poc/okf-knowledge-pack`).
* An isolation test: a Run of Tenant A, with Tenant B's graph populated, selects no concept of B and its actor gets 403 on B's graph.
* A review test: a learning proposed by a Run is absent from every pack until it is accepted.
* The measurement spike reports cost, rounds and verdicts with and without packs before packs are enabled by default.

## Pros and Cons of the Options

### Repository `knowledge/` directories only

* Good, because git stays the only store, reviewed like code and owned by the client.
* Bad, because learnings have nowhere to wait for review except a pull request per learning.
* Bad, because knowledge spanning repositories (an agency's conventions, a client's API) has no home.

### A live knowledge tool agents call over MCP

* Good, because an agent can ask for exactly what it needs, when it needs it.
* Bad, because every harness must be configured with the tool, and a credential must be reachable by the agent's process.
* Bad, because what a Run looked up is harder to record than what it was given.

### Vector retrieval over the repository at Run time

* Good, because it needs no authoring.
* Bad, because what matters most was never written in the code: decisions, pitfalls and conventions.

## More Information

* Ploeg decisions: ADR-0065 (the pack) and ADR-0066 (learnings), proposed on Ploeg branch `poc/okf-knowledge-pack`.
* Companion: [ADR-0022](adr-0022-people-give-a-work-item-context-files-at-the-start-and-while-steering.md).
* Evidence: the proof of concept record `docs/research/2026-10-04-okf-knowledge-pack-poc.md` on that Ploeg branch: a 4-concept round trip through Omnigraph with an identical digest, and packs of 5, 1 and 0 concepts for three sample Work Items.
* 2026-10-04 — Proposed after the owner asked for OKF plus Omnigraph for agents.
* 2026-10-04 — Kept proposed until the measurement spike (VIK-1859) reports. Owner answers recorded: hosted Tenants use one Omnigraph graph per Tenant; an accepted learning lands in the Tenant graph, with an optional pull request to the repository's `knowledge/`; Tenant admins accept learnings and clients can read those about their repositories; Unfold's own repositories get a `knowledge/` directory now.
