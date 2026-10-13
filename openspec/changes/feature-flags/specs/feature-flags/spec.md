# Feature flags

## ADDED Requirements

### Requirement: Every flag is registered with its lifecycle

Every flag the code evaluates SHALL be defined in `src/flag-registry.json` with
a key of the form `area.feature-name`, a flagd rule and metadata: `kind`,
`owner`, `created`, `title`, `description`, `client` and `labs`. A release or
experiment flag SHALL carry an `expires` date. `npm run check` MUST fail when a
flag is past its `expires` date, when a registered flag is evaluated nowhere,
when code evaluates an unregistered flag, or when the operations guide does
not list a flag.

#### Scenario: A release flag reaches its removal date

- **WHEN** today is later than a release flag's `expires`
- **THEN** `npm run check` fails and names the flag

### Requirement: Rules layer from code to deployment to override

A flag's effective rule SHALL be the registry's, changed field by field by the
configuration file's flagd document, then the watched flag file, then an
administrator's override. A deployment MUST NOT change a flag's metadata. A
flag the registry does not know SHALL be logged and ignored. An invalid flag
file SHALL keep the last good rules. A change to the flag file SHALL apply
without a restart.

#### Scenario: A deployment rolls a flag out

- **WHEN** the flag file sets `defaultVariant: "on"` for a Labs flag
- **THEN** every person without a Labs choice gets it on within the polling interval, and a person who chose off keeps it off

#### Scenario: The flag file is broken by an edit

- **WHEN** the flag file stops being valid JSON
- **THEN** the previous rules stay in force, the error is logged once and administrators see it in Labs

### Requirement: The server evaluates; the browser sees values only

Flags SHALL be evaluated on the server with OpenFeature's resolution reasons.
Each evaluation's context is the signed-in person's id, role, Teams, Tenant,
mode and Labs choices. `/api/bootstrap` SHALL carry only the values of flags
marked `client`. Targeting rules MUST NOT reach the browser.

#### Scenario: An unknown flag is evaluated

- **WHEN** code asks for a flag the registry does not have
- **THEN** it receives its own default value with reason `ERROR` and code `FLAG_NOT_FOUND`

### Requirement: People choose Labs flags; administrators override with a reason

Each person SHALL be able to choose on, off or default for every Labs flag, and
the choice SHALL apply to them only. An administrator SHALL be able to force a
variant for everyone with a reason, and to clear it. Every override change
SHALL be appended to an audit trail with who, when and why. Overrides SHALL
survive a restart. Only administrators MAY read every flag or set an override.

#### Scenario: An operator tries to override

- **WHEN** an operator sends an override
- **THEN** Unfold answers 403 and nothing changes

### Requirement: Exposures are recorded with OpenTelemetry's attributes

The first time a person reaches a flagged code path in a page load, the
browser SHALL record a `flag.exposed` product event with `feature_flag.key`
and `feature_flag.result.variant`.

#### Scenario: A person opens two Work Items

- **WHEN** a person opens two Work Item pages in one page load
- **THEN** one `flag.exposed` event is queued for `work.flight-profile`

### Requirement: Percentage rollouts are stable per person and match flagd

A percentage split SHALL bucket each person by flagd's algorithm: MurmurHash3 of
the flag key followed by the bucketing value, scaled by the total weight in
integers. The same person SHALL get the same variant on every evaluation and on
any flagd-compatible evaluator. Raising a share SHALL keep everyone who already
had the variant. Without a targeting key, a split SHALL serve the default.

#### Scenario: A rollout grows from 10 % to 20 %

- **WHEN** an administrator raises a split from 10 % to 20 % on
- **THEN** every person who had the flag on at 10 % still has it on

### Requirement: Administrators author rollouts that compile to flagd

An administrator SHALL be able to author, per flag, ordered rules. Each rule has
an audience (everyone, a segment, roles, Teams, people, Tenants or another
flag's variant), an optional time window, and what it serves (a variant, a
split in basis points, or a ramp between two shares over a window). Every
change SHALL be audited.

#### Scenario: Authoring is off

- **WHEN** a deployment sets `flags.console: false`
- **THEN** saving a rollout answers 409 and the Git rules stay in force

### Requirement: An authored rollout is portable flagd

A rollout SHALL compile to a plain flagd rule with segments inlined, and SHALL
be exportable as a flagd document any flagd-compatible evaluator runs.

#### Scenario: A scheduled launch

- **WHEN** a rule serves `on` to everyone from 1 November
- **THEN** people without another matching rule get the default before 1 November and `on` from then, without a release or restart

### Requirement: Unfold asks and answers OFREP

Unfold SHALL ask configured OFREP services in order before its own evaluator,
under the first-match or first-successful strategy. It caches each context's
bulk answer and revalidates it with its ETag. It stops on 401 or 403 and waits
on 429. Unfold SHALL answer OFREP bulk and single evaluations for the
signed-in person, for browser-visible flags only, with identity attributes
taken from the session.

#### Scenario: The flag service is down

- **WHEN** the strategy is first-successful and the OFREP service answers 500
- **THEN** the flag resolves from Unfold's own rules

### Requirement: Experiments read out per variant

The browser SHALL record `flag.tracked` events against the flags a person
reached, and administrators SHALL see, per variant over 30 days, the people
exposed and the share who did each tracked event.

#### Scenario: Half the people get the flight profile

- **WHEN** a split gives half the people the flight profile and they open Runs
- **THEN** the flag's readout shows people per variant and the share of each who opened a Run
