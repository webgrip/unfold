---
status: accepted
date: 2026-10-04
decision-makers: Ryan Grippeling
---

# People give a Work Item context files, at the start and while steering

## Context and Problem Statement

The owner asked on 2026-10-04 to attach "a zip or something with context for the agents to unpack and keep into account", and to add more while steering. Nothing in Unfold accepts files from a person today: Ploeg has no attachment or object storage path, Vikunja attachments are ignored, and Unfold's only upload is card-theme assets. Steering is text only and never reaches a running Run: Unfold folds a message into the next role's prompt, Ploeg records it for audit, and Ploeg's unattended Runs take one prompt at claim.

How does a person give agents files, before and during the work, and when does a file reach a Run?

## Decision Drivers

* One path for files, whichever surface the person uses (Unfold page, session, VS Code, MCP, tracker).
* A Run's inputs are fixed and recorded when it starts, so it can be explained and replayed.
* An archive cannot escape its directory, exhaust a disk or execute.
* Unfold gains no execution features before its engine is retired (ADR-0002).
* Files are evidence for the agent and never override the delivery contract.

## Considered Options

* Context Items on the Work Item, stored and delivered by Ploeg, fixed per Run at claim
* Commit the files to the work branch
* Paste them into the Work Item description
* Deliver them into the running Run's turn

## Decision Outcome

Chosen option: "Context Items on the Work Item, stored and delivered by Ploeg, fixed per Run at claim", because it gives every entry point one path, keeps files out of the pull request and keeps each Run reproducible.

* **What.** A Context Item is a file (zip, tar.gz or any single file) attached to one Work Item, with a digest, size, file count, optional note, who added it, when, and whether a Shift was open (`while_steering`) or not (`before_start`).
* **Who stores it.** Ploeg, the Authority (ADR-0002), validates and stores it. Unfold collects it and forwards it; it keeps no copy and never puts it in its own engine's prompts (Unfold ADR-0039).
* **When it applies.** A Run receives every item attached before its claim. An item attached while a Shift is open reaches the next Run of that Shift, never the running one. Unfold says so where the file is added.
* **How it reaches the agent.** Ploeg's worker verifies each digest, unpacks the item outside the clone under fixed limits and lists it in a "Context from people" prompt section framed as evidence (Ploeg ADR-0067 and ADR-0068).
* **Who.** Agency members and clients may attach context to Work Items they can see; a client only to their own (ADR-0007, ADR-0017).
* **Apply now.** A person may stop the running Run and retry it with the new files, after Unfold shows what the running Run has spent and the person confirms. It is never automatic.
* **Secrets.** A file the secret scan flags is stored but given to no Run until a person removes it or confirms it is safe.
* **Later entry points** reuse the same Ploeg routes: the session composer, the VS Code panel, MCP `add_context` (ADR-0011) and tracker attachments.

The design is in the [RFC: people give a Work Item context files](../research/2026-10-04-rfc-context-bundles-and-steering.md).

### Consequences

* Good, because a person can hand agents a specification, log, export or screenshot without editing a ticket or a repository.
* Good, because steering with a file is explicit about timing: the next Run, recorded with who added what.
* Good, because the Run records the digest of every file it received.
* Bad, because Ploeg now stores binary content (Postgres `bytea` in phase 1), which grows backups and needs retention and deletion rules.
* Bad, because a person who wants the running Run to see a file must stop it and retry, spending what it has used so far.
* Neutral, because sessions run by Unfold's own engine do not see context until they run on Ploeg.

### Confirmation

Proposed checks:

* Ploeg tests for safe unpacking (traversal, links, bombs, duplicates, size and count limits), the operator and Run routes, the claim references, digest verification and the prompt section (proof of concept on Ploeg branch `poc/okf-knowledge-pack`).
* A Shift test: an item added after a Run's claim is absent from that Run's TaskSpec and present in the next Run's.
* An Unfold route test: the Work Item page's upload is forwarded to Ploeg unchanged, the demo refuses it, and Ploeg's refusals reach the person with their reason.
* A tenancy test under ADR-0017: another Tenant's Work Item returns 404 for upload, list and download.

## Pros and Cons of the Options

### Commit the files to the work branch

* Good, because the agent sees them with no new mechanism.
* Bad, because they enter the pull request and the client's history, and cannot hold confidential material.

### Paste them into the Work Item description

* Good, because it exists today.
* Bad, because it carries no binaries, truncates, and is lost on the next tracker edit.

### Deliver them into the running Run's turn

* Good, because it is what "steering" suggests.
* Bad, because only ACP harnesses can accept a follow-up prompt, and only between turns; Ploeg's Runs take one prompt today.
* Bad, because a Run whose inputs change mid-way cannot be replayed. It is kept as a spike.

## More Information

* Ploeg decisions: ADR-0067 (storage, limits and delivery) and ADR-0068 (steering timing), proposed on Ploeg branch `poc/okf-knowledge-pack`. Unfold decision: [ADR-0038](../../apps/unfold/docs/adrs/0039-unfold-collects-context-files-and-hands-them-to-ploeg.md).
* Fits the planned Brief Revisions and Context Items (VIK-1835, VIK-1836, VIK-1847): a context file is the `upload` kind of Context Item; before a Shift it joins the draft revision, during a Shift it is a steering input to that Shift and leaves the authorized revision unchanged. The owner confirmed this reconciliation on 2026-10-04.
* Refines Unfold [ADR-0023](../../apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md)'s choice to steer between Runs, by adding files to what a person can steer with.
* Companion: [ADR-0021](adr-0021-agents-are-briefed-from-a-per-tenant-knowledge-base-exchanged-as-okf.md); OKF concepts inside a context file join knowledge selection.
* 2026-10-04 — Proposed after the owner asked for context files at the start and during steering.
* 2026-10-04 — Accepted by the owner with the proof of concept. Decided the same day: a file attached while a Shift runs is a steering input to that Shift (not a draft Brief Revision); clients may attach context to their own Work Items; Apply now exists with confirmation; a flagged secret holds the file until confirmed; limits stay 20 MiB per upload and 50 MiB per Work Item.
