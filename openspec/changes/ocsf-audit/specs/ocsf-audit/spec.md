# OCSF audit

## ADDED Requirements

### Requirement: Security-relevant events are OCSF records

Unfold SHALL record each sign-in attempt, sign-out, credential issue, denial
and revocation, unfold-mcp request, account, role and membership change,
feature flag change, Client Sign-off change, data download and Action as one
OCSF 1.9.0 record per affected Tenant. Each record MUST carry `class_uid`,
`activity_id`, `type_uid`, `time`, `severity_id`, `status_id`,
`metadata.product`, `metadata.version`, `metadata.tenant_uid` and the actor,
and it MUST validate against the vendored schema extract.

#### Scenario: A failed password sign-in

- **WHEN** someone signs in with a wrong password
- **THEN** an Authentication (3002) Logon record with `status_id` 2 is stored,
  naming the attempted account and the source address

#### Scenario: An administrator forces a flag variant

- **WHEN** an administrator overrides a feature flag
- **THEN** an Entity Management (3004) Update record names the flag, the
  variant, the reason and the administrator

### Requirement: The store is append-only and hash-chained per Tenant

Each record SHALL be appended to its Tenant's chain with a sequence number and
an OCSF Record Integrity attestation: the previous record's SHA-256
fingerprint and its own, the SHA-256 of its JCS serialization without that
fingerprint. The store MUST refuse
updates of stored records and deletes not covered by a retention anchor.
Verification MUST report the first record whose sequence, previous hash or
hash does not match.

#### Scenario: A record is edited in the database

- **WHEN** someone drops the trigger and changes a stored record
- **THEN** verification fails at that record's sequence

### Requirement: Retention prunes behind an anchor

Records older than the configured retention (default 400 days) SHALL be
deleted only after an anchor stores the last deleted sequence and hash, and
verification MUST start from the newest anchor.

#### Scenario: Old records are pruned

- **WHEN** the oldest records pass the retention and are pruned
- **THEN** the remaining chain still verifies from the anchor

### Requirement: Export is opt-in, standard and Tenant-scoped

With the `audit.export` flag on for a Tenant, Unfold SHALL send new records
as OTLP logs to the configured endpoint and SHALL serve them as NDJSON from
`GET /api/admin/audit`, paged by sequence. The route MUST answer only to an
administrator of the requested Tenant. With the flag off, nothing is sent and
the route answers `audit_export_off`.

#### Scenario: An administrator of another Tenant asks

- **WHEN** an administrator of Tenant `a` asks for Tenant `b`
- **THEN** the route answers 403 and returns no record

#### Scenario: The collector is down

- **WHEN** the OTLP endpoint refuses a batch
- **THEN** the records stay stored and the next attempt sends them again from
  the last sequence the collector accepted
