# Client sign-off

## ADDED Requirements

### Requirement: A Client user approves only its own Client's proposed Work Items

A user with a client membership (ADR-0017) SHALL be able to approve or reject
a Work Item that Ploeg reports as `proposed` when its Client is that user's
Client. Unfold MUST answer 404 for any other Work Item, and MUST check the
Tenant and the Client before it calls Ploeg. A rejection MUST carry a reason.

#### Scenario: A Client user approves its own proposed Work Item

- **WHEN** a user of Client A approves a proposed Work Item from one of Client
  A's sources
- **THEN** Unfold records the Client approval in Ploeg with that user as actor
  and shows the Work Item as waiting for the Agency's approval when the Agency
  requires one, or queued when it does not

#### Scenario: A Client user tries another Client's Work Item

- **WHEN** a user of Client A requests the approve route of a Work Item of
  Client B in the same Tenant
- **THEN** Unfold answers 404, makes no Ploeg call and records nothing

#### Scenario: A Work Item with no Client

- **WHEN** a Client user requests the approve route of a Work Item whose
  source has no Client
- **THEN** Unfold answers 404, because such a Work Item is invisible to every
  client user (ADR-0017)

### Requirement: An approval names its person and is safe to retry

Unfold SHALL send a Client approval to Ploeg with the user as actor, a
confirmation of the text the user agreed to (ADR-0037) and a command id. A
replayed approval MUST NOT be recorded twice, and Unfold SHALL then report
the Work Item's current state instead of an error.

#### Scenario: The approval is sent twice

- **WHEN** a Client user's approval reaches Ploeg twice, after a timeout and a
  retry
- **THEN** Ploeg records one approval, and Unfold reports the Work Item's
  current state

### Requirement: The Agency decides which approvals a Work Item needs

An Agency admin SHALL be able to set, per Client, whether its proposed Work
Items need a Client approval, an Agency approval, or both (ADR-0007). The
default SHALL be a Client approval only. Unfold SHALL name the required
approvals to Ploeg when the Work Item is proposed, and MUST NOT decide
Admission itself.

#### Scenario: The Agency requires its own approval too

- **WHEN** the Client's setting requires both approvals and only the Client
  has approved
- **THEN** the Work Item stays proposed, and Unfold shows it as waiting for the
  Agency's approval

### Requirement: The Agency may approve on the Client's behalf

An Agency user who may start work SHALL be able to record the Client approval
on the Client's behalf (ADR-0007). Unfold MUST record that it was given on
the Client's behalf and by whom, and SHALL show it so to the Agency and the
Client.

#### Scenario: The Agency approves on the Client's behalf

- **WHEN** an Agency developer records the Client approval of a proposed Work
  Item for its Client
- **THEN** Ploeg records the Client approval with the developer as actor, and
  the Work Item page says "approved by the Agency on the Client's behalf"

### Requirement: Ploeg refuses a Shift until every required approval is recorded

Unfold SHALL rely on a generic Ploeg contract, proposed in ploeg-hq, in which
Admission refuses to open a Shift while an approval the Operator Consumer
named is missing at the Work Item's current revision. Unfold MUST NOT start,
requeue or dispatch a Work Item that waits on an approval. This spec does not
restate the contract's shape.

#### Scenario: A Shift is attempted without the Client approval

- **WHEN** anything asks Ploeg to open a Shift for a proposed Work Item whose
  required Client approval is missing
- **THEN** Ploeg refuses, opens no Shift, reserves no budget and audits the
  refusal

#### Scenario: The Work Item changes after the Client approved

- **WHEN** Refinement changes a proposed Work Item's text after the Client
  approved it
- **THEN** Ploeg clears the approvals recorded against the earlier revision,
  and the Client is asked to approve again

### Requirement: Client approval needs a Ploeg that enforces it

Until the pinned Ploeg release carries required approvals, Unfold SHALL NOT
offer Client approval at all, rather than enforce it in Unfold alone.

#### Scenario: The pinned Ploeg lacks the contract

- **WHEN** Unfold runs against a Ploeg release without required approvals
- **THEN** a Client user sees no approve control, and the approve route
  answers that Client approval is unavailable

### Requirement: A Client user signs off its own Work Item's open pull request

