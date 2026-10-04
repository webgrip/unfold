# 0014 — Candidates are signed with in-toto provenance and an Agent Trace record

Date: 2026-09-10. Status: accepted for 0.3.0.

## Context

A candidate is the only thing that leaves a session: a Git bundle, a binary patch and a manifest. A reviewer or a CI verifier had no way to know that those bytes came from a De Vloer session, which crew and model produced them, under what budget and in which sandbox, or that they were not altered after capture. The estate signs images with cosign keys held in OpenBao and attests SBOMs and CVE verdicts; nothing signed source changes made by agents. Keyless signing through Fulcio is not used in the estate. Agent Trace, Cursor's record format for mapping code ranges to agent conversations, is on the Thoughtworks Radar and adopted by OpenCode and Cline ([research](../research/2026-09-10-sandbox-landscape.md)).

## Decision

When a candidate is captured, the workbench signs two DSSE envelopes with an Ed25519 key generated on first use and stored beside the database. The first is an in-toto Statement v1 whose subjects are the sha256 digests of the bundle, patch and manifest plus the candidate's git commit and tree, with a predicate that records the session, source task, repository and base, crew roles and models, runs and verdicts, workspace backend and image, spend, and the manifest's `not_performed` verification and publication flags. The second carries an Agent Trace 0.1.0 record as its predicate, mapping every changed file to the session and the model as an AI contributor, with the changed line extent taken from the patch. Both are downloadable next to the candidate; the public key is served by the API; a verifier script checks the digests and signatures offline, and cosign's `verify-blob-attestation` accepts the same envelopes with the PEM key.

Commits inside the sandbox are not signed. Doing so would place a key in the agent's reach, and the forge shows a fresh per-session key as unverified anyway. The candidate envelope binds the head commit, which is the guarantee a reviewer needs.

## Consequences

Provenance travels with the candidate through any channel, and CI can refuse a patch whose attestation does not verify. The key is per workbench; identity binding beyond "this workbench" is the operator account in the predicate, not a certificate. Reconsider when the control plane can reach OpenBao Transit under its own identity, which would let CI countersign the same envelopes through the estate's cosign key, or when a certificate authority in the estate can issue per-session code-signing identities.
