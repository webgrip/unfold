---
type: reference
audience: [contributor, agent]
owner: glide
last_verified: 2026-09-22
verified_by: "mise run docs-check"
---

# Documentation policy

A page earns its place by answering one reader's question, or by preserving evidence that a decision depends on. These rules keep Glide's documentation small, true and easy to navigate.

## Every page has one type

| Type | Answers | Example |
| --- | --- | --- |
| `landing` | What is this, is it for me, where next? | [Start page](index.md) |
| `tutorial` | Show me it working, safely | [Local demo](workflows/local-demo.md) |
| `how-to` | How do I reach a goal I already have? | [Assign work to an agent](how-to/assign-work-to-an-agent.md) |
| `explanation` | How does it work and why? | [How work flows](concepts/how-work-flows.md) |
| `reference` | What exactly is X? | [Glossary](reference/glossary.md) |
| `adr` | What did we decide and why? | [System decisions](adr/index.md) |
| `record` | What did we observe or research on a date? | [22 September inventory](research/2026-09-22-glide-inventory.md) |

A page that needs two types becomes two pages. Current pages (every type except `adr` and `record`) start with front matter:

```yaml
---
type: how-to
audience: [owner, operator]
owner: glide        # glide, ploeg or vloer
last_verified: 2026-09-22
verified_by: "the command, test or source read that confirmed it"
---
```

## One answer per question

* **The start page and README** open with the problem and the outcome: work items become review-ready pull requests. `llms.txt` repeats that sentence.
* **System explanation** lives only in `docs/concepts/`. An application's `architecture.md` explains its implementation and links up. When you find a second explanation, merge it and replace it with a link.
* **Terms** have one definition. Vloer uses Ploeg's execution terms ([ADR-0002](adr/adr-0002-ploeg-is-the-only-engine.md)). The [combined glossary](reference/glossary.md) is generated from the [product model](domain/model.yaml) and [Ploeg's model](../apps/ploeg/docs/domain/model.yaml). A second meaning is recorded as "not to be confused with", never as a second definition.
* **A current rule** appears in a current page, which links the ADR that explains it. An ADR is never the only place a rule lives.

## Choose the source

| Information | Maintained source | Derived view |
| --- | --- | --- |
| Implemented behavior | Code, executable checks and published contracts | Concept and how-to pages that link the source |
| Wire format | The publishing service's schema and types | Consumer guide and examples |
| Product language and open choices | [Product model](domain/model.yaml) | Generated glossary and rules |
| Ploeg's execution language | [Ploeg model](../apps/ploeg/docs/domain/model.yaml) | Its generated pages and the combined glossary |
| Architectural decision | The ADR ledger of its scope: [system](adr/index.md), [Ploeg](../apps/ploeg/docs/adrs/README.md) or [Vloer](../apps/vloer/docs/adrs/README.md) | The generated [decision register](reference/decisions.md) |
| Research and qualification | A dated record with method, sources and limitations | A short finding linked from a current page |
| Priority | The tracker | None in the repository |

Qualify cross-project rule references as "Product R8" or "Ploeg R18". If a shared wire contract changes, edit the publishing source and verify its consumers.

## Decisions

Use MADR 4.0 in each ledger. A `proposed` ADR is a question, not a decision. Accept, reject or supersede it within 30 days, or record why it is still open. When an ADR changes a rule, update the current page that states the rule in the same change.

## Records and history

Research, evidence, superseded explanations, design baselines, planning exports and OpenSpec changes are records.

* A record keeps its path and content. It is dated, and only a superseded-by link may be added.
* The docs build marks records as "not current guidance" and removes them from search and navigation. Explicit links still reach them.
* Before retiring a record, move any still-true fact into a current page and link the record as evidence.
* Keep records out of agents' default context: `llms.txt` never links them, and `AGENTS.md` links only decisions that bind.

## Writing

* Lead with the answer. One paragraph, one topic.
* Use active voice, second person and present tense.
* Put the condition before the instruction: "To stop a Shift, …".
* Use numbered steps for sequences and bullets for sets. Start task headings with a verb.
* Explain jargon on first use and link the glossary.
* Link source files or symbols, never line numbers: `#L` anchors drift with the next change, and `mise run docs-check` rejects them on current pages.
* Label unimplemented behavior "Not implemented yet". Never describe a plan as current.
* A deterministic demo says so, and never invents model calls or spend.

## Generate and check

| Command | Effect |
| --- | --- |
| `mise run domain` | Regenerates the domain pages of both models and the combined glossary |
| `mise run docs-configuration` | Regenerates Ploeg's [configuration reference](../apps/ploeg/docs/reference/configuration.md) from its Go source and Helm chart |
| `mise exec -- node apps/vloer/scripts/build-landscape.mjs` | Rebuilds the historical landscape explorer |
| `mise run docs-check` | Checks generated pages, links, anchors, orphans, ADR ledgers and the strict TechDocs build |
| `mise run docs-site-check` | Builds the Zensical site in the CI image and scans it |

[Publishing and recovery](operations/docs-publishing.md) explains how `development` reaches the published site. For each current claim, ask what would make it false and which check would notice.