A Client user SHALL be able to record a Client Sign-off on the open pull
request of one of its Client's Work Items: "looks good" or "needs changes",
with a note of at most 2000 characters, required for "needs changes". Unfold
MUST refuse a sign-off on a pull request that is merged, closed or not the
Work Item's own.

#### Scenario: The pull request is already merged

- **WHEN** a Client user tries to sign off a merged pull request
- **THEN** Unfold refuses and stores nothing

#### Scenario: "Needs changes" without a note

- **WHEN** a Client user submits "needs changes" with an empty note
- **THEN** Unfold refuses and asks what should change

### Requirement: A Client Sign-off is bound to the pull request's head commit

Unfold SHALL store each Client Sign-off with the person, the Client, the pull
request and the head commit from Ploeg's delivery facts
(`changedPaths.headSha`), read fresh. A sign-off request MUST name the head
the person saw; when it is not the current head, Unfold MUST refuse it and
show the current change.

#### Scenario: A Client user signs off the current head

- **WHEN** a Client user records "looks good" on the open pull request at head
  `abc1234`, and the delivery facts report `abc1234`
- **THEN** Unfold stores the Client Sign-off bound to `abc1234`

#### Scenario: The head moved while the Client was reading

- **WHEN** a Client user submits a sign-off naming `abc1234`, and the delivery
  facts now report `def5678`
- **THEN** Unfold refuses with "the change was updated; look again", stores
  nothing, and the page reloads the current change

### Requirement: A new push dismisses a Client Sign-off

When the delivery facts report a head other than the one a Client Sign-off is
bound to, Unfold SHALL mark the sign-off dismissed by that commit and MUST NOT
show it as current anywhere. A dismissed sign-off SHALL stay in the Work
Item's history, and a return to the bound commit MUST NOT revive it.

#### Scenario: An agent pushes a fix after the Client signed off

- **WHEN** the Client signed off at `abc1234` and a fix Round pushes `def5678`
- **THEN** the Work Item page and the client view show the sign-off as
  dismissed by `def5678`, and show no current Client Sign-off

#### Scenario: The branch is reset to the signed commit

- **WHEN** the head moves from `abc1234` to `def5678` and back to `abc1234`
- **THEN** the earlier sign-off stays dismissed, and the Client must sign off
  again

### Requirement: A Client Profile holds Sign-off Paths

A Client Profile SHALL hold Sign-off Paths: path globs, per repository of the
Client, that the Client may judge. With no Sign-off Paths for a repository, a
sign-off covers no path, and Unfold SHALL say so before the Client signs off.

#### Scenario: A repository has no Sign-off Paths

- **WHEN** a Client user opens the sign-off control for a repository with no
  Sign-off Paths
- **THEN** the control says the sign-off will cover no files of this change

### Requirement: A Client Sign-off reports what it covers

A Client Sign-off SHALL list which changed paths at its head match a Sign-off
Path and which do not, from the delivery facts' `changedPaths`. It covers the
whole change only when every path matches and the list is not truncated.
Unfold MUST NOT present a partial sign-off as covering the whole change.

#### Scenario: The change stays inside the Client's paths

- **WHEN** the Client's Sign-off Paths are `content/**` and `src/pages/**`,
  and every changed path matches
- **THEN** the sign-off covers the whole change

#### Scenario: The change reaches outside the Client's paths

- **WHEN** the pull request also changes `infra/deploy.yaml`
- **THEN** the sign-off covers the matching paths, lists `infra/deploy.yaml`
  as not covered, and the Agency sees it as partial

#### Scenario: The changed paths are truncated or missing

- **WHEN** the delivery facts mark `changedPaths` truncated, or carry none
- **THEN** the sign-off says which paths it covers and that the full list was
  not available, and never claims the whole change

### Requirement: A Client Sign-off is input to the Agency's Acceptance

A Client Sign-off MUST NOT be Acceptance, a Review or a Verdict. It SHALL NOT
merge, approve in the forge, change Ploeg state, start a Run or charge a
Delivery Fee. Unfold SHALL show it to the Agency's reviewer as input to their
decision against the Acceptance Conditions (ADR-0007, R22). Any further weight
waits for the owner.

#### Scenario: The Client says it looks good

- **WHEN** a Client records "looks good" on a pull request
- **THEN** the pull request stays open and unapproved in the forge, the Work
  Item's state is unchanged, and the Agency's reviewer sees the sign-off on
  the Work Item page

