# Accept and merge

## ADDED Requirements

### Requirement: A person accepts a pull request at its head

Unfold SHALL offer **Accept and merge** on a Work Item whose pull request
waits for review, to a person who may accept it. The confirmation SHALL show
the head commit, the checks, the reviewing Run's Verdict, the spend and, for a
quoted Work Item, the Delivery Fee. Unfold MUST send the head commit the
person confirmed, and MUST refuse with 409, without calling Ploeg, when it is
not the current head in Ploeg's delivery facts.

#### Scenario: Accept with green checks

- **WHEN** a person confirms Accept and merge on a Work Item whose head is
  `abc123` and whose checks passed
- **THEN** Unfold records an Acceptance of `abc123` naming the person, channel
  and confirmation, and asks Ploeg to merge the pull request at `abc123`

#### Scenario: A push after the page loaded

- **WHEN** a person confirms Accept and merge for head `abc123` and the
  current head is `def456`
- **THEN** Unfold answers 409 "new commits since you looked", records no
  Acceptance and calls no Ploeg

#### Scenario: No permission

- **WHEN** a person who may not accept the Work Item submits Accept and merge
- **THEN** Unfold answers 403 and calls no Ploeg

### Requirement: Running checks merge when they pass

When the pull request's checks are still running, Unfold SHALL ask Ploeg to
merge when they succeed, show the Work Item as **Merging**, and offer
**Cancel merge** until the forge merges or refuses.

#### Scenario: Checks pass later

- **WHEN** a person accepts while checks run, and the checks pass
- **THEN** the forge merges, Ploeg reports the merge, the Work Item is done and
  its tracker card moves to its done status

#### Scenario: Cancel while waiting

- **WHEN** a person chooses Cancel merge on a Merging Work Item
- **THEN** Unfold asks Ploeg to cancel, the Work Item returns to In review, and
  the Acceptance is marked not merged

### Requirement: A refusal keeps the Work Item in review with its reason

When Ploeg or the forge refuses the merge, Unfold SHALL keep the Work Item in
review and show the reason: the head moved, checks failed, a conflict, a
protection rule or no permission.

#### Scenario: Checks fail after acceptance

- **WHEN** a person accepts while checks run and a required check fails
- **THEN** the Work Item shows "Checks failed" in review, and the Acceptance is
  marked not merged

### Requirement: One Acceptance per head

Unfold SHALL keep at most one Acceptance per Work Item and head commit. A forge
merge of a head accepted in Unfold SHALL complete that Acceptance; a forge
merge of a head with no Acceptance SHALL record one with channel `forge`.

#### Scenario: Merged on the forge after accepting in Unfold

- **WHEN** a person accepts `abc123` in Unfold and someone merges `abc123` on
  the forge before Ploeg does
- **THEN** Unfold holds one Acceptance of `abc123`, and a Delivery Fee is
  charged once

### Requirement: Unfold holds no forge write credential

Unfold MUST NOT merge, approve or push on a forge itself for this capability;
it SHALL only call Ploeg's merge contract.

#### Scenario: Ploeg cannot merge on this forge

- **WHEN** Ploeg reports that the Work Item's forge has no merge capability
- **THEN** Unfold hides Accept and merge and links the pull request instead
