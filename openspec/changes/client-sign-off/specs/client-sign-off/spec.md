# Client sign-off

## ADDED Requirements

### Requirement: Each Client has one Approver

Each Client SHALL have one Approver: the party whose approval a proposed Work
Item of that Client needs. The Approver SHALL be the Client unless the Agency
sets it, per Client, to the Agency itself or to another party that sits in
front of the work and pays for it, such as a main contractor or a reseller.
Unfold SHALL name the Approver's approval to Ploeg as `approver` and MUST NOT
tell Ploeg who the Approver is.

#### Scenario: A new Client

- **WHEN** an Agency adds a Client and sets no Approver
- **THEN** the Client is its own Approver, and its users see the approve
  control on its proposed Work Items

#### Scenario: The Agency is the Approver

- **WHEN** the Agency sets itself as the Approver of a Client
- **THEN** an Agency user who may start work approves that Client's proposed
  Work Items, and the Client's users see them as waiting on the Agency

#### Scenario: A main contractor is the Approver

- **WHEN** the Agency sets a main contractor as the Approver of a Client
- **THEN** the main contractor's users approve that Client's proposed Work
  Items, and the Client's own users see no approve control

### Requirement: The Approver approves only its own Client's proposed Work Items

A user of a Client's Approver (ADR-0017 memberships) SHALL be able to approve
or reject a Work Item that Ploeg reports as `proposed` when its Client is that
Approver's Client. Unfold MUST answer 404 for any other Work Item, and MUST check the
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
Items need the Approver's approval, an Agency approval as well, or both
(ADR-0007). The default SHALL be the Approver's approval only. Unfold SHALL name the required
approvals to Ploeg when the Work Item is proposed, and MUST NOT decide
Admission itself.

#### Scenario: The Agency requires its own approval too

- **WHEN** the Client's setting requires both approvals and only the
  Approver has approved
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

### Requirement: A Client Sign-off covers the whole change unless the Agency excludes paths

The Sign-off Paths of a Client Sign-off SHALL be every path the pull request
changes at its head, from the delivery facts' `changedPaths`, minus the paths
that match an exclusion glob the Agency set for that Client and repository in
the Client Profile. With no exclusion globs, a sign-off covers the whole
change, and Unfold SHALL need no setup for it.

#### Scenario: No exclusions are set

- **WHEN** a Client signs off a pull request in a repository with no
  exclusion globs, and the changed paths are not truncated
- **THEN** the sign-off covers the whole change

#### Scenario: The Agency excludes infrastructure

- **WHEN** the Agency's exclusion globs for the repository are `infra/**`,
  and the pull request changes `src/pages/home.tsx` and `infra/deploy.yaml`
- **THEN** the sign-off covers `src/pages/home.tsx`, lists
  `infra/deploy.yaml` as excluded, and the Agency sees it as partial

### Requirement: A repository file may propose exclusions, and the Client Profile wins

Unfold SHALL read exclusion globs from a file in the repository at the pull
request's head, such as `.unfold/sign-off.yml`, when the Agency turns that on.
The file SHALL hold globs only; Unfold MUST ignore anything in it that names a
Client or a person. A path the Client Profile keeps SHALL stay covered even
when the file excludes it.

#### Scenario: The file excludes generated files

- **WHEN** the file excludes `dist/**` and the Client Profile sets nothing
- **THEN** a changed path under `dist/` is listed as excluded

#### Scenario: The file and the Client Profile disagree

- **WHEN** the file excludes `content/**` and the Client Profile keeps
  `content/**`
- **THEN** changed paths under `content/` stay covered by the sign-off

### Requirement: A Client Sign-off reports what it covers

A Client Sign-off SHALL list which changed paths at its head it covers and
which were excluded, and SHALL store that scope with the sign-off. It covers
the whole change only when nothing was excluded and the list is not
truncated. Unfold MUST NOT present a partial sign-off as covering the whole
change.

#### Scenario: The changed paths are truncated or missing

