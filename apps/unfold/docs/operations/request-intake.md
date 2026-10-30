---
type: how-to
audience: [owner, operator, contributor]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/request-intake: src/intake/ (service.ts, routes.ts, mapping.ts, templates.ts, signatures.ts, mail.ts), the intake route block in src/http.ts and public/views/intake.js; test/intake.test.ts and test/api-intake.test.ts passed, including the Standard Webhooks specification's own example signature. Vendor payloads were read on 2026-10-30 from the documentation each template cites; no live Marker.io, BugHerd, Userback, Freshdesk, Zendesk, Postmark or mail server was called."
---

# Receive Requests from feedback tools, forms and email

A **Request** is a Client's ask as it arrives, before **Refinement** turns it into Work Items ([glossary](../../../../docs/reference/glossary.md)). Unfold receives Requests through one signed endpoint, `POST /api/intake/<source-id>`, instead of one integration per feedback tool. Each **intake source** belongs to one Tenant and optionally one Client, has its own secret, and turns what its sender posts into a Request with a mapping template.

A Request waits as `new` for Refinement. It is never dispatched and never starts a Run: the intake has no Ploeg client, no engine and no runtime, and a test checks its imports. Unfold never writes back to the sender or the Client, so it never sends email ([Who Unfold is for](../../../../docs/concepts/who-unfold-is-for.md)).

