# Tasks — outbound-events

## 1. Unfold application

- [x] 1.1 `src/outbound/catalogue.ts`: event types, data schemas, filters, CloudEvent builder
- [x] 1.2 `src/outbound/signing.ts`: Standard Webhooks signing and verification
- [x] 1.3 `src/outbound/address.ts`: SSRF guard and allowlist
- [x] 1.4 `src/outbound/store.ts`: subscriptions, outbox, cursors, Sign-off triggers
- [x] 1.5 `src/outbound/service.ts`: sources, dispatcher, retries, admin API
- [x] 1.6 `events.webhooks` flag and `outboundEvents` setting
- [x] 1.7 Webhooks Settings page

## 2. Documentation

- [x] 2.1 `events.asyncapi.yaml`, generated from the catalogue and checked by a test
- [x] 2.2 `cloudevent.v1.schema.json`; the envelope schema marked superseded
- [x] 2.3 API contract rows and an operations guide with verification, n8n and Slack

## 3. Decisions

- [ ] 3.1 The owner decides whether the format becomes an Unfold ADR
- [ ] 3.2 Ploeg operator events as CloudEvents, upstream in ploeg-hq

## 4. Gates

- [x] 4.1 `mise run verify` and `mise run docs-check`, output in the pull request
