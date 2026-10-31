---
type: how-to
audience: [owner, operator, integrator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/ocsf-audit: src/audit/ocsf.ts, chain.ts, capture.ts, export.ts, service.ts and settings.ts, the tap and route in src/http.ts, the MCP hook in src/mcp-http.ts and the account observer in src/store.ts. test/audit.test.ts and test/api-audit.test.ts passed, including validation of every record against the OCSF 1.9.0 extract that scripts/vendor-ocsf.mjs read from schema.ocsf.io on 2026-10-30. The Splunk, Elastic and Amazon Security Lake notes were not tried against those products. The checkpoint section was written with src/audit/checkpoints.ts, signer.ts and object-store.ts; test/audit-checkpoints.test.ts passed against a fake Transit server and a fake S3 bucket, and the Signature Version 4 code against the AWS documentation's example. Not yet tried against a live OpenBao or bucket."
---

# Send Unfold's audit to your SIEM (OCSF)

Unfold records sign-ins, credentials, account and membership changes, administrator actions and data downloads as [OCSF](https://ocsf.io/) 1.9.0 events. It keeps them in its own database in a hash chain per Tenant, and it can send them to any SIEM that reads OCSF over OTLP or NDJSON. Export is off until you turn it on. System ADR-0050 rule 3 ([pull request #697](https://forgejo.webgrip.dev/webgrip/unfold/pulls/697), proposed) is the decision behind it: audit records leave Unfold as OCSF, through the API, never only on a screen or in a CSV.

## What is recorded

Every record has `class_uid`, `activity_id`, `type_uid`, `time` (milliseconds), `severity_id`, `status_id`, `message`, `metadata` (`product` Unfold with its release, `version` 1.9.0, `tenant_uid`, `sequence`, `uid`, `profiles`), `actor`, and `src_endpoint` with the client address when Unfold has one. `unmapped.channel` and `unmapped.confirmation` carry the channel and confirmation of [system ADR-0037](../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md).

| Unfold event | OCSF class | Activity | Notes |
| --- | --- | --- | --- |
| Password or single sign-on sign-in, success or failure | Authentication (3002) | Logon (1) | `user` is the account, or the attempted name; `status_detail` says why it failed (`invalid_credentials`, `rate_limited`, the identity provider's error) |
| Sign-out of a browser or an editor | Authentication (3002) | Logoff (2) | |
| Editor sign-in approved or denied in the browser | Entity Management (3004) | Create (1) | `entity.type` `Editor credential`; a denial is a failed Create |
| Editor credential revoked | Entity Management (3004) | Delete (4) | `entity.uid` is the credential id |
| Agents-window connection token issued or revoked | Entity Management (3004) | Create (1) or Delete (4) | `entity.type` `Agents window token` |
| GitLab or ClickUp account linked with a pasted token, or unlinked | Entity Management (3004) | Create (1) or Delete (4) | `entity.type` `Linked account` |
| Account created or renamed | Account Change (3001) | Create (1), Other (99, `Rename`) | From single sign-on, the bootstrap administrator or `npm run user:add` |
| Account role changed | User Access Management (3005) | Assign Role (3) | `iam_role.name` is the new role, `unmapped.previous_role` the old one |
| Tenant or Client membership added, removed or given another role | Group Management (3006) | Add User (3), Remove User (4), Assign Roles (12) | `group.type` is `Tenant` or `Client` |
| Feature flag override, rollout or segment changed | Entity Management (3004) | Update (3) or Delete (4) | `entity.data` holds the change, the variant and the reason |
| Client Sign-off recorded or withdrawn, exclusions set | Entity Management (3004) | Create (1), Deactivate (11), Update (3) | |
| Candidate, delivery bundle, delivery ledger, flag rules, Agent Trace, audit, billing lines, FOCUS cost export or Tenant export download | Web Resources Activity (6001) | Export (7) | Declares the `host` profile, which gives this class its `actor` |
| Tenant export started | Web Resources Activity (6001) | Export (7) | Recorded in the chain of the Tenant it exports |
| Webhook subscription created, changed, deleted or its secret rotated | Entity Management (3004) | Create (1), Update (3), Delete (4) | `entity.type` `Webhook subscription`; a rotation has `entity.data.change` `secret_rotated`. A test delivery or a resend is API Activity |
| Intake source added, removed or its secret replaced | Entity Management (3004) | Create (1), Delete (4), Update (3) | `entity.type` `Intake source`; a new secret has `entity.data.change` `secret_replaced` |
| Billing mapping set or removed; billing line sent again, marked found, priced or reversed | Entity Management (3004) | Update (3), Delete (4), Deactivate (11) for a reversal | `entity.uid` is the Owner (`tenant` or `tenant/client`) or the line id; `entity.data.change` names the line change |
| Tenant export deleted | Entity Management (3004) | Delete (4) | |
| Request to `unfold-mcp` over HTTP, and each call it delegates | API Activity (6003) | Create (1) | `ai_agent` is the MCP client, `delegation.uid` a hash of the short-lived credential, so a tool call and the API calls it made correlate. Declares the `ai_operation` profile. Refused tokens and accounts are recorded too |
| Every other Action (a state-changing API call) | API Activity (6003) | Create, Update or Delete by method | `api.operation` is the route with ids as `:id`; `api.request.data` holds the inputs with secrets removed, as Action Records keep them |

Unfold cannot tell whether a person or an agent drives an MCP client; it records the client as `ai_agent` because MCP clients are agent harnesses. Ordinary reads are not recorded, except downloads and reads of the audit itself.

The other audit sources stay as they are. The JSON lines on stdout (`login.failed`, `editor.approved`, `mcp.request`, `link.*`) keep going to the log collector, Action Records still feed the action log, `flag_audit` still feeds the Labs page, and session events stay the session's history. The audit trail covers the same changes in OCSF.

Not recorded yet:

* The GitLab and ClickUp OAuth callback. It arrives as a cross-site navigation without the session cookie, so the tap cannot tell who it was; the request that started it is recorded as API Activity.
* The editor's own collection of an approved credential. The approval in the browser is the recorded decision.

## Which Tenant sees a record

Each Tenant has its own chain. A record about a person (sign-in, sign-out, credentials, account, role) goes to every Tenant that person belongs to. A membership record goes to that membership's Tenant only. A record of a webhook subscription or intake source being created, a billing mapping being set or removed, or a Tenant export being started goes to the Tenant the request named, once the request succeeded. Any other record goes to the Tenant of what it targets when Unfold can tell (a task connection, a session's repository), else to the actor's only Tenant, else to the install's `default` Tenant.

## How the audit is kept, and what that guarantees

Records are appended to `audit_records` in `unfold.sqlite` ([Storage](storage.md)). Each record uses the OCSF Record Integrity profile: `attestation_list[0]` has `chain_uid` `unfold-audit:<tenant>`, the previous record's `uid`, `type_uid` and SHA-256 `fingerprint` in `prev_event`, and the record's own `fingerprint`. That fingerprint is the SHA-256, in hex, of the record serialized as RFC 8785 JSON (JCS) with its own `fingerprint` left out. Because each record carries the previous record's fingerprint, changing any record changes every fingerprint after it.

Database triggers refuse to update a record and refuse to delete one that no retention anchor covers. This stops Unfold's own code, and a mistaken query, from rewriting history. It does not stop someone with write access to the database file: they can drop the triggers, change records and recompute every fingerprint. **Tampering is detectable, not prevented**, and only against a copy kept somewhere else: the records your SIEM already holds, a chain head (`X-Unfold-Audit-Head`) you wrote down, or the signed daily checkpoints of the next section. Configure one of them if you need that check.

Records older than the retention are removed once an hour. Before that, an anchor stores the sequence and fingerprint of the last removed record, so the remaining chain still verifies. Anchors are never removed.

| Setting | Default | What it does |
| --- | --- | --- |
| `UNFOLD_AUDIT_RETENTION_DAYS`, else `audit.retentionDays` | 400 | Days a record is kept, 1 to 3650 |
| `UNFOLD_AUDIT_OTLP_URL`, else `audit.otlpUrl` | none | OTLP/HTTP JSON logs endpoint, such as a collector's `/v1/logs` |
| `UNFOLD_AUDIT_OTLP_HEADERS` | none | Headers for that endpoint as `key=value` pairs separated by commas, URL-encoded, as `OTEL_EXPORTER_OTLP_HEADERS` writes them. Keep the value in a secret |

Check a Tenant's chain on **Settings › Administration** with **Check the audit trail**, which says in sentences whether it is intact and, if not, which record broke it and why, or with `GET /api/admin/audit/verify?tenant=<id>`. It answers `{tenant, ok, checked, anchor, head, break, checkpoints}`, where `break` names the first sequence whose link or fingerprint does not match, and `checkpoints` is the check against the signed copies of the next section (`null` when none are configured).

## Sign the chain head and copy it off the box

A SIEM copy is one way to keep a copy Unfold cannot edit. The other is a checkpoint: once a day Unfold signs each Tenant's chain head with an [OpenBao](https://openbao.org/) Transit key and writes it to an S3-compatible bucket whose retention Unfold cannot shorten. Someone who rewrites the database can then neither forge the signature (the key never leaves OpenBao) nor remove the copy (the bucket keeps it). [ADR 0061](../adrs/0061-unfold-signs-the-audit-chain-head-with-openbao-transit-and-copies-it-to-a-locked-bucket-daily.md) records why.

A checkpoint is one JSON object:

```json
{"chain_uid":"unfold-audit:default","head_hash":"<sha-256 hex>","key_version":1,"sequence":42,"signature":"vault:v1:<base64>","signer":{"key":"unfold-audit","kind":"openbao-transit"},"tenant":"default","time":"2026-10-30T09:00:00.000Z","type":"unfold.audit.checkpoint","version":1}
```

The signature covers the RFC 8785 (JCS) serialization of every field except `signature` and `key_version`. The object key is `<prefix>/<tenant>/<12-digit sequence>-<time>.json`, so a listing sorts by sequence. Unfold also keeps each checkpoint in `audit_checkpoints`, whose triggers refuse deletes and every update except marking it stored.

Each part is optional and works alone. With neither, nothing is checkpointed.

| Configured | What happens |
| --- | --- |
| OpenBao and a bucket | Signed checkpoints, copied to the bucket. Verification reads the bucket. |
| OpenBao only | Signed checkpoints kept in Unfold's database. Verification reads those; a rewritten database can drop them, so this only proves the rows it finds. |
| A bucket only | Unsigned checkpoints in the bucket. A rollback of the chain still shows, but nothing proves Unfold wrote the copy. |

The run happens a second after start and then every hour; a Tenant gets a new checkpoint when its newest is a day old. While OpenBao fails, no checkpoint is written (never an unsigned one in its place). While the bucket fails, checkpoints wait in the database and are copied on the next run. Both failures are logged once an hour as `audit.checkpoint_failed`; each checkpoint written is logged as `audit.checkpoint`.

| Setting | Default | What it does |
| --- | --- | --- |
| `UNFOLD_AUDIT_OPENBAO_ADDR`, else `audit.openbao.address` | none | OpenBao's address, such as `https://openbao.openbao.svc:8200` |
| `UNFOLD_AUDIT_OPENBAO_MOUNT`, else `audit.openbao.mount` | `transit` | The Transit secrets engine's mount path |
| `UNFOLD_AUDIT_OPENBAO_KEY`, else `audit.openbao.key` | `unfold-audit` | The Transit key name |
| `UNFOLD_AUDIT_OPENBAO_ROLE`, else `audit.openbao.role` | none | Sign in with the pod's service account token through Kubernetes auth as this role. Preferred over a token |
| `UNFOLD_AUDIT_OPENBAO_AUTH_MOUNT`, else `audit.openbao.authMount` | `kubernetes` | The Kubernetes auth method's mount path |
| `audit.openbao.jwtPath` | `/var/run/secrets/kubernetes.io/serviceaccount/token` | Where the service account token is read, again at every sign-in |
| `UNFOLD_AUDIT_OPENBAO_TOKEN` | none | An OpenBao token instead of a role. Environment only, from a secret; the configuration file is refused |
| `UNFOLD_AUDIT_CHECKPOINT_URL`, else `audit.checkpoints.url` | none | The bucket's URL: path style `https://s3.example.com/<bucket>` or virtual-hosted `https://<bucket>.s3.example.com` |
| `UNFOLD_AUDIT_CHECKPOINT_REGION`, else `audit.checkpoints.region` | `us-east-1` | The region in the signature; `auto` for Cloudflare R2 |
| `UNFOLD_AUDIT_CHECKPOINT_PREFIX`, else `audit.checkpoints.prefix` | `unfold-audit` | The key prefix |
| `UNFOLD_AUDIT_CHECKPOINT_LOCK_DAYS`, else `audit.checkpoints.lockDays` | none | Asks S3 Object Lock to retain each object in compliance mode for this many days. Leave it out when the bucket has a default retention, or when the store does not take Object Lock headers |
| `UNFOLD_AUDIT_CHECKPOINT_ACCESS_KEY_ID`, `UNFOLD_AUDIT_CHECKPOINT_SECRET_ACCESS_KEY` | none | The bucket's access key pair. Environment only, from a secret |

### OpenBao: key, policy and role

Create the key once, as an OpenBao administrator. Ed25519 signatures are small and any library verifies them; ECDSA P-256 works too.

```sh
bao secrets enable transit   # once, if Transit is not mounted yet
bao write -f transit/keys/unfold-audit type=ed25519
```

The policy lets Unfold sign and verify with that key and nothing else. It cannot read, export, rotate or delete the key:

```hcl
path "transit/sign/unfold-audit" {
  capabilities = ["update"]
}
path "transit/verify/unfold-audit" {
  capabilities = ["update"]
}
```

```sh
bao policy write unfold-audit-checkpoints unfold-audit-checkpoints.hcl
bao write auth/kubernetes/role/unfold-audit \
  bound_service_account_names=unfold bound_service_account_namespaces=unfold \
  token_policies=unfold-audit-checkpoints token_ttl=1h
```

Then set `UNFOLD_AUDIT_OPENBAO_ROLE=unfold-audit`. Unfold signs in again before the token's lease ends and once after OpenBao refuses a request. Rotating the key (`bao write -f transit/keys/unfold-audit/rotate`) is safe: each checkpoint records its `key_version` and old versions keep verifying unless you raise `min_decryption_version`.

### The bucket

The copy is only as strong as the bucket's retention. Create the bucket with S3 Object Lock and a default retention in compliance mode at least as long as `UNFOLD_AUDIT_RETENTION_DAYS`, or the store's equivalent (a Cloudflare R2 bucket lock rule, for example). Give Unfold an access key that may `PutObject`, `GetObject` and `ListBucket` under the prefix, and nothing that deletes or changes retention. Keep the bucket on another provider or site than Unfold's database.

### Verify

`GET /api/admin/audit/verify?tenant=<id>` checks the newest checkpoint in the bucket (or, without a bucket, in the database); `&checkpoints=all` checks every one. The chain links every earlier record to the newest checkpoint's, so the newest is enough unless you want to look at each day. For each checkpoint it verifies the signature with OpenBao and looks up its sequence in the chain. `checkpoints` answers `{source, ok, checked, newest, pruned, problems}`, and the top-level `ok` is false when either the chain or its checkpoints fail.

| Problem | Meaning |
| --- | --- |
| `ahead_of_chain` | The checkpoint names a sequence the chain no longer has: records were removed from its end |
| `hash_mismatch` | The record at the checkpoint's sequence has another hash: the chain was rewritten |
| `missing_record` | The sequence lies between the anchor and the head but its record is gone |
| `bad_signature` | OpenBao does not accept the signature: the checkpoint was edited or not signed by this key |
| `unsigned` | A signer is configured but the checkpoint has no signature |
| `signer_unavailable`, `storage_unavailable` | OpenBao or the bucket could not be reached, so nothing was proven |
| `stale` | The newest checkpoint is more than two days old, or a chain older than two days has none |
| `wrong_tenant`, `unreadable` | The object is not a checkpoint of this Tenant |

Checkpoints older than the retention anchor are counted in `pruned` and not compared: their records are gone by design.

Without Unfold, check a downloaded checkpoint with OpenBao (`bao write transit/verify/unfold-audit input=<base64 of the JCS payload> signature=<signature>`), or with the key's public half from `bao read transit/keys/unfold-audit` and any Ed25519 library, then compare `head_hash` with the record of that sequence in your exported NDJSON.

## Turn export on

Export is the `audit.export` flag ([feature flags](feature-flags.md)), off by default and evaluated per Tenant: the context carries `tenantId` and the targeting key `tenant:<id>`. To turn it on for one Tenant:

```json
{ "flags": { "audit.export": { "defaultVariant": "off", "targeting": { "if": [{ "===": [{ "var": "tenantId" }, "default"] }, "on", null] } } } }
```

Recording, retention and verification run whatever the flag says. With the flag on, two ways out exist, and you can use both.

### OTLP logs

Set `UNFOLD_AUDIT_OTLP_URL`. About a second after a new record, and every hour, Unfold sends each enabled Tenant's records it has not sent yet, oldest first, 200 per request. One log record per OCSF event: the event as JSON in `body`, and the attributes `event.name` `unfold.audit`, `ocsf.version`, `ocsf.class_uid`, `ocsf.activity_id`, `ocsf.type_uid`, `unfold.tenant`, `unfold.audit.sequence` and `unfold.audit.hash`. The scope is `unfold.audit` and the service `unfold`. A batch the collector refuses stays stored and is sent again from the last accepted record; a failure is logged once an hour as `audit.export_failed`.

### NDJSON from the API

`GET /api/admin/audit?tenant=<id>&since=<ISO time>&cursor=<sequence>&limit=<1-1000>` answers `application/x-ndjson`, one OCSF event per line, oldest first. Only an administrator who holds the Admin role in that Tenant may read it. `tenant` may be left out when you administer one Tenant. When more records follow, `X-Unfold-Audit-Next-Cursor` and a `Link: <…>; rel="next"` header give the next page. A cron job can poll it with a session cookie or an editor credential and pass the lines on:

```sh
curl -fsS -H "Authorization: Bearer $UNFOLD_EDITOR_TOKEN" \
  "https://unfold.example.com/api/admin/audit?tenant=default&cursor=$LAST" >> unfold-audit.ndjson
```

Each read of the audit is itself recorded.

### Verify an exported copy without Unfold

For each event in sequence order: take `attestation_list[0]`, remove its `fingerprint`, serialize the event as JCS, and compare the SHA-256 in hex with the removed `fingerprint.value`. Then check that the next event's `prev_event.fingerprint.value` equals it. `verifyExported` in `src/audit/export.ts` does exactly this.

## SIEM notes

None of these were tried against the product. Treat them as starting points.

* **Splunk** (unverified). Run an OpenTelemetry Collector with the `otlp` receiver and the `splunk_hec` exporter, and point `UNFOLD_AUDIT_OTLP_URL` at the collector. The OCSF event is the JSON log body, so a source type with JSON field extraction makes its fields searchable. Splunk publishes material on mapping OCSF to its Common Information Model; whether it fits 1.9.0 was not checked. The NDJSON route can also be posted to HEC's raw endpoint.
* **Elastic** (unverified). An OpenTelemetry Collector or the Elastic distribution of it can write OTLP logs to Elasticsearch. Parse the body with a `json` ingest processor to get OCSF fields; Elastic Common Schema field names differ from OCSF, so dashboards need either an ECS mapping in the pipeline or queries on the OCSF names.
* **Amazon Security Lake** (unverified). A custom source takes OCSF records as Parquet objects in the source's S3 location, registered per OCSF event class. Convert the NDJSON pages (or the collector's output) to Parquet, one class per prefix, for example with Amazon Data Firehose record format conversion. Check which OCSF versions Security Lake accepts for custom sources: Unfold writes 1.9.0, and an older version would need its records mapped down.

## Access logging in the style of NEN 7513

NEN 7513 is the Dutch standard for logging access to electronic patient records. Unfold is not a patient record system, but an agency that serves healthcare clients may be asked the same questions. The clauses were not checked against the text of the current edition; this is how Unfold's records answer the usual questions.

| Question | What Unfold records |
| --- | --- |
| Who acted | `actor.user` (account id, name, role) and, for editors and MCP clients, `unmapped.channel`, `ai_agent` and `delegation` |
| What they did | Class, activity, `message`, `api.operation` and the inputs without secrets |
| On whose data | The target in `unmapped.target` or `entity`, and `metadata.tenant_uid`; a Client membership names the Client |
| When | `time`, set by the server |
| From where | `src_endpoint.ip`, the client's address: the socket's peer, or, when that peer is one of the `trustedProxies`, the address `X-Forwarded-For` names ([behind a reverse proxy](live.md#behind-a-reverse-proxy)) |
| Whether it worked | `status_id`, `status_detail` and `api.response.code` |
| Is the log protected | Append-only triggers and a hash chain: changes are detectable against a copy, not prevented. Daily checkpoints signed by OpenBao in a locked bucket are such a copy, when configured |
| Is reading the log logged | Yes, every read of `GET /api/admin/audit` is a record |
| How long it is kept | `UNFOLD_AUDIT_RETENTION_DAYS`, 400 days by default. Set what your agreement with the client requires |

What Unfold does not record: reads of Work Items, sessions and other records in the browser or the API, other than downloads. If a client needs every read logged, that is not built.
