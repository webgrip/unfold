# Notifications

## ADDED Requirements

### Requirement: Channels are registered adapters

Unfold SHALL deliver notifications only through channel adapters registered
by name in one registry. Code outside an adapter MUST NOT name a channel
vendor. An adapter SHALL be available only when the deployment configures it.

#### Scenario: A deployment configures ntfy only

- **WHEN** `notifications.ntfy` is configured and `notifications.webPush` is not
- **THEN** a person can choose ntfy, and Web Push is listed as not configured

### Requirement: Nothing is sent until a person opts in

A person SHALL receive notifications only for the triggers and channels they
chose. A person with no stored choice MUST receive nothing. While the
`notifications.push` flag is off for a person, Unfold MUST queue nothing for
them and refuse changes to their choices.

#### Scenario: A new person

- **WHEN** a Work Item needs a person who never opened the Notifications page
- **THEN** Unfold queues nothing for them

### Requirement: Recipients are scoped

Unfold SHALL notify about a Work Item only a person who can read its Team and
reaches its owner (system ADR-0017). A tool-permission request SHALL notify
only the owner of its Linked Session.

#### Scenario: Another Client's Work Item

- **WHEN** a Work Item of Client A needs a person and tenancy is enforced
- **THEN** a person with only Client B's membership is not notified

### Requirement: A notice carries no secrets, prices or client data

A notice SHALL carry a fixed sentence for its trigger, the Work Item's
number, its title with secrets masked, and a link into Unfold. It MUST NOT
carry a price, a spend figure, a Ploeg reason, a note, a question's text or a
tool's arguments. A budget notice MAY carry the share of the budget used.

#### Scenario: A budget threshold

- **WHEN** a Shift's spend crosses 80 % of its budget
- **THEN** the notice says the Work Item used 80 % of its budget and names no amount

### Requirement: Delivery is durable, retried and deduplicated

Every notice SHALL first be written to an outbox in the store. One occurrence
of a trigger SHALL produce at most one notice per person, channel and target,
also after a restart. A failed send SHALL be retried with backoff and given up
after the last attempt or 24 hours. A Web Push subscription the push service
answers 404 or 410 for SHALL be deleted.

#### Scenario: Unfold reads the same Ploeg event twice

- **WHEN** Unfold reads the same Ploeg event again after a restart
- **THEN** no second notice is queued

#### Scenario: An expired subscription

- **WHEN** the push service answers 410
- **THEN** the subscription is deleted and its pending notices are dropped

### Requirement: Quiet hours delay, never drop

A notice due inside the person's quiet hours SHALL wait until they end, in the
person's time zone.

#### Scenario: A question at night

- **WHEN** a question waits at 23:00 and quiet hours are 22:00 to 07:00
- **THEN** the notice is sent at 07:00

### Requirement: The demo sends nothing

In demo mode Unfold MUST NOT follow any source or send any notice, and its
answers MUST say it is the demo.

#### Scenario: Test notice in the demo

- **WHEN** a person asks for a test notice in the demo
- **THEN** Unfold answers that the demo sends nothing and makes no request
