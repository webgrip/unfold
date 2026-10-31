---
type: how-to
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation: src/notify/ (settings.ts, channels.ts, web-push.ts, slack.ts, teams.ts, service.ts, store.ts, triggers.ts, preferences.ts, handed-off.ts), public/sw.js and public/views/notifications.js. test/notify-web-push.test.ts reproduced the RFC 8291 section 5 message and verified the RFC 8292 section 2.4 token; test/notify-handed-off.test.ts covers notices about handed-off work and their dedupe; test/notifications.test.ts published to a local HTTP server standing in for ntfy; test/notify-slack-teams.test.ts drove local HTTP servers standing in for the Slack Web API and a Teams workflow. Slack and Teams request shapes were checked against docs.slack.dev and learn.microsoft.com on 2026-10-30. Not checked: a real ntfy server, delivery through a real browser push service, a real Slack workspace and a real Teams workflow."
---

# Get notified (ntfy, Web Push, Slack and Microsoft Teams)

Unfold can tell people when something waits for them, while Unfold is closed. It sends from the server over two open channels you can host yourself, [ntfy](https://docs.ntfy.sh/) and Web Push ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030), encrypted with [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) and signed with [VAPID, RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)), and over the two chat tools agencies and their clients already use: [Slack](#slack) and [Microsoft Teams](#microsoft-teams). This builds the notifier of [system ADR-0026](../../../../docs/adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md), which is still proposed.

It is off twice over: the `notifications.push` [feature flag](feature-flags.md) is off for everyone, and a person whose flag is on still gets nothing until they choose a channel under **Settings › Notifications**. With a channel chosen, notices about work they handed off are on until they turn them off; every other moment is off until they choose it. Slack and Teams each have one more flag, `notifications.slack` and `notifications.teams`, also off for everyone.

## What tells a person

| Trigger | When | Who is told |
| --- | --- | --- |
| A Work Item needs you | Ploeg records `work_item.needs_human` or `work_item.stale` | Everyone who can read the Team and reaches the Work Item's owner |
| A question or tool permission waits for you | `work_item.needs_human` after the Shift closed `question_for_person`; or a tool-permission request waits in a person's own agent session | Readers of the Work Item; the session's owner only |
| A pull request is ready for review | `work_item.awaiting_review` | Readers of the Work Item |
| A Client Sign-off was recorded | A current Client Sign-off is stored | Readers of the Work Item |
| A budget threshold was crossed | After a Run's outcome, the latest Shift's spent and held money reaches 80 % or 100 % of its budget (`notifications.budgetThresholds`) | Readers of the Work Item, once per Shift and share |
| Work I handed off (**Notify me about work I handed off**, on unless turned off) | A Work Item the person handed off starts needing a person (`work_item.needs_human` or `work_item.stale`) or reaches `work_item.awaiting_review` | The people whose latest hand-off of it, through any channel, still stands and who read it; once per transition |

"Readers" means people whose Teams include the Work Item's Team and, while `tenancy.enforce` is on, whose Tenant or Client membership reaches it (system ADR-0017).

A notice carries a fixed headline, the Work Item's number and its title with secrets masked, and a link into Unfold when `baseUrl` is set. For work a tracker holds it also names the task as its tracker shows it, such as `ClickUp #86c0abc12`, and carries the task's link: a second Slack button and Teams action (**Open in ClickUp**, named after the tracker), and an ntfy view action. A Web Push notice names the task in its body and opens Unfold. It never carries a price, a spend figure, a Ploeg reason, a note, a question's text or a tool's arguments. A budget notice names the share, not the amount.

## Work a person handed off

Unfold finds who handed a Work Item off in the Action Records ([system ADR-0037](../../../../docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md)): a tracker task handed to the Work Item's Team from a task connection of its tracker, or a Linked Session's Work Item handed to Ploeg, from the browser, an editor credential or `unfold-mcp`. A later take-back cancels a person's hand-off. A hand-off made in the tracker itself names no Unfold person, so nobody gets these notices for it.

* **One per transition.** Unfold keeps the last moment it notified about per Work Item: needs you or ready for review. The same moment again, such as `work_item.stale` after `work_item.needs_human`, notifies nobody. A finished Run (`run.finished`), an approval, a new hand-off or `work_item.done` clears it, so needing the person again after the agent ran is a new notice. Each notice is also keyed by its Ploeg event, so reading an event twice queues nothing new.
* **Instead of, not as well as.** The person who handed the Work Item off gets the hand-off notice ("Work you handed off needs you", "… asks you a question", "… has a pull request ready") in place of the general one for that event, also when they chose that trigger.
* **Their choice holds.** Turning **Notify me about work I handed off** off drops notices already waiting. Quiet hours, the channel flags and the reader rules apply as for every notice, and the notice carries the same fields: the Work Item's number, its title with secrets masked and cut to 120 characters, and its link.

The person's own view of what they handed off is the **Handed off by you** card on Now, read from `GET /api/handoffs` ([Follow the work you handed off](../../../../docs/how-to/follow-handed-off-work.md)).

## How delivery behaves

* Every notice is written to an outbox in Unfold's store first, so a restart loses nothing. One trigger occurrence becomes at most one notice per person, channel and target, even when Unfold reads the same Ploeg event twice.
* Unfold starts at Ploeg's newest event, so turning the flag on sends no history.
* Notifications name Ploeg's events with the same types as [outbound webhooks](outbound-events.md) (`work_item.needs_you`, `work_item.ready_for_review`, `run.finished`), but read them with their own cursor. The webhook outbox is written only while an administrator has an active subscription, and is pruned once delivered, so it cannot carry notices for people when no webhook is set up.
* A send that fails with a network error, 408, 429 or 5xx is retried after 30 seconds, 2 minutes, 10 minutes, 30 minutes, 2 hours and 6 hours, or later when the receiver sends `Retry-After`. Any other 4xx is final. A notice older than 24 hours is given up.
* When a push service answers 404 or 410, the subscription has expired: Unfold deletes it and drops its waiting notices.
* Quiet hours hold a notice until they end, in the person's time zone. The test notice ignores them.
* The demo follows nothing and sends nothing; the page says so.

## Configure the channels

Add a `notifications` block to the configuration file. Each value that is a secret is named by an environment variable, never written in the file.

```json
{
  "baseUrl": "https://unfold.example.org",
  "notifications": {
    "ntfy": { "server": "https://ntfy.example.org", "tokenEnv": "UNFOLD_NTFY_TOKEN" },
    "webPush": { "subject": "mailto:ops@example.org", "publicKeyEnv": "UNFOLD_VAPID_PUBLIC_KEY", "privateKeyEnv": "UNFOLD_VAPID_PRIVATE_KEY" },
    "budgetThresholds": [0.8, 1]
  }
}
```

| Key | Meaning |
| --- | --- |
| `ntfy.server` | The ntfy server's base URL, http or https, without credentials |
| `ntfy.tokenEnv` | Optional. The variable holding an ntfy access token (`tk_…`) that may publish to the topics. While it is named but empty, ntfy is unavailable |
| `ntfy.topicPrefix` | Optional, default `unfold-`. Unfold appends 128 random bits per person |
| `webPush.subject` | Your contact for push services, `mailto:` or `https:` |
| `webPush.publicKeyEnv`, `webPush.privateKeyEnv` | The variables holding the VAPID key pair, base64url: the 65-byte public point and the 32-byte private scalar. A scalar written without its leading zero bytes, as `ECDH.getPrivateKey()` returns about one key in 256, is read as the same key. A pair whose halves do not match keeps Web Push off and logs `notify.vapid_invalid` |
| `budgetThresholds` | Up to five shares above 0 and at most 1 |

Generate a VAPID key pair once and keep it: a new pair invalidates every browser subscription.

```sh
node -e "const e=require('node:crypto').createECDH('prime256v1');e.generateKeys();console.log('UNFOLD_VAPID_PUBLIC_KEY='+e.getPublicKey('base64url'));console.log('UNFOLD_VAPID_PRIVATE_KEY='+Buffer.from(e.getPrivateKey('hex').padStart(64,'0'),'hex').toString('base64url'))"
```

In Kubernetes put both keys and the ntfy token in a Secret and pass them with the chart's `extraEnv`:

```yaml
extraEnv:
  - name: UNFOLD_VAPID_PUBLIC_KEY
    valueFrom: { secretKeyRef: { name: unfold-notifications, key: vapid-public } }
  - name: UNFOLD_VAPID_PRIVATE_KEY
    valueFrom: { secretKeyRef: { name: unfold-notifications, key: vapid-private } }
  - name: UNFOLD_NTFY_TOKEN
    valueFrom: { secretKeyRef: { name: unfold-notifications, key: ntfy-token } }
```

Unfold masks the ntfy token and the VAPID private key wherever it masks its other configured secrets.

Then turn the flag on for the people who may use it, for example `{"flags": {"notifications.push": {"targeting": {"if": [{"in": [{"var": "role"}, ["admin", "operator"]]}, "on", "off"]}}}}`.

## Self-host ntfy

ntfy is one Go binary or container (`binwiederhier/ntfy`, command `serve`). Behind your reverse proxy, a `server.yml` that keeps topics private looks like this:

```yaml
base-url: "https://ntfy.example.org"
listen-http: ":80"
behind-proxy: true
cache-file: "/var/cache/ntfy/cache.db"
auth-file: "/var/lib/ntfy/user.db"
auth-default-access: "deny-all"
upstream-base-url: "https://ntfy.sh"
```

* `auth-default-access: deny-all` means nobody reads or writes without an account. Create one publisher for Unfold, let it write the Unfold topics, and give it a token: `ntfy user add unfold`, `ntfy access unfold 'unfold-*' write-only`, `ntfy token add unfold`. Put that token in `UNFOLD_NTFY_TOKEN`.
* Give each person an ntfy account that may read only their own topic, `ntfy access ann unfold-<their topic> read-only`; they see the topic on their Notifications page. On a server that allows anonymous reads, the random topic name is the only protection, so a person who leaked it gets a new one with **Get a new topic**.
* `upstream-base-url` lets the ntfy iOS app get instant notices through ntfy.sh's relay, which sees only a message id, not the content. Leave it out if no one uses iOS; Android and the web app do not need it.
* Phones off your network reach ntfy only where you publish it; the homelab reaches a phone over your VPN or a published hostname.

## Web Push in the browser

**Subscribe this browser** registers `/sw.js`, asks the browser's permission and sends the subscription to Unfold. The browser's push service (Google, Mozilla or Apple) carries the message; it sees only ciphertext. On iPhone and iPad, Safari delivers Web Push only to Unfold added to the Home Screen. `sw.js` shows the notice and opens its link in Unfold on a click; it caches nothing.

## Personal data

Preferences, the ntfy topic, Web Push subscriptions, the Slack link and Teams workflows are a person's personal data, and **Turn everything off** deletes them after the person confirms it. The Tenant export carries the preferences and the Slack link (workspace and member id); topics, subscriptions, Slack direct-message targets and Teams workflow URLs are secrets and stay out. The VAPID keys, the ntfy token, the Slack bot token and the Slack signing secret are deployment secrets and are never exported.

## Slack

Each person gets their notices as direct messages from an Unfold Slack app. A message is Block Kit: the headline and the Work Item's number and masked title as plain text, so a title cannot inject Slack formatting, and an **Open in Unfold** button (**Answer in Unfold** for a question) that links to the page, plus an **Open in** button for the tracker task when the Work Item came from one. It carries nothing more than the other channels: no price, spend, note or question text.

### Create the Slack app

At [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App › From an app manifest**, pick the workspace and paste this, with your own host in the request URL. The fields follow Slack's [app manifest reference](https://docs.slack.dev/reference/app-manifest).

```yaml
display_information:
  name: Unfold
  description: Tells you when a Work Item, a review or a question waits for you.
features:
  app_home:
    home_tab_enabled: false
    messages_tab_enabled: true
    messages_tab_read_only_enabled: true
  bot_user:
    display_name: unfold
    always_online: false
oauth_config:
  scopes:
    bot:
      - chat:write
      - im:write
      - users:read.email
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
  interactivity:
    is_enabled: true
    request_url: https://unfold.example.org/api/notifications/channels/slack/interactions
```

What each scope is for, per Slack's method reference:

| Scope | Method | Why |
| --- | --- | --- |
| `users:read.email` | [`users.lookupByEmail`](https://docs.slack.dev/reference/methods/users.lookupByEmail) | Find the Slack account of the email address a person gives when they link |
| `im:write` | [`conversations.open`](https://docs.slack.dev/reference/methods/conversations.open) | Open the direct message with that account |
| `chat:write` | [`chat.postMessage`](https://docs.slack.dev/reference/methods/chat.postMessage) | Post the link request and the notices |

[`views.open`](https://docs.slack.dev/reference/methods/views.open) and [`views.update`](https://docs.slack.dev/reference/methods/views.update), used to review a tool prompt, need no scope.

Then **Install to Workspace**. Installing runs Slack's OAuth v2 flow for you and shows the **Bot User OAuth Token** (`xoxb-…`) under **OAuth & Permissions**; copy it. Copy the **Signing Secret** from **Basic Information › App Credentials**. Unfold serves one workspace this way; it runs no install flow of its own for other workspaces.

### Configure Slack in Unfold

```json
{
  "notifications": {
    "slack": {
      "tokenEnv": "UNFOLD_SLACK_BOT_TOKEN",
      "signingSecretEnv": "UNFOLD_SLACK_SIGNING_SECRET",
      "teamId": "T012AB3C4",
      "permissionAnswers": false
    }
  }
}
```

| Key | Meaning |
| --- | --- |
| `slack.tokenEnv` | The variable holding the bot token |
| `slack.signingSecretEnv` | The variable holding the signing secret. Slack is unavailable while either variable is empty, because linking needs a signed confirmation |
| `slack.teamId` | Optional. The one workspace Unfold accepts links and button presses from |
| `slack.permissionAnswers` | Optional, default `false`. See [Answering a tool prompt from Slack](#answering-a-tool-prompt-from-slack) |
| `slack.apiUrl` | Optional, default `https://slack.com/api`. Only tests change it |

Put both values in the `unfold-notifications` Secret next to the others and pass them with `extraEnv`, as above. Unfold masks the bot token and the signing secret wherever it masks its other secrets. The demo refuses a `notifications.slack` block, because every demo visitor is an administrator.

Turn `notifications.slack` on for the people who may use it, the same way as `notifications.push`.

### Link a Slack account

On **Settings › Notifications** a person gives the email address of their Slack account and presses **Link Slack**. Unfold looks the account up, opens a direct message with it and posts **Link to Unfold** there. The link exists only when that same Slack account presses the button within 15 minutes: Unfold checks the request signature, that the presser is the account it asked, and that the one-time code (kept only as a hash) matches. A Slack account links to one Unfold person. **Unlink** removes it.

### Button presses

Slack sends every button press to the request URL as a signed, form-encoded `payload` ([handling user interaction](https://docs.slack.dev/interactivity/handling-user-interaction)); a link button sends one too ([button element](https://docs.slack.dev/reference/block-kit/block-elements/button-element)). Unfold checks the [request signature](https://docs.slack.dev/authentication/verifying-requests-from-slack) before it reads anything: the hex HMAC-SHA256, keyed with the signing secret, of `v0:<X-Slack-Request-Timestamp>:<raw body>`, prefixed `v0=` and compared in constant time with `X-Slack-Signature`. A timestamp more than five minutes from Unfold's clock is refused as stale. Unfold acts on these `action_id`s and no others:

| Action | What it does |
| --- | --- |
| `unfold.open` | Nothing; the browser opens Unfold |
| `unfold.link.confirm` | Confirms a link request, as above |
| `unfold.permission.review` | Opens the review of a tool prompt, when `permissionAnswers` is on |
| `unfold.permission.allow`, `unfold.permission.deny` | Answers that prompt from the review, when `permissionAnswers` is on |

Every other action is refused with a short reply only the presser sees, sent to the payload's `response_url` when that is on `hooks.slack.com`. Nothing that spends money (retrying, approving, raising a budget, asking a model) is ever a button in Slack: a person opens Unfold for that.

### Answering a tool prompt from Slack

With `permissionAnswers: true`, the notice for a tool-permission prompt in a person's own Linked Session gets a second button, **Review and answer**. It works only for the Slack account linked to the session's owner, only while the session turned on remote approval, and only while the prompt waits. It opens a Slack modal, visible to that person alone, with the tool and the summary the plugin wrote (redacted again by Unfold) and two buttons, **Allow once** and **Deny**. Each asks for a confirmation in Slack before it acts, so the person reads the prompt and confirms it, as `unfold_answer_permission` asks of unfold-mcp. Unfold answers once, never "always allow", and records the answer as the person's. The notice itself never carries the tool or its summary; only the modal does. Leave `permissionAnswers` off if tool summaries should never reach Slack.

Unfold sends the modal as a JSON object in a JSON body. Slack's method pages describe `view` as "a JSON-encoded string"; that a JSON body may carry it as an object is **not verified** against a real workspace.

### Slack delivery

Unfold treats an HTTP 429 or Slack's `ratelimited` error as retry-later and honours `Retry-After` ([rate limits](https://docs.slack.dev/apis/web-api/rate-limits)); Slack's `internal_error`, `fatal_error`, `service_unavailable` and `request_timeout` are retried too. `channel_not_found`, `is_archived`, `user_disabled`, `user_not_found` and `cannot_dm_bot` mean the direct message is gone: Unfold deletes the target and the person links again. Any other error, such as `invalid_auth` or `token_revoked`, gives the notice up.

## Microsoft Teams

Office 365 Connectors in Teams, including connector-based Incoming Webhooks, were retired in May 2026; Microsoft's replacement is a webhook in the Teams **Workflows** app, powered by Power Automate ([Create an Incoming Webhook](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook), checked 2026-10-30). Unfold posts to such a workflow. It needs no Azure registration and no bot.

A notice is an Adaptive Card in a `message` with one `application/vnd.microsoft.card.adaptive` attachment, the body the [Teams webhook trigger](https://learn.microsoft.com/en-us/connectors/teams/#microsoft-teams-webhook) expects. The headline and the Work Item's number and masked title are `TextRun`s in `RichTextBlock`s, which [render no Markdown](https://learn.microsoft.com/en-us/adaptive-cards/authoring-cards/text-features), so a title cannot add a link; the only action is `Action.OpenUrl` into Unfold. The cards carry nothing Unfold answers.

### Add a workflow

1. In Teams, open the chat or channel that should get the notices, choose **Workflows** and pick the template **Send webhook alerts to a chat** or **Send webhook alerts to a channel**. A personal chat suits one person; a channel suits a team, and everyone who reads it sees the notices.
2. Let **Anyone** trigger the flow. Unfold sends no Microsoft sign-in token, and the trigger refuses a request without one under the other two choices.
3. Save and copy the webhook URL.
4. On **Settings › Notifications**, paste it under **Microsoft Teams**, give it a name and press **Add workflow**, then **Send a test notice**.

The URL is the only secret: whoever holds it can post to that chat or channel. Unfold keeps it in its target table, never shows it back (only its host), never exports it, and posts to it only over HTTPS to a public address. A person keeps up to five.

### Configure Teams in Unfold

```json
{
  "notifications": {
    "teams": { "allowedHosts": ["logic.azure.com", "api.powerplatform.com"] }
  }
}
```

`teams.allowedHosts` (optional, the default shown) lists the host suffixes a workflow URL may end in. Microsoft's connector reference shows `https://xxxxx.logic.azure.com:443/…`; newer workflows use `…environment.api.powerplatform.com`, which is **not verified** against a Microsoft document. Turn `notifications.teams` on for the people who may use it.

### Teams delivery

Unfold treats 2xx as delivered, 404 and 410 as a deleted workflow whose target goes (**not verified**: which status a deleted or turned-off workflow answers), and 408, 429 and 5xx as retry-later. Microsoft documents throttling above four requests a second per webhook and a 28 KB message limit; one notice is far below it.

### Interactive cards: a follow-up

Buttons that answer from Teams need a Teams app with a bot: a Microsoft Entra app registration and an Azure Bot resource, the Bot Framework or Microsoft 365 Agents SDK to receive `Action.Execute` invokes with a validated Bot Framework token, and Microsoft Graph or a proactive message to reach a person. That is an Azure registration per installation and a token check of its own, so phase 1 offers Open links only. When it is built it keeps the Slack rules: only the linked owner, a review and a confirmation, nothing that spends money.

## Adding a channel

Channels are adapters in one registry (`NotificationChannel` in `src/notify/channels.ts`). An adapter registers its own id and optional flag, stores each person's target (an ntfy topic, a push subscription, a Slack direct message, a Teams workflow URL) through the same target table, sends through the same outbox, retries, quiet hours and recipient scoping, and serves its routes under `/api/me/notifications/channels/<id>/`. A route its provider calls without an Unfold sign-in, such as Slack's interactions, goes under `/api/notifications/channels/<id>/` and verifies the provider itself.
