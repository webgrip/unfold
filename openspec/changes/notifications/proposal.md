# Notifications: ntfy and Web Push from the server

## Why

A Work Item that waits on a person waits until that person opens Unfold.
`public/core/attention.js` can only tell someone while a tab is open, and
waiting on a person is probably the largest share of the time from ticket to
merged change ([ADR-0026](../../../docs/adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md),
proposed). People should be told when something waits for them, without
Unfold open, over open channels an Agency can host itself.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- A notification channel registry (system ADR-0050 rule 1, in PR #697):
  every channel is an adapter registered by name. Two adapters ship:
  **ntfy** (a topic per person on a configured server, optional access token
  from a Secret) and **Web Push** (RFC 8030 delivery, RFC 8291 message
  encryption, RFC 8292 VAPID, keys from a Secret, a service worker
  `public/sw.js`, subscribe and unsubscribe in the browser).
- Five triggers from what Unfold detects today: a Work Item needs you, a
  question or tool-permission request waits for you, a pull request is ready
  for review, a Client Sign-off was recorded, and a Shift crossed a budget
  threshold.
- Per-person preferences: channels, triggers and quiet hours. Nothing is on
  until the person opts in.
- A durable outbox in the store, with retries, dedupe per trigger
  occurrence, and removal of a Web Push subscription the push service reports
  gone (404 or 410).
- The `notifications.push` flag, per person, off by default; one route block,
  `/api/me/notifications`; a **Notifications** Settings page.
- An operations page, *Get notified (ntfy and Web Push)*.

## Non-goals

- Slack, Microsoft Teams or e-mail adapters. They plug into the same registry
  later.
- The offline shell cache ADR-0026 also describes. `public/sw.js` handles push
  and notification clicks only.
- Prices, spend, notes, Ploeg reasons or any client data beyond the Work Item
  title in a notification.
- Outbound webhooks (PR #701). Its catalogue overlaps the triggers; see
  design.md.
- Marking ADR-0026 accepted. That is the owner's decision.

## Capabilities

### New Capabilities

- `notifications`: what tells a person that something waits for them, over
  which channel, when, and what the notice may say.

### Modified Capabilities

None.
