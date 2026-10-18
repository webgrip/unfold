# Review walkthrough

## ADDED Requirements

### Requirement: The Work Item shows the newest Walkthrough

The Work Item page SHALL show the Walkthrough of the newest writing Run that
reported one, from the latest Shift when one there did, under the Problem and
solution card. It SHALL name the Role and Round that wrote it and say to check
it against the pull request. Without a Walkthrough the section MUST be absent.
The Walkthrough's fields are Ploeg's `outcomereport.v1` `walkthrough` as
served by the operator API (Ploeg ADR-0125); this spec does not restate them.

#### Scenario: A writing Run reported three steps with screenshots

- **WHEN** a person opens a Work Item whose writer reported three steps, each
  with a screenshot
- **THEN** "What it looks like" shows three screenshots, each with its "do" and
  "you should see" text, and "Try it yourself" lists three unticked steps

#### Scenario: A fix Round reported a new Walkthrough

- **WHEN** the Round 2 writer reports a Walkthrough after the Round 1 writer did
- **THEN** the page shows Round 2's Walkthrough and names Round 2

#### Scenario: Nothing visible changed

- **WHEN** the Walkthrough has `noVisibleChange` and no steps
- **THEN** the page shows that reason, no gallery and no checklist

#### Scenario: The screenshots predate the latest push

- **WHEN** Ploeg marks the Walkthrough stale
- **THEN** a notice above the gallery says the screenshots were taken before
  the latest push

### Requirement: Screenshots reach the browser only through Unfold

Unfold's server SHALL fetch a screenshot from Ploeg with its own credential and
serve it only to a signed-in person who may read the Work Item, with the stored
media type. A request for a Run that does not belong to the Work Item MUST
answer 404. The browser MUST NOT contact Ploeg.

#### Scenario: Someone asks for another Work Item's screenshot

- **WHEN** a person who may read Work Item 12 requests a screenshot of a Run of
  Work Item 13 through Work Item 12's route
- **THEN** Unfold answers 404 and fetches nothing from Ploeg

#### Scenario: Ploeg is unreachable

- **WHEN** Ploeg does not answer the image request
- **THEN** the step keeps its text, the image shows "Screenshot unavailable",
  and the rest of the page works

### Requirement: Ticks belong to a person and a Walkthrough

A person SHALL be able to tick and untick each step. A tick SHALL be stored per
person, Work Item and the Run that reported the Walkthrough, and SHALL survive a
reload and a restart. Another person's ticks MUST NOT change it. A newer
Walkthrough MUST start with no ticks.

#### Scenario: A person reloads the page

- **WHEN** a person ticks step 2 and reloads
- **THEN** step 2 is ticked

#### Scenario: A fix Round replaces the Walkthrough

- **WHEN** a person ticked every step of Round 1's Walkthrough and Round 2
  reports a new one
- **THEN** Round 2's steps are all unticked

### Requirement: Approve nudges and never blocks

When a person approves a Work Item whose shown Walkthrough has unticked steps,
the confirmation SHALL say how many of the steps they have not tried and offer
to approve anyway or go back. Approve MUST NOT be disabled for unticked steps.
`unfold_approve_work` SHALL include the same count in its confirmation. Going
back MUST change nothing; approving anyway MUST approve exactly as an approval
without a Walkthrough does.

#### Scenario: Two of three steps are unticked

- **WHEN** a person who ticked one of three steps presses Approve
- **THEN** the confirmation says "You haven't tried 2 of 3 steps", and "Approve
  anyway" approves the Work Item

#### Scenario: The person goes back

- **WHEN** the person chooses "Go back"
- **THEN** nothing is approved and the checklist is in view
