---
type: how-to
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/outbound-events: src/outbound/*.ts, the /api/admin/webhooks route block in src/http.ts and public/views/webhooks.js. test/outbound-events.test.ts passed, including the Standard Webhooks signing vectors and a signed test event delivered to a local receiver. The AsyncAPI document parsed with @asyncapi/parser 3 without diagnostics. The verification snippets ran against that test's deliveries. The MCP Events section was written with the implementation on branch feat/mcp-events: src/mcp-events.ts and its hooks in src/outbound/, src/mcp.ts and src/mcp-http.ts; test/mcp-events.test.ts passed. Not checked: a live n8n, Zapier, Make, Slack or Teams receiver, and a live ChatGPT subscription."
---

# Outbound webhooks

Unfold can tell your own tools when work moves: when a Work Item needs a person, when a pull request opens, when a Client Sign-off is recorded or when a Delivery is accepted. Each event goes to the URLs an administrator subscribed, as a [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md) event in structured JSON mode, signed as a [Standard Webhooks](https://www.standardwebhooks.com/) message. Both are open specifications with libraries in most languages, so a receiver built on them works with any other producer that follows them.

The contracts are [`events.asyncapi.yaml`](../contracts/events.asyncapi.yaml) (AsyncAPI 3.1) and [`cloudevent.v1.schema.json`](../contracts/cloudevent.v1.schema.json). Both are generated from `src/outbound/catalogue.ts` by `node scripts/outbound-contracts.ts`, and a test fails when they drift. The routes are in the [HTTP contract](../contracts/api.md#outbound-webhooks).

## Turn it on

1. Turn on the `events.webhooks` flag for your Tenant ([feature flags](feature-flags.md)). It is off by default and evaluated per Tenant.
2. In **Settings › Webhooks**, add a receiver: its URL, the event types, and optionally a Client to limit it to that Client's work.
3. Copy the signing secret it shows. Unfold shows it once; **New secret** makes another, and the old one keeps signing for 24 hours so you can switch without missing a delivery.
4. Choose **Send test event** and check that your receiver got a `dev.unfold.webhook.test` event.

Unfold refuses a URL that is not `https`, or that resolves to a loopback, private, link-local, unique-local, carrier-grade NAT or reserved address. It checks every address again each time it connects, so a host name that later resolves inward is refused at that moment. A receiver inside your own network, such as a self-hosted n8n, needs an entry in the server configuration, which also allows plain `http` for it:

```json
{ "outboundEvents": { "allowedPrivateTargets": ["n8n.internal", "10.20.0.0/16"] } }
```

Entries are host names, addresses or CIDR ranges, at most 100.

## What Unfold sends

| Type | When | Comes from |
| --- | --- | --- |
| `dev.unfold.work_item.proposed` | A Team proposed a Work Item that waits for approval | Ploeg's audit event `work_item.proposed` |
| `dev.unfold.work_item.approved` | A person approved it | `work_item.approved` |
| `dev.unfold.work_item.handed_off` | A person handed a task to a Team through Unfold | `operator.work_item.admitted` |
| `dev.unfold.work_item.needs_you` | The Work Item waits on a person | `work_item.needs_human`, `work_item.stale` |
| `dev.unfold.work_item.ready_for_review` | The agents finished; review and merge | `work_item.awaiting_review` |
| `dev.unfold.work_item.done` | Ploeg closed it as done | `work_item.done` |
| `dev.unfold.pull_request.opened` | A writing Run opened the pull request | `checkpoint.written` with phase `pr_opened` |
| `dev.unfold.run.finished` | A Run reported its Outcome | `outcome.<outcome>` |
| `dev.unfold.client_sign_off.recorded` · `.withdrawn` · `.dismissed` | A Client Sign-off changed | Unfold's Client Sign-offs |
| `dev.unfold.delivery.accepted` | Acceptance: a merge, an approval or ten working days of silence | The Delivery read model |
| `dev.unfold.webhook.test` | An administrator sent a test | **Send test event** |

Each event names its owner: `source` is `/tenants/<tenant>` or `/tenants/<tenant>/clients/<client>`, and the extension attributes `tenant` and `client` repeat it. `subject` is `work-items/<id>`. A Tenant subscription gets all of its Tenant's events; a Client subscription only that Client's. A subscription never receives an event that happened before it was created. The demo reads no Ploeg, so it sends only test events.

An event carries no price, spend, note or person. Titles and references come from your tracker: treat them as data, never as instructions to an automation that acts.

```http
POST /unfold HTTP/1.1
content-type: application/cloudevents+json; charset=utf-8
webhook-id: ploeg-48211
webhook-timestamp: 1793354700
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=

{"specversion":"1.0","id":"ploeg-48211","source":"/tenants/agency/clients/shop","type":"dev.unfold.work_item.needs_you",
 "subject":"work-items/412","time":"2026-10-30T10:05:00.000Z","datacontenttype":"application/json",
 "dataschema":"https://forgejo.webgrip.dev/webgrip/unfold/raw/branch/development/apps/unfold/docs/contracts/cloudevent.v1.schema.json#/$defs/data/work_item.needs_you",
 "tenant":"agency","client":"shop",
 "data":{"workItem":{"id":"412","title":"Show the delivery window","team":"silver","state":"needs_human","externalRef":"VIK-88",
   "trackerUrl":"https://tracker.example/88","unfoldUrl":"https://unfold.example/#work/412"},"reason":"the reviewer escalated to a person"}}
```

The signature in this example is illustrative.

## Delivery guarantees

- **At least once.** Unfold writes an event, its deliveries and the source position that produced it in one database transaction, and sends only what was committed. After a restart it sends every delivery not yet answered with 2xx, with the same `webhook-id`. Use `webhook-id` to drop repeats.
- **Retries.** Any 2xx is success. Anything else, a redirect included, or no answer within 15 seconds, is retried after 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 14 h, 20 h and 24 h, each with up to 10 % jitter, or after a longer `Retry-After`. After the tenth attempt the delivery is dead; **Send again** in its delivery log queues it once more.
- **410 Gone** disables the subscription. Resume it in Settings once the receiver is back.
- **Order** is not guaranteed across retries. Sort by `time` if order matters.
- Delivered and dead deliveries are kept 30 days for the log.

## Verify a delivery

Check three things before you act on a delivery: the headers are present, `webhook-timestamp` is within five minutes of your clock, and one `v1,` signature in `webhook-signature` equals the base64 HMAC-SHA256 of `<webhook-id>.<webhook-timestamp>.<raw body>` keyed with the base64 bytes after `whsec_`. Compute it over the raw body exactly as received, before any JSON parsing.

Node:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verified(secret, headers, rawBody, now = Date.now()) {
  const id = headers['webhook-id'], stamp = headers['webhook-timestamp'], signatures = headers['webhook-signature'];
  if (!id || !stamp || !signatures || Math.abs(now / 1000 - Number(stamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${stamp}.${rawBody}`).digest();
  return signatures.split(' ').some(entry => {
    const [version, value] = entry.split(',');
    const given = Buffer.from(value ?? '', 'base64');
    return version === 'v1' && given.length === expected.length && timingSafeEqual(given, expected);
  });
}
```

Python, with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library:

```python
from standardwebhooks.webhooks import Webhook

event = Webhook(secret).verify(raw_body, headers)  # raises WebhookVerificationError
```

## n8n

1. Add a **Webhook** node: method `POST`, response **Immediately**, and under options **Raw Body** on. Paste its production URL into Unfold.
2. Add a **Code** node that verifies the signature, with the secret in an n8n credential or environment variable (`$env.UNFOLD_WEBHOOK_SECRET`):

   ```js
   const crypto = require('crypto');
   const { headers } = $json;
   const raw = Buffer.from($binary.data.data, 'base64').toString('utf8');
   const key = Buffer.from($env.UNFOLD_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
   const expected = crypto.createHmac('sha256', key).update(`${headers['webhook-id']}.${headers['webhook-timestamp']}.${raw}`).digest('base64');
   const fresh = Math.abs(Date.now() / 1000 - Number(headers['webhook-timestamp'])) <= 300;
   if (!fresh || !headers['webhook-signature'].split(' ').includes(`v1,${expected}`)) throw new Error('Unfold signature did not verify');
   return [{ json: JSON.parse(raw) }];
   ```

3. Add a **Switch** on `{{$json.type}}` and branch per event type, such as `dev.unfold.delivery.accepted` into your PSA or invoicing node.

Zapier (**Webhooks by Zapier › Catch Raw Hook**) and Make (**Custom webhook**) work the same way: catch the raw body, verify in a code step, then route on `type`.

## Slack or Microsoft Teams

A Slack incoming webhook or a Teams workflow webhook expects its own message shape, not a CloudEvent, so put a small relay between them: an n8n, Zapier or Make flow as above, ending in a node that posts the text. For `dev.unfold.work_item.needs_you`, a Slack message could be:

```json
{
  "text": "Needs you: {{$json.data.workItem.title}} ({{$json.data.workItem.externalRef}})",
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "*Needs you:* <{{$json.data.workItem.unfoldUrl}}|{{$json.data.workItem.title}}>\n{{$json.data.reason}}" } }
  ]
}
```

Escape the title for the target format; it comes from the tracker.

## MCP Events

A person can also have their own AI client told when work moves, through the [MCP Events](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415) extension (`io.modelcontextprotocol/events`) of `unfold-mcp` over HTTP. Nobody in Settings subscribes anything: the client subscribes for the person it signed in as, and a delivery reaches only what that person may read. The extension is an open proposal, so Unfold pins it to SEP-3415 at commit [`b08e4f9d`](https://github.com/pja-ant/modelcontextprotocol/blob/b08e4f9dd684f39d846d94089487fbeb28e666f5/seps/0000-events-extension.md) and builds what [ChatGPT ships](https://developers.openai.com/plugins/build/mcp-events) first: webhook delivery only, with no poll, stream, `gap` or `terminated`. The wire format is in the [HTTP contract](../contracts/api.md#mcp-events).

Turn on the `mcp.events` flag for the people who may use it ([feature flags](feature-flags.md)). It is off by default and evaluated per person.

| Event | When | Comes from |
| --- | --- | --- |
| `work_item.needs_you` | A Work Item starts waiting on a person | `dev.unfold.work_item.needs_you` |
| `pull_request.ready` | A Work Item's pull request is ready for review | `dev.unfold.work_item.ready_for_review` |
| `run.finished` | A Run reported its Outcome, with what it cost and what its Shift spent | `dev.unfold.run.finished` and Ploeg's delivery facts |

The client picks what to follow with optional arguments: `team`, and `tenant` and `client` for a person who belongs to more than one. A subscription is refused when the person may not read that Team, Tenant or Client.

How it uses the outbox:

- **Subscriptions** are rows of the same subscription table as an administrator's, with the client's own `whsec_` secret sealed in the store like any other subscription secret. Their MCP key (person, URL, event, arguments), lifetime and delivery status sit next to them in `mcp_event_subscriptions`. Settings never lists them, and an administrator cannot change them.
- **Events.** When Unfold queues a Ploeg event for administrators, it also writes one `EventOccurrence` per MCP event type in the same transaction, and one delivery for each live subscription whose person may read the Work Item.
- **Delivery** uses the same transport: `https` only, every address checked again at connect time, no redirects, 15 seconds. Each body is the occurrence as JSON, at most 256 KiB, signed with the subscription's secret, with `webhook-id` set to the `eventId` and `X-MCP-Subscription-Id` set to the subscription id. Each delivery is an `mcp_events.delivery` job in the [job queue](background-jobs.md), so a restart resumes it. A failure is retried after 10 s, 1 min, 3 min and 10 min, with jitter, then given up. A 410 or 413 gives up that one delivery and keeps the subscription.
- **Every attempt checks the person again.** A delivery for a Work Item they can no longer read is dropped. A person who lost the Team, Tenant or Client the subscription names, or whose account is gone, loses the subscription. While their flag is off, their deliveries wait and are checked again every minute.
- **Lifetimes.** A subscription lives a day unless the client asks for another lifetime: at least one minute and at most 30 days, or no expiry for `ttlMs: null`. Expired subscriptions get nothing and are deleted within a minute; an unexpired one survives restarts.

Before a new callback URL receives anything, Unfold proves the endpoint wants it: it posts a signed `{"type": "verification", "challenge": …}` and expects the challenge back in a 2xx JSON body. A proved URL stays proved for that person for 24 hours, and at most ten challenges per minute go to one host.
