# Notifications in Slack and Microsoft Teams

## Why

Agencies talk to each other in Slack, and their clients mostly use Microsoft
Teams. A notice that arrives only over ntfy or Web Push asks both to install
one more thing. The channel registry of the `notifications` change was built so
that Slack and Teams plug in as two more adapters; this change adds them.

Application: `apps/unfold`. Ticket: none yet.

## What Changes

- A **Slack** adapter: a Slack app with a bot token (`chat:write`, `im:write`,
  `users:read.email`) and its signing secret, both from a Secret. A person
  links their Slack account by email and confirms the link from that account
  in Slack. Notices are Block Kit direct messages with an Open link.
- Signed Slack interactions at `/api/notifications/channels/slack/interactions`,
  verified with Slack's `v0` request signature. With
  `notifications.slack.permissionAnswers` on, the owner of a tool-permission
  prompt may review it in a Slack modal and allow it once or deny it after a
  confirmation. Every other action is refused; nothing that spends money is a
  button.
- A **Microsoft Teams** adapter through Power Automate Workflows webhooks: a
  person pastes the webhook URL of a workflow that posts to their chat or a
  channel, and notices arrive as Adaptive Cards with an Open link.
- Both reuse the outbox, dedupe, retries, quiet hours, recipient scoping and
  content rules of `notifications`.
- Two flags, `notifications.slack` and `notifications.teams`, per person, off
  by default, on top of `notifications.push`. The demo refuses a Slack block.
- Operations sections *Slack* and *Microsoft Teams*, API and OpenAPI rows, the
  Tenant export classification of the new tables.

## Non-goals

- Interactive Teams cards. They need a Teams app with a bot and an Azure
  registration; the operations page records the route as a follow-up.
- A Slack install flow for other workspaces (OAuth v2 distribution). One
  workspace installs the app from its manifest.
- Posting a person's notices into a shared Slack channel.
- Any chat action that spends money: retry, approve, budget, Ask.

## Capabilities

### New Capabilities

- `chat-notifications`: how notices reach Slack and Teams, how a Slack account
  is linked, and which chat actions Unfold accepts.

### Modified Capabilities

None.
