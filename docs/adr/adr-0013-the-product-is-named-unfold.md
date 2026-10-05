---
status: accepted
date: 2026-10-01
decision-makers: Ryan Grippeling
---

# The product is named Unfold, and Ploeg and Vloer are its parts

## Context and Problem Statement

The product was developed as Glide. That name clashes with Glide, the no-code app builder at glideapps.com, every main domain for it is taken, and it is hard to own in search or as a trademark. A brand was designed around a paper-plane mark, the Vouwvlieger. Several names were tried against it. What is the product called, and how do Ploeg and Vloer relate to that name?

## Decision Drivers

* Customers and reviewers should meet one name.
* The name must work for an English-speaking market and for Dutch agencies.
* Ploeg and Vloer keep their package, module, image and chart identities (repository rule).
* Published history (tags, release notes, research records) must stay true.

## Considered Options

* Unfold
* Keep Glide
* Vouw
* Vlieg

## Decision Outcome

Chosen option: "Unfold", by the owner on 2026-10-01. A Work Item arrives folded; Unfold opens it up until it lies flat as a pull request a person can read and decide on.

* The product is Unfold on every surface a customer or reviewer sees: the site, pull request comments, the app tile, sales material.
* Ploeg (the engine) and Vloer (the workbench) keep their names, marks and identities, and appear only where operators work: operator docs, configuration, Helm charts, logs, the workbench and the editor extension.
* Releases are tagged `unfold-v<version>` and the site `unfold-site-v<version>`. The version continues: `unfold-v` and `unfold-site-v` baseline tags are created on the commits of the last `glide-v` and `glide-site-v` tags before the first release under the new format.
* Names outside this repository change in a coordinated step, not here: the OpenBao signing role, Ploeg's routing targets and the `repo/glide` tracker label, the docs bucket and the `docs.webgrip.dev/glide` path, the Vikunja project and the "Glide — Loop" Grafana dashboard. Until then the code refers to those by their current names.
* Dated records keep the name they were written under: research notes, evidence, changelogs, published tags and archived OpenSpec changes.

### Consequences

* Good, because the product has a name it can own on the market and that the mark explains.
* Good, because version numbers continue without a reset.
* Bad, because Squarespace lists "Unfold" (its social-media app) among its trademarks. A trademark lawyer must check classes 9 and 42 before Unfold is sold.
* Bad, because the plain unfold domains are taken; unfoldhq is free on .dev, .app, .io, .so and .ai (checked 2026-10-01).
* Bad, because for a while the code says Unfold while the repository address and some infrastructure still say glide.

### Confirmation

`mise run verify` and `mise run release-check` pass with the `unfold-v` tag format. A search for `glide` outside dated records finds only the external names listed above.

## More Information

* 2026-10-01: accepted. Supersedes the working name Glide used in ADR-0001 to ADR-0012, whose text now says Unfold.
* 2026-10-03: the Forgejo variables are now `UNFOLD_RELEASES_ENABLED` and `UNFOLD_DOCS_PUBLISH_ENABLED`. The owner renamed them in the repository settings, and releases and docs publication stayed skipped from 2026-10-01 until the workflows read the new names.
* 2026-10-03: the Forgejo repository and its GitHub mirror are `webgrip/unfold`. The release publisher, image source labels and chart metadata name it; rc.34's Vloer distribution hung on a mirror check against the deleted GitHub `webgrip/glide`.
* 2026-10-04: [ADR-0020](adr-0020-unfold-is-the-application-and-the-name-vloer-is-retired.md) retired the name Vloer. The application is Unfold, and this ADR keeps the old name only because it records the earlier decision.