#### Scenario: The Client asks for changes

- **WHEN** a Client records "needs changes" with a note
- **THEN** no Run starts and nothing is requeued; the Agency decides whether
  the note is a defect against the Acceptance Conditions or a new wish that
  becomes a new Work Item

### Requirement: Unfold writes the Client Sign-off into the pull request behind a flag

When the flag `client.verdict-comment` is on for the Work Item's Team, Unfold
SHALL keep one comment with key `client-verdict` on the open pull request
through Ploeg's keyed pull request comment (Ploeg ADR-0079). It SHALL name
the Client, the answer, the bound head and the coverage, and say the Agency
decides Acceptance. With the flag off, Unfold writes no comment.

#### Scenario: The flag is on

- **WHEN** a Client signs off and the Team has `client.verdict-comment` on
- **THEN** the pull request carries one `client-verdict` comment with the
  Client, the answer, the head commit and the coverage

#### Scenario: A push dismisses the sign-off

- **WHEN** a new push dismisses the sign-off the comment shows
- **THEN** Unfold rewrites the comment to say a newer commit dismissed it

### Requirement: The sign-off comment carries no person and no money

The `client-verdict` comment MUST NOT name the Client's person, quote a price
or carry Unfold's charges, because everyone with forge access reads it.

#### Scenario: The comment is written

- **WHEN** Unfold writes the comment for a sign-off by a named Client user
- **THEN** it names the Client only, with no person, price or spend

### Requirement: The sign-off comment survives restart and failure

A comment write whose text did not change SHALL be skipped. A failed write
SHALL be logged and tried again on the next change, never in a loop, and MUST
NOT undo the stored sign-off.

#### Scenario: Unfold restarts after the comment was written

- **WHEN** Unfold restarts and reads the same stored sign-off and head
- **THEN** the keyed comment is replaced with the same text or skipped, and no
  second comment appears

#### Scenario: Ploeg cannot write the comment

- **WHEN** Ploeg answers the comment write with an error
- **THEN** the Client Sign-off stays stored and shown in Unfold, and the
  failure is logged once

### Requirement: The client view lists a Client's own work, read-only

A Client user SHALL have a client view listing only its Client's Work Items:
title, state in plain words, the Agency's price from the Quote when one
exists, pull request status, the current or dismissed Client Sign-off and the
preview link when one exists. It SHALL be read-only apart from the approve
and sign-off controls. The Agency's brand SHALL come first.

#### Scenario: A Client user opens the client view

- **WHEN** a user of Client A opens the client view
- **THEN** it lists Client A's Work Items with their prices and sign-offs,
  and no other Client's Work Item appears

### Requirement: The client view hides Unfold's charge and the Agency's people

The client view MUST NOT show the Token Charge, the Delivery Fee in Credits,
spend in US dollars, models, prompts, transcripts, diffs, operator notes or a
named Agency person's history (R18), unless the Agency chooses to show
Unfold's charge.

#### Scenario: A Work Item has spend but no price

- **WHEN** a Work Item's Shift has spent US$1.20 and no Quote exists
- **THEN** the client view shows "no price agreed yet" and no spend figure

### Requirement: A signed preview link opens one preview for one Client

When a pull request has a Preview Environment (ADR-0008), the client view
SHALL offer a link signed by Unfold that names one preview and one Client and
expires when the preview is deleted or idles out. It MUST reveal nothing but
that preview. Until previews exist, no link is offered.

#### Scenario: The preview was deleted

- **WHEN** someone opens a signed link after its pull request merged and the
  preview was deleted
- **THEN** Unfold answers that the preview has ended and reveals no other
  Work Item

#### Scenario: A tampered link

- **WHEN** a link's Client, preview or expiry was altered
- **THEN** the signature check fails and Unfold answers 404

### Requirement: Unfold never sends a link or a question to a Client

Unfold MUST NOT send a preview link, a sign-off request or a question to a
Client by any channel (ADR-0007, R15). The Client finds them in the client
view, or the Agency passes them on.

#### Scenario: A preview becomes available

- **WHEN** a Work Item's Preview Environment is posted
- **THEN** the link appears in the client view and on the Agency's Work Item
  page, and Unfold sends no email, chat or forge mention to the Client
