---
status: accepted
date: 2026-10-04
decision-makers: Ryan Grippeling
review-by: 2026-11-04
---

# Unfold collects context files and hands them to Ploeg

## Context and Problem Statement

System [ADR-0022](../../../../docs/adr/adr-0022-people-give-a-work-item-context-files-at-the-start-and-while-steering.md) (proposed) lets a person attach context files to a Work Item, at the start and while steering, with Ploeg storing them and delivering them to Runs. Unfold is where people look at a Work Item and steer it. Unfold's only upload today is card-theme assets for administrators (`POST /api/card-assets`), and its steering composer carries text that applies to the next execution.

What does Unfold do with a file a person attaches, and what does it tell them about when the file takes effect?

## Decision Drivers

* the application's engine gains no execution features before it is retired (system ADR-0002, Unfold rule).
* One store and one delivery path: Ploeg's.
* A person sees, where they attach a file, which Run will receive it.
* A demo never pretends to store or deliver something.

## Considered Options

* Forward the file to Ploeg from the Ploeg Work Item page, keep nothing, and say when it applies
* Store files in Unfold and fold them into Unfold's own prompts
* Accept files in the session composer for every session

## Decision Outcome

Chosen option: "Forward the file to Ploeg from the Ploeg Work Item page, keep nothing, and say when it applies", because it adds a front-end feature without an execution feature, and the file reaches exactly the Runs that Ploeg says it does.

* The Ploeg Work Item page gets an **Add context** control: a file input, an optional note, and the list of attached items with size, file count, who and when.
* `POST /api/ploeg/work-items/{id}/context?name=&note=` takes the raw file (20 MiB, the existing upload pattern and mutation guard) and forwards it to Ploeg's `POST /api/v1/operator/work-items/{id}/context` as the signed-in person. `GET /api/ploeg/work-items/{id}/context` lists them from Ploeg. Ploeg's refusals reach the person with their reason.
* While a Shift is open each new item carries an "Added while steering" chip and the hint "Reaches the next Run, not the one running now". Before any Shift the page says every Run on the Work Item gets the files.
* Unfold keeps no copy and never adds context to its own engine's prompts. Sessions run by the application's engine say that context reaches Runs that Ploeg executes.
* In the Ploeg demo the upload is refused with "The demo does not store context files".

### Consequences

* Good, because people can attach files today on the page where they already follow a Work Item.
* Good, because Unfold adds no storage, retention or deletion duty of its own.
* Bad, because a session that Unfold's own engine runs does not see the file, which a person may expect.
* Bad, because uploads pass through Unfold, so Unfold's request size limit and timeout bound them.

### Confirmation

* Route tests with a fake Ploeg: forwarding of body, name, note and acting user; 413 over the limit; the demo refusal; Ploeg's 400, 404, 409 and 413 mapped to the person's message.
* A view test of the context list: the steering chip and the timing hint.
* Review: `apps/unfold/src/engine.ts` and the runtimes do not read Context Items.

## Pros and Cons of the Options

### Store files in Unfold and fold them into Unfold's own prompts

* Good, because sessions run by the application's engine would see the files at once.
* Bad, because it is an execution feature in an engine that is being retired, and a second store with its own retention.

### Accept files in the session composer for every session

* Good, because steering already happens in the composer.
* Bad, because most sessions still run on the application's engine, which would not deliver them. It follows once sessions run on Ploeg.

## Re-evaluation triggers

* System ADR-0022 is accepted, rejected or changed.
* Sessions execute on Ploeg (the application's engine retired), so the composer can attach context too.
* Ploeg's context routes ship in a Ploeg release that Unfold pins.

## More Information

* Design: [RFC: people give a Work Item context files](../../../../docs/research/2026-10-04-rfc-context-bundles-and-steering.md).
* Related: [ADR-0023](0023-vloer-submits-work-to-ploeg-and-never-executes-it.md) chose to steer between Runs; this record adds files to that.

### History

* 2026-10-04: proposed with a proof of concept on branch `feat/agent-knowledge-and-context`.
* 2026-10-04: accepted by the owner. The routes are `POST|GET /api/ploeg/work-items/{id}/context`, under Unfold's other Ploeg routes. Clients may attach to their own Work Items; Apply now (stop and retry with confirmation) is a follow-up.
