# Tasks — request-intake

## 1. Decisions and vocabulary

- [ ] 1.1 File a ticket on the Unfold board and add its `VIK-<id>` to the proposal
- [x] 1.2 Add Intake Source to `docs/domain/model.yaml` and run `mise run domain`
- [ ] 1.3 **[owner]** Decide whether email only as an inbound webhook becomes a durable record (design.md Open Questions)

## 2. Intake

- [x] 2.1 Mapping language with JSON Pointer picks and its validator (`src/intake/mapping.ts`)
- [x] 2.2 Verifier registry: Standard Webhooks (v1 and v1a), X-Hub-Signature-256, Zendesk and token (`src/intake/signatures.ts`)
- [x] 2.3 Template registry with Marker.io, BugHerd, Userback, Freshdesk, Zendesk and form (`src/intake/templates.ts`)
- [x] 2.4 MIME and inbound-mail JSON parsing with threading ids (`src/intake/mail.ts`)
- [x] 2.5 Store, service and routes; one route block in `src/http.ts`; the `intake.requests` flag
- [x] 2.6 Settings page `#settings/intake` for administrators

## 3. Tests and docs

- [x] 3.1 Signature valid, invalid, stale and replayed; idempotency; each template; MIME with an HTML-only mail and a reply; Tenant and Client scoping; no Run
- [x] 3.2 API contract rows, feature-flag row and the operations page
- [x] 3.3 Run `mise run verify` and `mise run docs-check` and paste the output into the pull request

## 4. Follow-ups

- [ ] 4.1 Refinement picks up `new` Requests
- [ ] 4.2 Requests in the Tenant export once it exists (ADR-0050 rule 6)
