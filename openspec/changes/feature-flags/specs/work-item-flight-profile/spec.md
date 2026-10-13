# Work Item flight profile

## ADDED Requirements

### Requirement: The flight profile replaces the stage strip while its flag is on

While `work.flight-profile` is on for the person, the Work Item page SHALL
draw the flight profile in place of the four-stage strip. While it is off, the
page SHALL be unchanged. The flag ships off and is offered in Labs.

#### Scenario: The flag is off

- **WHEN** a person without a Labs choice opens a Work Item
- **THEN** the page shows the four-stage strip and no flight profile

### Requirement: The route is the Work Item's own Runs

The profile SHALL draw, in order, the gate, take-off when the first Run
starts, one leg per Round whose waypoints are the Runs of each Role, the
landing at the pull request, and taxi legs for checks, the person's review,
the merge and each non-production deploy, ending at production.

#### Scenario: A pull request waits for review

- **WHEN** a Work Item's pull request is open and the Work Item awaits review
- **THEN** the landing is done and the person's review is the current position

### Requirement: Retries, fix rounds, new attempts and stops have their own shapes

Several Runs
of one Role in one Round SHALL be one waypoint with its tries shown against
Ploeg's limit (3 for agent failures, 10 for machine failures). A writer Round
after a reviewer requested changes SHALL be marked as a fix round. A later
Shift after a landing SHALL be a go-around. A Work Item that needs a person or
was withdrawn SHALL divert. A Work Item driven by a session SHALL show the
session's own steps and, while its change waits for a decision, a holding
pattern for the person.

#### Scenario: A reviewer retries after machine failures

- **WHEN** a reviewer Run failed three times with `infra_node` and a fourth is running
- **THEN** one reviewer waypoint shows three failed tries and one running try against a limit of ten, and it is the current position

### Requirement: The profile is honest and accessible

Every waypoint backed by a Run SHALL open that Run. The current position SHALL
carry the Unfold mark in its drawn, climbing orientation. The profile MUST use
no inline styles (the page's CSP forbids them), and SHALL respect reduced
motion. A step the facts do not show SHALL be drawn as not yet happened, never
as done.

#### Scenario: Ploeg sends no deploy facts

- **WHEN** the Run card carries no deployments
- **THEN** the arrival is drawn as not yet happened and says there are no deploy facts
