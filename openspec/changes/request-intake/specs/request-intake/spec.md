# Request intake

## ADDED Requirements

### Requirement: A delivery proves its sender before anything is stored

Unfold SHALL accept a delivery to `POST /api/intake/<source-id>` only when the
source's verifier proves it. A Standard Webhooks source MUST refuse a missing
or wrong signature and a `webhook-timestamp` more than five minutes from the
server's clock, and MUST answer a `webhook-id` it has seen with the earlier
outcome without storing anything again. A token source MUST be documented as
weaker than a signed one.

#### Scenario: A valid Standard Webhooks delivery

- **WHEN** a sender posts a payload with a valid `v1` signature and a current timestamp
- **THEN** Unfold stores one Request and answers 201

#### Scenario: A forged or stale delivery

- **WHEN** the signature does not match, or the timestamp is ten minutes old
- **THEN** Unfold answers 401 and stores nothing

#### Scenario: A replayed delivery

- **WHEN** the same `webhook-id` arrives again within 72 hours
- **THEN** Unfold answers 200 with `replayed: true` and the same Request, and stores nothing

### Requirement: The public address is rate limited before any proof is checked

Unfold SHALL limit deliveries with a token bucket per sending address and one
per source, after capping the body and before checking a signature, and MUST
answer an empty bucket with 429 and `Retry-After`.

#### Scenario: Past the burst

- **WHEN** a sender sends more deliveries than its bucket holds
- **THEN** Unfold answers 429 with `Retry-After` and checks no signature

### Requirement: Probing costs the prober

An unknown source id or a failed proof MUST cost the sending address extra
tokens, and MUST NOT cost the source's bucket more than the one token any
delivery takes.

#### Scenario: Guessing source ids

- **WHEN** an address posts to an unknown source and then sends a bad signature
- **THEN** its bucket empties after a few tries and a later valid delivery answers 429

### Requirement: The sending address behind a proxy

The sending address SHALL be the socket peer, or, when the peer is one of the
configured `trustedProxies`, the right-most `X-Forwarded-For` address that is
not a trusted proxy. Without `trustedProxies`, Unfold MUST ignore the header.

#### Scenario: Behind an ingress

- **WHEN** `trustedProxies` lists the ingress and two clients send through it
- **THEN** each client has its own bucket; without the setting they share the ingress's

### Requirement: A mapping is data, not code

A webhook source SHALL turn its payload into a Request through a registered
template or an administrator's mapping made only of JSON Pointer picks, one
bounded step per pick (each, split, join, value) and equality conditions.
Unfold MUST refuse any other mapping and MUST NOT evaluate expressions.

#### Scenario: A mapping with an expression

- **WHEN** an administrator saves a mapping whose title is `{eval: "…"}`
- **THEN** Unfold refuses it with 400 `intake_mapping`

#### Scenario: A template's documented payload

- **WHEN** a Marker.io, BugHerd, Userback, Freshdesk, Zendesk or form payload arrives at a source with that template
- **THEN** the Request carries its title, description, reporter, links, attachments as links and labels

#### Scenario: An event that is not a new Request

- **WHEN** a payload does not meet the template's conditions, such as Marker.io's `issue.updated`
- **THEN** Unfold answers 202 ignored and stores nothing

### Requirement: Email becomes a Request and replies thread onto it

An email source SHALL accept raw MIME and the documented inbound-mail JSON
shapes, prefer the text part and otherwise reduce HTML to plain text with no
markup, keep attachment names but never their contents, and add a mail whose
`In-Reply-To` or `References` names a stored message to that message's
Request. Unfold MUST NOT send email.

#### Scenario: An HTML-only mail

- **WHEN** a mail has only a `text/html` part with a script
- **THEN** the Request's description is plain text without tags or the script

#### Scenario: A reply

- **WHEN** a mail's `In-Reply-To` names the first mail's `Message-ID`
- **THEN** it is added to the first mail's Request as a message, with the quoted thread cut off

### Requirement: A Request waits for Refinement and never becomes a Run

A received Request SHALL be stored in state `new`, owned by its source's
Tenant and Client. The intake MUST NOT call Ploeg, the engine or a runtime,
and MUST NOT start a session or a Run. While `tenancy.enforce` is on, a person
SHALL read only the Requests of their Tenants, a Client user only those of
their Client, and only an Admin of a Tenant SHALL manage its sources.

#### Scenario: No Run

- **WHEN** any delivery is accepted
- **THEN** no session or Run exists afterwards

#### Scenario: A Client user

- **WHEN** a user with only the `acme` Client membership lists Requests
- **THEN** they see the Requests of `acme` and none of another Client

### Requirement: The intake is off until turned on

The intake SHALL sit behind the `intake.requests` flag, off by default. While
it is off for a source's Tenant, a delivery MUST answer 404, and the Settings
routes MUST answer 404 `intake_off`.

#### Scenario: Flag off

- **WHEN** the flag is off and a sender posts to a source
- **THEN** Unfold answers 404 and stores nothing
