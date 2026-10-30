# Tasks — notifications

## 1. Server

- [x] 1.1 VAPID (RFC 8292) and aes128gcm message encryption (RFC 8291) with the RFC test vectors
- [x] 1.2 Channel registry with the ntfy and Web Push adapters
- [x] 1.3 Preferences, quiet hours and the outbox store
- [x] 1.4 Sources: Ploeg events, Linked Session permission requests, Client Sign-offs, budget shares
- [x] 1.5 Dispatch with retries, dedupe and 404/410 cleanup
- [x] 1.6 `notifications.push` flag and the `/api/me/notifications` route block

## 2. Browser

- [x] 2.1 `public/sw.js` for push and notification clicks
- [x] 2.2 Notifications Settings page with subscribe and unsubscribe

## 3. Docs and gates

- [x] 3.1 Operations page *Get notified (ntfy and Web Push)*, flag row, API rows
- [x] 3.2 Dated line in ADR-0026 (status unchanged)
- [ ] 3.3 **[owner]** Decide whether ADR-0026 is accepted
- [ ] 3.4 Classify the tables in the Tenant export once one exists
- [x] 3.5 `mise run verify` and `mise run docs-check`
