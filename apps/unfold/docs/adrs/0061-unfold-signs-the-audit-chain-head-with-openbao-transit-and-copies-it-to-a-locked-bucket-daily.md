---
status: proposed
date: 2026-10-30
decision-makers: Ryan Grippeling
review-by: 2027-01-31
---

# Unfold signs the audit chain head with OpenBao Transit and copies it to a locked bucket daily

## Context and Problem Statement

Unfold keeps its OCSF security audit as one hash chain per Tenant in its SQLite database ([audit](../operations/audit-siem.md)). Triggers stop Unfold's own code from rewriting it, but someone who can write the database file can drop the triggers, change records and recompute every hash. Tampering is detectable only against a copy Unfold cannot edit. Until now that copy existed only when a Tenant sent its audit to a SIEM.

On 2026-10-30 the owner chose both remedies offered in VIK-2523: copy the chain head off the box every day, and sign it with OpenBao's Transit engine. Where does the copy go, what is signed, and how does verification use it?

## Decision Drivers

* A rewritten database cannot also rewrite or remove the copy, and cannot produce a signature for a forged one.
* No new runtime dependency ([ADR 0036](0036-the-agent-host-speaks-websocket-through-ws.md) keeps `ws` the only one).
* Secrets come from the environment, never the configuration file, as with `UNFOLD_AUDIT_OTLP_HEADERS`.
* A self-hosted install without OpenBao or a bucket keeps working unchanged.
* System ADR-0050 rule 2: standard interfaces an agency already has.

## Considered Options

* **An S3-compatible bucket with Object Lock, written with Signature Version 4 from Node's crypto**
* An HTTP webhook that receives each checkpoint
* Signing only, with the checkpoints kept in Unfold's database

## Decision Outcome

Chosen option: "**An S3-compatible bucket with Object Lock, written with Signature Version 4 from Node's crypto**", because retention the writer cannot shorten is a property of the store itself, and every object store an agency is likely to have (AWS S3, Cloudflare R2, Hetzner Object Storage, MinIO, Ceph) speaks the S3 API. A webhook would need a receiver someone runs and keeps immutable, which only moves the problem.

* Once a day per Tenant, `AuditCheckpoints` in `src/audit/checkpoints.ts` writes `{tenant, chain_uid, sequence, head_hash, time, signer}`, signs its RFC 8785 serialization through `POST /v1/<mount>/sign/<key>`, and adds `signature` and `key_version`.
* `CheckpointSigner` in `src/audit/signer.ts` is the seam; `OpenBaoTransitSigner` signs in with a token or, preferred, Kubernetes auth with the pod's service account. Unfold's policy may only sign and verify with one key.
* `ObjectStore` in `src/audit/object-store.ts` puts each checkpoint at `<prefix>/<tenant>/<sequence>-<time>.json`, optionally with an Object Lock retain-until date, and lists and reads them back.
* With a signer configured, a failed signature means no checkpoint; an unsigned one is never written in its place. A failed upload is retried hourly from `audit_checkpoints`.
* `GET /api/admin/audit/verify` checks the newest checkpoint in the bucket (every one with `checkpoints=all`): its signature through OpenBao, and its hash at its sequence in the chain. A missing sequence, another hash, a bad signature or a checkpoint older than two days makes `ok` false.
* Either part may be configured alone; with neither, nothing changes.

### Consequences

* Good, because rolling the chain back or rewriting it shows at the next verification, and forging the matching checkpoint needs the OpenBao key.
* Good, because the signing key never leaves OpenBao and can be rotated; old checkpoints keep verifying by their `key_version`.
* Good, because one access key with put, get and list rights is all the bucket gives Unfold.
* Bad, because the guarantee is a day wide: records changed or removed after the newest checkpoint are not covered by it.
* Bad, because verification needs OpenBao reachable; offline, the operator verifies with the key's public half.
* Bad, because Unfold carries its own Signature Version 4 code, checked against the AWS documentation's example and a fake bucket, not yet a live store.

### Confirmation

`test/audit-checkpoints.test.ts` runs against a fake Transit server and a fake S3 bucket that checks every signature. It checks the daily cadence and key rotation, Object Lock headers, a rolled-back and a rewritten chain (`ahead_of_chain`, `hash_mismatch`), an edited checkpoint (`bad_signature`), a sealed OpenBao and an unreachable bucket, Kubernetes sign-in renewal, settings that refuse secrets in the configuration file, and the verify route.

## Pros and Cons of the Options

### An HTTP webhook

* Good, because it fits the URL-and-headers shape of `UNFOLD_AUDIT_OTLP_URL`.
* Bad, because the receiver must store the copy immutably, which is the hard part; verification would need a read API from it too.

### Signing only

* Good, because it needs only OpenBao.
* Bad, because whoever rewrites the database can delete the newest checkpoints along with the records; a signature proves a checkpoint, not that none is missing.

## More Information

* Operations: [Sign the chain head and copy it off the box](../operations/audit-siem.md#sign-the-chain-head-and-copy-it-off-the-box), including the OpenBao policy and bucket rights.
* [OpenBao Transit secrets engine](https://openbao.org/docs/secrets/transit/), [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [Signature Version 4](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html).
* Ticket: VIK-2523.
