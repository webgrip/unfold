# Delivery ledger

## ADDED Requirements

### Requirement: Acceptance is the earliest merge, approval or silence

For each Work Item, only pull requests with a Shift SHALL count. Acceptance
SHALL be the earliest of a merge, a person's approving review, and silent
Acceptance. A merge MUST win a tie, then an approval. A review by one of the
facts' bot logins MUST NOT count as a decision.

#### Scenario: A person approves before the merge

- **WHEN** a person approves the pull request on 4 October and it merges on
  5 October
- **THEN** the Acceptance kind is `approved`, dated 4 October

### Requirement: The hand-over stands in for ready-for-review

Ploeg records no ready-for-review moment, so the hand-over SHALL be the finish
of the Shift's last writing Run, else when the pull request opened.

#### Scenario: A fix Round

- **WHEN** a second writing Run of the Shift finishes a week after the first
- **THEN** the silence clock starts again from the second Run

### Requirement: Silence counts working days after the hand-over

Silent Acceptance SHALL fall at the UTC midnight that ends the tenth working
day after the hand-over date, when no person reviewed, merged or closed the
pull request in between. A draft pull request MUST NOT turn silent.

#### Scenario: A Friday hand-over

- **WHEN** the last writing Run finished on Friday 2 October 2026 and nobody
  decided
- **THEN** the Work Item is accepted by silence at 17 October 2026 00:00 UTC

#### Scenario: A person asks for changes

- **WHEN** a person requests changes within the ten working days
- **THEN** the Work Item does not turn silent and stays open

### Requirement: Working days are weekdays less configured dates

Working days SHALL be Monday to Friday, less the configured
`acceptanceCalendar.nonWorkingDates` (default none). The calendar is proposed
until the owner decides on holidays.

#### Scenario: A configured Wednesday

- **WHEN** 7 October 2026 is configured as non-working and the hand-over was
  on Friday 2 October
- **THEN** silent Acceptance falls at 20 October 2026 00:00 UTC

### Requirement: Work Items without Acceptance are closed or open

A Work Item without Acceptance SHALL be `closed_without_acceptance` when it is
done or withdrawn, or when every Ploeg pull request closed unmerged while the
Work Item is neither queued nor leased. Every other Work Item SHALL be `open`.

#### Scenario: Ploeg tries again after a closed pull request

- **WHEN** the only pull request closed and the Work Item is queued
- **THEN** the Work Item is `open`

### Requirement: The Token Charge base counts every attempt and only settled spend

The Token Charge base SHALL add the settled cost of every Run of the Work
Item's Shifts, failed Runs included. A Run that is still running, still holds
budget or reported no cost MUST be counted apart and never added. The ledger
only reads. A restart, retry or cancel changes no figure except through
Ploeg's facts, and nothing is charged.

#### Scenario: A Run still holds budget

- **WHEN** a finished Run still holds a budget reservation
- **THEN** its cost is in `unsettled`, not in `tokenChargeBaseUsd`

### Requirement: The ledger is read-only, Team-scoped and honest in the demo

`GET /api/ploeg/deliveries` SHALL read only the caller's Teams, answer JSON or
CSV of the same rows, and refuse an unknown window or format with 400
`ploeg_filter`. The demo MUST answer `{demo: true, window}`, or a CSV with only
the header, and Insights MUST say it is a demo and show no amounts.

#### Scenario: The demo

- **WHEN** a person opens Insights in the demo
- **THEN** the Deliveries section says "Demo · no model calls" and shows no
  amount
