# Design — notify-slack-teams

## Decisions

- **Linking by email, confirmed in Slack.** `users.lookupByEmail` finds the
  account the person names; a Link to Unfold button in a direct message to
  that account, pressed by that account within 15 minutes, creates the link.
  An email alone proves nothing, and the press proves the Slack side. The
  one-time code is kept only as a hash.
- **One installation, no OAuth flow in Unfold.** Installing the app from its
  manifest runs Slack's OAuth v2 and yields the bot token. Distribution to many
  workspaces would need Unfold to keep a token per workspace; not needed yet.
- **A public route next to the registry's private one.** Slack calls without
  an Unfold sign-in, so `NotificationChannel` gains `publicRoute`, mounted at
  `/api/notifications/channels/<id>/` before the browser mutation guard. The
  adapter verifies the provider; the service only checks the method, the demo
  and availability.
- **Review, then confirm.** A permission notice carries no prompt text. Review
  and answer opens a modal only the linked owner sees, with the tool and the
  plugin's redacted summary; Allow once and Deny each carry a Slack
  confirmation dialog. `LinkedPermissions.answer` gets the new `chat` scope,
  which needs a confirmation as `editor` and `mcp` do, and the answer is an
  Action Record on channel `slack`.
- **An allowlist of actions.** Five `action_id`s act. Everything else is
  answered with a refusal through `response_url`, which must be on
  `hooks.slack.com`.
- **Teams through Workflows only.** Office 365 Connectors were retired in May
  2026. A workflow webhook needs no Azure registration; the URL is the secret,
  so it stays in `notify_targets` (never exported) and the API shows its host.
- **No Markdown from titles.** Slack text is `plain_text`; Teams text is a
  `TextRun`, which renders no Markdown.
- **Flags per channel.** A channel may name a flag; the service checks it per
  person when listing, choosing, queueing and sending, and drops a waiting
  notice whose channel flag went off.

## Open Questions

- Which HTTP status does a deleted or turned-off Power Automate workflow
  answer? Unfold treats 404 and 410 as gone.
- Should an agency be able to post notices for a Team into a shared Slack or
  Teams channel, with scoping per channel rather than per person?