- **WHEN** the delivery facts mark `changedPaths` truncated, or carry none
- **THEN** the sign-off says which paths it covers and that the full list was
  not available, and never claims the whole change

#### Scenario: The exclusions change after the sign-off

- **WHEN** the Agency adds an exclusion glob after a Client signed off
- **THEN** the stored sign-off keeps the scope it was given, and the next
  sign-off uses the new globs

### Requirement: An Agency may enforce a current Sign-off through a commit status

When the pinned Ploeg offers a generic keyed commit status contract and the
Agency turns it on, Unfold SHALL keep a commit status with context
`client-sign-off` on the pull request's head: success for a current "looks
good" sign-off, failure for "needs changes", pending otherwise. The Agency MAY
make it required in its branch protection. This requirement waits on that
Ploeg contract.

#### Scenario: A push dismisses the sign-off

- **WHEN** the commit status is on and a new push dismisses the sign-off
- **THEN** the new head carries a pending `client-sign-off` status

#### Scenario: The pinned Ploeg lacks the contract

- **WHEN** Unfold runs against a Ploeg without keyed commit statuses
- **THEN** Unfold writes no status and says the enforcement is unavailable

### Requirement: Agency people record a Sign-off until Client memberships exist

Until Client memberships (ADR-0017) are enforced, only a user with the
`admin` or `operator` role SHALL record or withdraw a Client Sign-off, which
is then recorded on the Client's behalf. A viewer MUST be refused. The record
SHALL name the person and whether Unfold proved who they were.

#### Scenario: A viewer tries to sign off

- **WHEN** a viewer submits a Client Sign-off
- **THEN** Unfold answers 403 and stores nothing

#### Scenario: An operator withdraws a Sign-off

- **WHEN** an operator withdraws the current Client Sign-off of a pull request
- **THEN** the sign-off is marked withdrawn with the person and time, stays in
  the history, and the pull request comment says no sign-off is current

### Requirement: A Client Sign-off is input to the Agency's Acceptance

A Client Sign-off MUST NOT be Acceptance, a Review or a Verdict. It SHALL NOT
merge, approve in the forge, change Ploeg state, start a Run or charge a
Delivery Fee. Unfold SHALL show it to the Agency's reviewer as input to their
decision against the Acceptance Conditions (ADR-0007, R22). A per-Agency
option to require a current sign-off before Acceptance is proposed and is not
part of this requirement.

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

When the flag `client.sign-off-comment` is on for the Work Item's Team, Unfold
SHALL keep one comment with key `client-sign-off` on the open pull request
through Ploeg's keyed pull request comment (Ploeg ADR-0079). It SHALL name
the Client, the answer, the bound head and the coverage, and say the Agency
decides Acceptance. With the flag off, Unfold writes no comment.

#### Scenario: The flag is on

- **WHEN** a Client signs off and the Team has `client.sign-off-comment` on
- **THEN** the pull request carries one `client-sign-off` comment with the
  Client, the answer, the head commit and the coverage

#### Scenario: A push dismisses the sign-off

- **WHEN** a new push dismisses the sign-off the comment shows
- **THEN** Unfold rewrites the comment to say a newer commit dismissed it

### Requirement: The sign-off comment carries no person and no money

The `client-sign-off` comment MUST NOT name the Client's person, quote a price
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
and sign-off controls.

#### Scenario: A Client user opens the client view

- **WHEN** a user of Client A opens the client view
- **THEN** it lists Client A's Work Items with their prices and sign-offs,
  and no other Client's Work Item appears

### Requirement: The client view shows the Agency's brand and English copy

The client view SHALL show the Agency's brand first. Its copy SHALL be English
until translations exist; then the Client Profile SHALL set each Client's
default language. The Agency MAY override the copy.

#### Scenario: A Client user opens the client view before translations exist

- **WHEN** a user of a Dutch Client opens the client view
- **THEN** it shows the Agency's brand first and English copy

#### Scenario: The Agency rewrites the "Agency decides" line

- **WHEN** the Agency overrides the line that says it decides Acceptance
- **THEN** the client view shows the Agency's wording in place of the
  default English copy

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
