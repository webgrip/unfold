---
type: how-to
audience: [owner, operator, integrator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/ocsf-audit: src/audit/ocsf.ts, chain.ts, capture.ts, export.ts, service.ts and settings.ts, the tap and route in src/http.ts, the MCP hook in src/mcp-http.ts and the account observer in src/store.ts. test/audit.test.ts and test/api-audit.test.ts passed, including validation of every record against the OCSF 1.9.0 extract that scripts/vendor-ocsf.mjs read from schema.ocsf.io on 2026-10-30. The Splunk, Elastic and Amazon Security Lake notes were not tried against those products."
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
| Candidate, delivery bundle, delivery ledger, flag rules, Agent Trace or audit download | Web Resources Activity (6001) | Export (7) | Declares the `host` profile, which gives this class its `actor` |
| Request to `unfold-mcp` over HTTP, and each call it delegates | API Activity (6003) | Create (1) | `ai_agent` is the MCP client, `delegation.uid` a hash of the short-lived credential, so a tool call and the API calls it made correlate. Declares the `ai_operation` profile. Refused tokens and accounts are recorded too |
| Every other Action (a state-changing API call) | API Activity (6003) | Create, Update or Delete by method | `api.operation` is the route with ids as `:id`; `api.request.data` holds the inputs with secrets removed, as Action Records keep them |

Unfold cannot tell whether a person or an agent drives an MCP client; it records the client as `ai_agent` because MCP clients are agent harnesses. Ordinary reads are not recorded, except downloads and reads of the audit itself.

The other audit sources stay as they are. The JSON lines on stdout (`login.failed`, `editor.approved`, `mcp.request`, `link.*`) keep going to the log collector, Action Records still feed the action log, `flag_audit` still feeds the Labs page, and session events stay the session's history. The audit trail covers the same changes in OCSF.

Not recorded yet:

* The GitLab and ClickUp OAuth callback. It arrives as a cross-site navigation without the session cookie, so the tap cannot tell who it was; the request that started it is recorded as API Activity.
* The editor's own collection of an approved credential. The approval in the browser is the recorded decision.
* Tenant export, webhooks, intake sources and billing lines do not exist yet. When they land they call `AuditTrail.record` (`src/audit/service.ts`); the proposed mapping is Web Resources Activity Export for a Tenant export, and Entity Management Create, Update or Delete for a webhook, an intake source or a billing line.

## Which Tenant sees a record

Each Tenant has its own chain. A record about a person (sign-in, sign-out, credentials, account, role) goes to every Tenant that person belongs to. A membership record goes to that membership's Tenant only. Any other record goes to the Tenant of what it targets when Unfold can tell (a task connection, a session's repository), else to the actor's only Tenant, else to the install's `default` Tenant.

## How the audit is kept, and what that guarantees

Records are appended to `audit_records` in `unfold.sqlite` ([Storage](storage.md)). Each record uses the OCSF Record Integrity profile: `attestation_list[0]` has `chain_uid` `unfold-audit:<tenant>`, the previous record's `uid`, `type_uid` and SHA-256 `fingerprint` in `prev_event`, and the record's own `fingerprint`. That fingerprint is the SHA-256, in hex, of the record serialized as RFC 8785 JSON (JCS) with its own `fingerprint` left out. Because each record carries the previous record's fingerprint, changing any record changes every fingerprint after it.

Database triggers refuse to update a record and refuse to delete one that no retention anchor covers. This stops Unfold's own code, and a mistaken query, from rewriting history. It does not stop someone with write access to the database file: they can drop the triggers, change records and recompute every fingerprint. **Tampering is detectable, not prevented**, and only against a copy kept somewhere else: the records your SIEM already holds, or a chain head (`X-Unfold-Audit-Head`) you wrote down. Send the audit to a SIEM if you need that check.

Records older than the retention are removed once an hour. Before that, an anchor stores the sequence and fingerprint of the last removed record, so the remaining chain still verifies. Anchors are never removed.

| Setting | Default | What it does |
| --- | --- | --- |
| `UNFOLD_AUDIT_RETENTION_DAYS`, else `audit.retentionDays` | 400 | Days a record is kept, 1 to 3650 |
| `UNFOLD_AUDIT_OTLP_URL`, else `audit.otlpUrl` | none | OTLP/HTTP JSON logs endpoint, such as a collector's `/v1/logs` |
| `UNFOLD_AUDIT_OTLP_HEADERS` | none | Headers for that endpoint as `key=value` pairs separated by commas, URL-encoded, as `OTEL_EXPORTER_OTLP_HEADERS` writes them. Keep the value in a secret |

Check a Tenant's chain with `GET /api/admin/audit/verify?tenant=<id>`. It answers `{tenant, ok, checked, anchor, head, break}`, where `break` names the first sequence whose link or fingerprint does not match.

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
| From where | `src_endpoint.ip`, the address the server saw. Behind a reverse proxy that is the proxy, because Unfold does not trust `X-Forwarded-For` |
| Whether it worked | `status_id`, `status_detail` and `api.response.code` |
| Is the log protected | Append-only triggers and a hash chain: changes are detectable against a copy, not prevented |
| Is reading the log logged | Yes, every read of `GET /api/admin/audit` is a record |
| How long it is kept | `UNFOLD_AUDIT_RETENTION_DAYS`, 400 days by default. Set what your agreement with the client requires |

What Unfold does not record: reads of Work Items, sessions and other records in the browser or the API, other than downloads. If a client needs every read logged, that is not built.
