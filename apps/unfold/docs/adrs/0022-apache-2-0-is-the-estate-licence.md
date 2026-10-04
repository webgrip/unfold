# 0022 — Apache-2.0 is a decision here, not an inheritance

Date: 2026-09-11. Status: accepted; the licence, its copyright line and its CI check ship together.

## Context

De Vloer has shipped under Apache-2.0 since its first commit, and until now that was not a
decision anyone made here. The licence file arrived with the initial scaffold (`491c3a6`),
copied from the posture of [Ploeg](https://forgejo.webgrip.dev/webgrip/ploeg), and no ADR in this
repository ever recorded a choice. Two things followed from that.

The copyright line was never filled in. `LICENSE` carried the Apache appendix boilerplate —
`Copyright [yyyy] [name of copyright owner]` — for the life of the repository, so the file named
no owner and no year. Ploeg has the same gap.

And the estate disagreed with itself: `webgrip.nl` and the code in `twente.dev` are MIT, while
De Vloer and Ploeg are Apache-2.0. Nobody had chosen that split either; it accumulated.

A brief move to MIT was made and reverted on the same day. What that exercise settled is that the
objection was never to Apache-2.0 — it was to a licence nobody had decided on. The reasoning
below is therefore adopted rather than invented: it is
[Ploeg's ADR-0003](https://forgejo.webgrip.dev/webgrip/ploeg/src/branch/main/docs/adrs/0003-apache-2-0-license.md),
tested against De Vloer's own audience and found to hold.

## Decision

**Apache-2.0, deliberately, across the estate**, with a filled-in copyright line:
`Copyright 2026 Ryan Grippeling / WebGrip`.

The rule this is chosen against: **give users the most freedom possible, and keep ownership.**
Those two pull in opposite directions only if "most permissive" is read as "shortest licence".

On freedom, MIT is the lighter obligation — keep the notice, nothing else — while Apache-2.0 adds
two: state the files you changed (§4b), and pass on the `NOTICE` file (§4d). But Apache-2.0
*grants* more than MIT does. Its §3 is an express patent licence from every contributor. MIT grants
copyright permissions and is silent on patents, so a user's right to practise a patent the code
reads on is implied at best. The user who redistributes De Vloer is freer under Apache-2.0, because
the thing that could actually stop them — a patent claim from a contributor — is licensed away in
writing. Two lines of attribution paperwork is a smaller cost than that uncertainty.

The licences that *are* more permissive than MIT — 0BSD, Unlicense, CC0 — get there by dropping
attribution, and CC0 by attempting to waive copyright outright. Each fails the second half of the
rule, so none was considered further.

On ownership, Apache-2.0 is the stronger instrument, and nothing about that is incidental:

- **§5 settles inbound contributions.** Anything submitted arrives under this same licence unless
  the contributor says otherwise, so there is no CLA to run and no ambiguity about what was granted.
  MIT says nothing at all about what arrives.
- **§6 reserves trade names and marks**, which is the clause
  [ADR 0020](0020-the-name-and-mark-are-trademarks.md) and [TRADEMARK.md](../brand/TRADEMARK.md)
  rest on. MIT has no equivalent; moving would have made the brand policy carry that alone.
- **§4(d) makes attribution travel.** `NOTICE` is reproduced by every redistributor, so the
  copyright line and the trademark statement follow a fork instead of being quietly dropped.

Neither licence transfers anything: both are non-exclusive grants, and the copyright stays with the
holder named in the file. Ownership is kept by the copyright line, the trademark policy and the
inbound terms — all three of which now exist and are checked.

The remaining drivers, adopted from Ploeg and tested against this repository:

- **The express patent grant.** This is the substantive difference from MIT, and the reason a
  corporate legal review clears Apache-2.0 faster. De Vloer is installed by the same platform
  teams Ploeg targets, and it executes model-driven code changes on their repositories — a
  category where an adopter's counsel is more likely to ask about patents, not less.
- **One answer for two sibling products.** Ploeg and De Vloer are deployed together, documented
  together and now branded together. A licence split between them is a question every adopter has
  to resolve and nobody benefits from.
- **Ecosystem convention.** The Kubernetes-adjacent projects both sit beside — KEDA, kagent,
  agent-sandbox — are Apache-2.0.
- **The trademark carve-out is load-bearing here.** §6 grants no rights in trade names or marks,
  which is the clause [ADR 0020](0020-the-name-and-mark-are-trademarks.md) and
  [TRADEMARK.md](../brand/TRADEMARK.md) rest on. MIT has no equivalent, so moving would have made
  the brand policy carry that alone.

This covers the code, the documentation, the brand assets in [docs/brand/](../brand/README.md),
both published images through their `org.opencontainers.image.licenses` label, and the packaged
VS Code extension through its own bundled licence file.

[`NOTICE`](../../NOTICE) carries the copyright line and the trademark statement, and
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) states the inbound terms in words rather than leaving
them to §5 by default.

[`scripts/license-check.mjs`](../../scripts/license-check.mjs) confirms the whole set in CI: the
licence file is Apache-2.0, its copyright line is filled in rather than boilerplate, `NOTICE`
exists and matches, and every place that declares a licence — both `package.json` files, both
Dockerfiles, the extension's bundled copy — agrees with it. A licence that drifts between the file
and the metadata is the failure this guards against, and it is the failure this repository already
had: the appendix placeholders sat in `LICENSE` for its whole life without anything noticing.

## Consequences

Relicensing is not a live question for this repository. Every commit is authored by the owner,
the estate's CI identity, or an agent acting on the owner's behalf, so a future change stays
possible without a contributor-agreement hunt — but it now needs an ADR that supersedes this one.

Apache-2.0 is a software licence. It applies cleanly to code, documentation and the brand assets
here. It is the wrong instrument for prose or editorial content that is not part of a program,
which is why `twente.dev` licenses `src/content/` separately; adopting Apache-2.0 estate-wide does
not mean dissolving that split.

`webgrip.nl` and `twente.dev` remain MIT until they are changed in their own repositories. This
record states the estate's direction; it does not edit another repository, and each still needs
its own ADR or licence commit.

## Reconsider when

A foundation or commercial arrangement requires a specific licence, an adopter's review turns on a
term Apache-2.0 lacks, or the estate settles on a different single answer.
