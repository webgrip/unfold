# Chat notifications

## ADDED Requirements

### Requirement: A Slack account is linked only from Slack

Unfold SHALL send a person's notices to a Slack account only after that Slack
account confirmed the link from a direct message Unfold sent it, within 15
minutes. A Slack account MUST be linked to at most one Unfold person.

#### Scenario: Another Slack account presses the link button

- **WHEN** a Slack account other than the one Unfold asked presses Link to Unfold
- **THEN** no link is made and no notice goes to either account

### Requirement: Only signed Slack interactions act

Unfold SHALL act on a Slack interaction only when its `X-Slack-Signature`
verifies as Slack's `v0` HMAC-SHA256 of the timestamp and raw body with the
signing secret, and its timestamp is within five minutes of Unfold's clock.

#### Scenario: A stale interaction

- **WHEN** a correctly signed interaction arrives with a timestamp ten minutes old
- **THEN** Unfold answers 401 `slack_signature` and does nothing

### Requirement: Only the owner answers a tool prompt from Slack, after review and confirmation

With `notifications.slack.permissionAnswers` on, Unfold SHALL answer a
tool-permission prompt from Slack only for the Slack account linked to the
prompt's owner, only from the review modal, and only once. The notice MUST NOT
carry the tool or its summary.

#### Scenario: Someone else presses Allow

- **WHEN** a Slack account linked to another person presses Allow once for the prompt
- **THEN** the prompt stays pending

### Requirement: Nothing that spends money is a chat action

Unfold SHALL refuse every Slack action other than opening Unfold, confirming a
link and reviewing or answering the owner's tool prompt. It MUST NOT offer a
chat button that retries, approves, raises a budget or asks a model.

#### Scenario: A crafted retry button

- **WHEN** a signed interaction names the action `unfold.work.retry`
- **THEN** Unfold only replies that the action is done in Unfold

### Requirement: Teams notices are Adaptive Cards with an Open link

Unfold SHALL post a Teams notice as an Adaptive Card whose text renders no
Markdown and whose only action opens Unfold, to a workflow URL that is HTTPS
on an allowed Power Automate host. The API MUST NOT show the URL back.

#### Scenario: A title with a Markdown link

- **WHEN** a Work Item title contains `[this](https://evil.example)`
- **THEN** the card shows it as text and carries no link but the one into Unfold

### Requirement: Chat channels are off until their own flag is on

Slack and Teams SHALL be available to a person only while `notifications.push`
and the channel's own flag are on for them. A waiting notice for a channel
whose flag went off MUST be dropped, not sent.

#### Scenario: The Teams flag is off

- **WHEN** a person whose `notifications.teams` flag is off chooses Teams
- **THEN** Unfold refuses the choice with `notify_channel`
