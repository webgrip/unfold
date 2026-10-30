---
type: how-to
audience: [owner, operator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/notifications: src/notify/ (settings.ts, channels.ts, web-push.ts, service.ts, store.ts, triggers.ts, preferences.ts), public/sw.js and public/views/notifications.js. test/notify-web-push.test.ts reproduced the RFC 8291 section 5 message and verified the RFC 8292 section 2.4 token; test/notifications.test.ts published to a local HTTP server standing in for ntfy. Not checked: a real ntfy server, and delivery through a real browser push service."
---

# Get notified (ntfy and Web Push)

Unfold can tell people when something waits for them, while Unfold is closed. It sends from the server over two open channels you can host yourself: [ntfy](https://docs.ntfy.sh/) and Web Push ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030), encrypted with [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) and signed with [VAPID, RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)). This builds the notifier of [system ADR-0026](../../../../docs/adr/adr-0026-unfold-is-an-installable-web-app-that-notifies-from-the-server.md), which is still proposed.

It is off twice over: the `notifications.push` [feature flag](feature-flags.md) is off for everyone, and a person whose flag is on still gets nothing until they choose a channel and at least one moment under **Settings › Notifications**.

## What tells a person

| Trigger | When | Who is told |
| --- | --- | --- |
| A Work Item needs you | Ploeg records `work_item.needs_human` or `work_item.stale` | Everyone who can read the Team and reaches the Work Item's owner |
| A question or tool permission waits for you | `work_item.needs_human` after the Shift closed `question_for_person`; or a tool-permission request waits in a person's own agent session | Readers of the Work Item; the session's owner only |
| A pull request is ready for review | `work_item.awaiting_review` | Readers of the Work Item |
| A Client Sign-off was recorded | A current Client Sign-off is stored | Readers of the Work Item |
| A budget threshold was crossed | After a Run's outcome, the latest Shift's spent and held money reaches 80 % or 100 % of its budget (`notifications.budgetThresholds`) | Readers of the Work Item, once per Shift and share |

"Readers" means people whose Teams include the Work Item's Team and, while `tenancy.enforce` is on, whose Tenant or Client membership reaches it (system ADR-0017).

A notice carries a fixed headline, the Work Item's number and its title with secrets masked, and a link into Unfold when `baseUrl` is set. It never carries a price, a spend figure, a Ploeg reason, a note, a question's text or a tool's arguments. A budget notice names the share, not the amount.

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

Preferences, the ntfy topic and Web Push subscriptions are a person's personal data: they belong in a Tenant export once one exists, and **Turn everything off** deletes them. The VAPID keys and the ntfy token are deployment secrets and are never exported.

## Adding a channel

Channels are adapters in one registry (`NotificationChannel` in `src/notify/channels.ts`). A Slack or Microsoft Teams adapter registers its own id, stores each person's target (a member id, a webhook) through the same target table, sends through the same outbox and retries, and serves its linking routes under `/api/me/notifications/channels/<id>/`.