The intake follows system ADR-0050, which [pull request #697](https://forgejo.webgrip.dev/webgrip/unfold/pulls/697) adds: signed deliveries use [Standard Webhooks](https://www.standardwebhooks.com/), templates and verifiers are registries looked up by name, and a mapping is data, not code.

## Turn it on

The `intake.requests` flag is off by default ([Feature flags](feature-flags.md)). While it is off, every source answers 404 and the Settings page is hidden. Turn it on for everyone, or per Tenant: a delivery is evaluated with `tenantId` set to its source's Tenant, and Settings with the signed-in person's context.

```json
{ "flags": { "intake.requests": { "defaultVariant": "on" } } }
```

## Add a source

An administrator adds sources under **Settings → Request intake**, or through the API ([API contract](../contracts/api.md#request-intake)). A source has:

| Field | Meaning |
| --- | --- |
| `id` | Part of the delivery address `https://<unfold>/api/intake/<id>`: 2 to 63 lower-case letters, digits and hyphens |
| `kind` | `webhook` (a JSON payload read through a template) or `email` |
| `tenant`, `client` | Who owns its Requests. While `tenancy.enforce` is on, only an Admin of that Tenant manages the source, and only that Tenant's members and that Client's users read its Requests |
| `template` | For a webhook: a template id from the table below, or `custom` with your own `mapping` |
| `verifier` | How a delivery proves its sender: `standard-webhooks`, `hub-signature-256`, `zendesk` or `token`. Defaults to the template's |
| `secret` | Leave it empty and Unfold makes one, which it shows once. A sender that signs with its own secret (Zendesk, Marker.io) needs that secret pasted here |
| `address`, `senders` | For email: the address your mail provider forwards to this source (for display), and the domains or addresses accepted. Empty `senders` accepts everyone |

Unfold stores the secret encrypted in its store. **New secret** replaces it; the old one stops working at once.

## Verify a sender

### Standard Webhooks (recommended)

A sender signs `<webhook-id>.<webhook-timestamp>.<body>` with HMAC-SHA256 and the base64-decoded part of the `whsec_` secret, and sends three headers: `webhook-id`, `webhook-timestamp` (Unix seconds) and `webhook-signature` (`v1,<base64>`, several separated by spaces while a secret rotates). A `whpk_` secret holds an ed25519 public key and accepts `v1a` signatures. Unfold refuses a timestamp more than five minutes from its clock (401 `timestamp_outside_window`) and answers a `webhook-id` it saw in the last 72 hours with 200 `replayed: true` and the same Request, without storing anything again.

Signing a delivery from Node.js, for a form handler, a script or an n8n Code node:

```js
import { createHmac, randomUUID } from 'node:crypto';

const secret = process.env.UNFOLD_INTAKE_SECRET;
const body = JSON.stringify({ id: 'form-123', title: 'The checkout button does nothing', reporter: { email: 'jane@example.com' } });
const id = `msg_${randomUUID()}`;
const timestamp = Math.floor(Date.now() / 1000);
const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');

await fetch('https://unfold.example/api/intake/site-form', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}` },
  body,
});
```

The same from a shell:

```sh
id="msg_$(uuidgen)"; ts=$(date +%s); body='{"title":"Hello"}'
key=$(printf %s "${UNFOLD_INTAKE_SECRET#whsec_}" | base64 -d | xxd -p -c 256)
sig=$(printf %s "$id.$ts.$body" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$key" -binary | base64)
curl -sS https://unfold.example/api/intake/site-form -H 'content-type: application/json' \
  -H "webhook-id: $id" -H "webhook-timestamp: $ts" -H "webhook-signature: v1,$sig" -d "$body"
```

Any [Standard Webhooks library](https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries) produces the same headers.

### A vendor's own signature

* `hub-signature-256`: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the body>`, as Marker.io sends it. It carries no timestamp, so it has no replay window.
* `zendesk`: `X-Zendesk-Webhook-Signature`, base64 HMAC-SHA256 of the `X-Zendesk-Webhook-Signature-Timestamp` value followed by the body ([Zendesk](https://developer.zendesk.com/documentation/webhooks/verifying/)). The timestamp must be within five minutes.

### Token, the weaker mode

For a sender that cannot sign, the `token` verifier accepts the source's token in, from strongest to weakest: an `X-Unfold-Intake-Token` header, `Authorization: Bearer <token>`, the password of HTTP Basic auth (Postmark's inbound webhook offers only this), or `?token=` in the URL. A token proves only that the sender knows it: anyone who reads it from a log can replay or forge deliveries, and a query token ends up in proxy and access logs. Use it only when the sender offers nothing else, keep the address HTTPS, and rotate the token if it leaks.

Without a delivery id there is no replay check, so every token and vendor-signed source also deduplicates on the Request's external id: a second delivery with the same id answers 200 `outcome: duplicate` and changes nothing. Updates from the sender are not applied to a stored Request.

## Answers

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{outcome: "created", request}` | A new Request |
| 200 | `{outcome: "threaded", request}` | An email reply added to its Request |
| 200 | `{outcome: "duplicate", request}` or `{replayed: true, …}` | Seen before; nothing stored |
| 202 | `{outcome: "ignored", reason}` | Accepted but not a Request: an event the template skips (`not_a_new_request`) or a sender not allowed (`sender_not_allowed`) |
| 401 | `signature_missing`, `signature_invalid`, `timestamp_outside_window` | Not proven |
| 404 | `not_found` | No such source, or the flag is off for its Tenant |
| 413, 415, 400, 422 | `body_too_large` (over 5 MiB), `content_type`, `invalid_json`, `intake_no_title` | The payload cannot become a Request |

The answer never echoes the payload.

## Templates

A template maps a payload with [JSON Pointers](https://www.rfc-editor.org/rfc/rfc6901) to the Request's title, description, reporter name and email, external id, links, attachments (kept as links) and labels. Only `http` and `https` links are kept. **Check** says how each was verified on 2026-10-30.

| Template | Verifier | Check | Sender documentation |
| --- | --- | --- | --- |
| `marker-io` Marker.io | `hub-signature-256` | Verified against docs, except the element shape of `data.attachments`, which is not read | [Webhooks integration](https://help.marker.io/en/articles/3738778-webhooks-integration) |
| `bugherd` BugHerd | `token` (`?token=`) | Verified against the OpenAPI document | [API](https://docs.bugherd.com/api), [openapi.yaml](https://docs.bugherd.com/api/openapi.yaml) |
| `userback` Userback | `token` (`?token=`) | Verified against docs | [Webhooks](https://docs.userback.io/docs/webhooks) |
| `freshdesk` Freshdesk | `token` (header) | Partly: placeholders documented, the body is Unfold's proposal, the tag separator and JSON escaping are not checked live | [Placeholders](https://support.freshdesk.com/support/solutions/articles/52630), [Trigger webhook](https://support.freshdesk.com/en/support/solutions/articles/132589) |
| `zendesk` Zendesk | `zendesk` | Partly: placeholders and signature documented, the body is Unfold's proposal, the tag separator and JSON escaping are not checked live | [Placeholders](https://support.zendesk.com/hc/en-us/articles/4408886858138), [Verifying](https://developer.zendesk.com/documentation/webhooks/verifying/) |
| `form` Plain form or n8n | `standard-webhooks` | Unfold's own shape | This page |

`GET /api/intake/templates` lists every template with its full mapping and sender body.

### Marker.io

Add a workspace webhook for `issue.created`; other events answer 202 ignored. Paste its secret into the source.

| Request | Pointer |
| --- | --- |
| title, description | `/data/title`, `/data/description` |
| reporter | `/data/reporter/name`, `/data/reporter/email` |
| external id | `/data/id` |
| links | `/data/website/url`, `/data/publicUrl` |
| attachments | `/data/screenshotUrl` |
| labels | `/data/issueType/name`, `/data/priority` (Marker.io has no labels field) |

### BugHerd

Register a webhook for `task_create` with `target_url` set to the source's address plus `?token=<token>`: BugHerd neither signs nor sends custom headers.

| Request | Pointer |
| --- | --- |
| title, description | `/task/title`, `/task/description` |
| reporter | `/task/requester/display_name`, `/task/requester_email` |
| external id | `/task/id` (BugHerd's `external_id` is a field for your own reference) |
| links | `/task/site` joined with `/task/url`, `/task/site`, `/task/secret_link` |
| attachments | `/task/screenshot_url`, `/task/attachments` |
| labels | `/task/tag_names` |

### Userback

Add a webhook with the source's address plus `?token=<token>`. Only `action: create` with `type: feedback` becomes a Request.

| Request | Pointer |
| --- | --- |
| title, description | `/data/title`, `/data/description` |
| reporter | `/data/name`, `/data/email` |
| external id | `/data/id` |
| links | `/data/page`, `/data/share_url` |
| attachments | each `/url` of `/data/screenshot`, `/data/attachment`, `/data/video` |
| labels | `/data/category` split on commas, `/data/feedback_type` |

### Freshdesk

Under Admin → Workflows → Automations → Ticket Creation, add a rule with the **Trigger webhook** action: method POST, the source's address, encoding JSON, Advanced content, the custom header `X-Unfold-Intake-Token: <token>`, and this body:

```json
{"source":"freshdesk","ticket":{"id":"{{ticket.id}}","subject":"{{ticket.subject}}","description":"{{ticket.description_text}}","url":"{{ticket.url}}","portal_url":"{{ticket.portal_url}}","requester":{"name":"{{ticket.requester.name}}","email":"{{ticket.requester.email}}"},"tags":"{{ticket.tags}}","type":"{{ticket.ticket_type}}"}}
```

Freshdesk has no attachment placeholder. Labels are `/ticket/tags` split on commas and `/ticket/type`. Send one test ticket with quotes and line breaks in its description: if Freshdesk does not escape placeholders, the body is not valid JSON and Unfold answers 400 `invalid_json`.

### Zendesk

Create a webhook (request format JSON, method POST) to the source's address, connect it to a trigger on ticket creation, and use this body. Paste the webhook's signing secret into the source.

```json
{"source":"zendesk","ticket":{"id":"{{ticket.id}}","title":"{{ticket.title}}","description":"{{ticket.latest_comment}}","link":"{{ticket.link}}","requester":{"name":"{{ticket.requester.name}}","email":"{{ticket.requester.email}}"},"tags":"{{ticket.tags}}"}}
```

Labels are `/ticket/tags` split on spaces. Zendesk's event-subscription webhooks (`zen:event-type:ticket.created`) carry no requester name or email, so this template reads the trigger body instead. Zendesk's test send during setup uses a fixed test secret and fails verification; test with a real ticket.

### Plain form or n8n

Post `{id, title, description, reporter: {name, email}, links, attachments, labels}`, each a text or a list of texts, signed as a Standard Webhook. In n8n, compute the signature in a Code node with the snippet above and send it from an HTTP Request node.

### Your own mapping

With `template: "custom"`, `mapping` is `{when?, fields}`. `when` lists conditions `{pointer, equals}` that must all hold; otherwise the delivery is acknowledged and ignored. Each field is a pick:

* `"/a/b"`: the value at a JSON Pointer. A list gives each of its texts.
* `{"pointer": "/list", "each": "/url"}`: the value at `/url` inside each element of a list.
* `{"pointer": "/tags", "split": ","}`: a text split into several.
* `{"join": ["/site", "/path"], "separator": ""}`: up to four values joined into one.
* `{"value": "portal"}`: a fixed text, such as a label.

`title` is required; `links`, `attachments` and `labels` take a list of picks. Nothing else is accepted: there is no expression, function or loop, a mapping reads at most one level of list elements, and Unfold refuses anything else with 400 `intake_mapping`.

## Inbound email

An `email` source receives mail your mail provider or MTA posts to it. Unfold accepts:

* **Raw MIME**, `Content-Type: message/rfc822`: the message exactly as received. A [Cloudflare Email Worker](https://developers.cloudflare.com/email-routing/email-workers/runtime-api/) can post `message.raw`; Postfix can pipe to `curl --data-binary @- -H 'content-type: message/rfc822'`.
* **Postmark's inbound webhook** JSON ([Postmark](https://postmarkapp.com/developer/webhooks/inbound-webhook)). Postmark does not sign, so use the `token` verifier with the token as the Basic auth password in the webhook URL.
* **A JSON wrapper** `{raw}` (or `mime`, `email`) holding the raw message, or `{from, subject, text, html, messageId, inReplyTo, references, attachments}`, for any relay you write.

SendGrid Inbound Parse and Mailgun routes post `multipart/form-data`, which Unfold does not read; relay them through one of the shapes above, preferably raw MIME. Sign the relay as a Standard Webhook.

Unfold reads the subject, the sender, the text body (a `text/plain` part when there is one, otherwise the HTML turned into plain text with scripts, styles and every tag removed), the `Message-ID`, `In-Reply-To` and `References`, and the names of attachments. Attachment contents are never stored. A mail whose `In-Reply-To` or `References` names a message Unfold already holds is added to that Request as a message, with the quoted thread (`On … wrote:`, `Op … schreef …:` and `>` lines) cut off; any other mail is a new Request. A `Message-ID` seen before answers `duplicate`.

### Why a webhook and not an IMAP poller

Every mail provider and MTA can already post a received message to a URL, and doing so needs no mailbox password in Unfold, no polling loop, no IMAP state to resume after a restart, and no second way in that bypasses the signature check. An IMAP poller would be one more long-running connection per mailbox, with credentials Unfold would have to keep, for a feature a ten-line relay already covers. Unfold has none, and sends no mail either: it has no SMTP client.

## Where Requests show

**Settings → Request intake** lists the sources and the 50 most recently changed Requests. `GET /api/intake/requests` lists the Requests the caller reaches, newest change first. Refinement, the step that turns a Request into Work Items, is not built yet. The Requests are not in a Tenant export yet, because there is no Tenant export.
