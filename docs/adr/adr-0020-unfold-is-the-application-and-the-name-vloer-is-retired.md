---
status: accepted
date: 2026-10-04
decision-makers: Ryan Grippeling
---

# Unfold is the application, and the name Vloer is retired

## Context and Problem Statement

Unfold is the product ([ADR-0013](adr-0013-the-product-is-named-unfold.md)). Its front end was still called Vloer: `apps/vloer`, the npm package `@webgrip/de-vloer`, the images `de-vloer` and `de-vloer-agent`, the chart `de-vloer`, the VS Code extension `webgrip.de-vloer`, forty-odd `VLOER_*` environment variables, and a sidebar with "Ploeg", "Workbench" and "Cards" groups. Since Ploeg moved to its own repository ([ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)), the `unfold-v…` release train ships nothing but that front end. A person had to learn a part name that no longer named a separate product, and a contributor had to learn two names for one application.

The 2026-10-04 design review asked the owner which name people see and which name the code uses. The owner answered: Unfold everywhere a person looks, "and even internally". What does the application become, and what keeps the old name?

## Decision Drivers

* One name for one thing: the product, the application and the release train are the same thing to everyone who uses them.
* Ploeg runs the work; Unfold is where people work. The application's name should say which side of that line it is on.
* Existing installs keep their data, sign-in settings and editor settings across the rename.
* Ploeg is released from its own repository and is not changed by an Unfold commit ([ADR-0019](adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md)).
* Records stay true: an accepted decision, a changelog entry or a research note says what was true when it was written.

## Considered Options

* Rename the application to `unfold` everywhere, and keep the old name only where a record or another system still uses it
* Rename only what people see, and keep `de-vloer` as the internal identity
* Pick a new internal name such as `console` or `web`

## Decision Outcome

Chosen option: "Rename the application to `unfold` everywhere", because the release train is already `unfold-v…` and ships only this application, so a second internal name would only describe history.

* The application lives in `apps/unfold`. Its npm package is `@webgrip/unfold`, its images are `unfold` and `unfold-agent`, its chart is `apps/unfold/ops/helm/unfold`, its VS Code extension is `webgrip.unfold`, its environment variables start with `UNFOLD_`, its settings section is `unfold`, and its commit scope is `unfold`.
* Where people look, the application is called Unfold. Its parts are named for what they do (Now, Work, Activity), never for the engine or the old product.
* Existing installs move across once, without a manual step:
  * The server adopts `vloer.sqlite`, with its write-ahead log, as `unfold.sqlite` in the same data directory ([`src/store.ts`](../../apps/unfold/src/store.ts) `adoptRenamedDatabase`).
  * The browser moves its `vloer.*` local storage to `unfold.*` before the first paint ([`public/core/theme.js`](../../apps/unfold/public/core/theme.js)).
  * The extension copies user and workspace `vloer.*` settings to `unfold.*` when they are not set ([`extensions/vscode/src/extension.ts`](../../apps/unfold/extensions/vscode/src/extension.ts) `adoptRenamedSettings`).
* The sign-in cookie, the extension's stored session and the editor's agent-host token are not carried over: each person signs in once more.
* Environment variables are not aliased. A deployment renames `VLOER_*` to `UNFOLD_*` in the same change that switches to the `unfold` image. Production desired state changes only in `webgrip/homelab-cluster`.
* Ploeg named Unfold in three places when this was decided: the consumer field `vloerUrl`, the card skin `vloer-native` and `PLOEG_REPORT_VLOER_URL`. Ploeg removed all three when it stopped naming its consumers (its ADR-0069, release `v0.2.0-rc.3`). Unfold still reads a stored `vloer-native` skin as `unfold-native` ([`src/ploeg.ts`](../../apps/unfold/src/ploeg.ts) `renamedSkins`), because card copies saved before the rename keep it.
* Records use the new name too (amended 2026-10-05). Accepted ADRs, changelogs and research notes use the new name, and links to the deleted `webgrip/de-vloer` repository point at the same commits, tags and files in `webgrip/unfold`. "Vloer" stays only where a reader may need to match it literally:
  * the `vloer-v…` tags, and the release guards that refuse to reuse them;
  * links pinned to a commit whose path still said `vloer`;
  * names that other systems still use: paths in `webgrip/homelab-cluster`, the old Open VSX extension `webgrip.de-vloer` and the artifacts that release-identity research lists;
  * captured evidence and dated research data, which record what a tool printed;
  * the OIDC `subjectNamespace`, which keeps people's identities from the former `vloer` issuer after the hostname move;
  * the adoption code above and its tests, [ADR-0013](adr-0013-the-product-is-named-unfold.md), this ADR, and the retired term in the [glossary](../reference/glossary.md#vloer).
* The planning export in `apps/unfold/backlog` and its generator are deleted. The tracker had replaced it, and records that cite it link to its last commit.
* The repository rule "Keep each application's package, module, image and chart identities" gains one exception: this rename.

### Consequences

* Good, because a person, a contributor and a release note all use one name.
* Good, because data, preferences and editor settings survive the upgrade.
* Bad, because every open branch under `apps/vloer` conflicts with the move and must be rebased onto `apps/unfold`.
* Bad, because the first `unfold` image, chart and extension have no history in their registries: new GHCR packages are private until made public, and the VS Code marketplaces list a new extension next to the old one.
* Bad, because Ploeg's dated records still say Vloer: its ADR-0069 keeps a record's words, and names no consumer anywhere else.
* Bad, because a record's wording now differs from what it said on its date. Git history keeps the original.

### Confirmation

* `git grep -i vloer -- . ':!apps/ploeg'` lists only the names kept above.
* `mise run verify` passes, including the adoption tests in `apps/unfold/test/store.test.ts`.
* The first `unfold-v…` release after this change publishes `unfold`, `unfold-agent`, the `unfold` chart and `webgrip.unfold`.

## More Information

* 2026-10-04 — Decided by the owner in the design review (question Q1, VIK-1831); implementation tracked in VIK-1855, the homelab switch in VIK-1856.
* 2026-10-05 — The owner asked to keep "Vloer" only where it is necessary. Records were rewritten to Unfold and the planning export was deleted (amended Decision Outcome).
* 2026-10-10 — Ploeg no longer sends or expects any of the three wire names, and the OIDC subject namespace keeps the former issuer.
