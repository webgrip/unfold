# Billing export

## ADDED Requirements

### Requirement: An accepted Work Item becomes exactly one line

When billing is configured and `billing.export` is on for the Work Item's
Tenant, a Work Item SHALL become one line keyed
`unfold:<tenant>:<workItemId>:acceptance` when its Acceptance is `merged`,
`approved` or `silent` and falls on or after its Client mapping's `since`
date. A second sync MUST NOT add a second line.

#### Scenario: Two syncs

- **WHEN** two syncs read the same accepted Work Item
- **THEN** the exporter received one request

### Requirement: The tool is retried only when it certainly took nothing

Unfold SHALL retry a 429, a 503 or a refused connection with growing gaps. A
timeout, a lost connection or any other 5xx MUST end in failed with
`uncertain` set, and a person MUST confirm they checked the tool before
sending the line again.

#### Scenario: Rate limited

- **WHEN** Simplicate answers 429 and then 200
- **THEN** the line is sent once, after one retry

### Requirement: A confirmed Reversal writes a credit line

A person SHALL be able to reverse a sent line within 14 days of its
Acceptance by giving a reason. Unfold then writes one credit line keyed with
`:reversal`, with quantity -1 at the same price. A line that has not been
sent yet is cancelled instead.

#### Scenario: A revert for a defect

- **WHEN** an administrator reverses a sent line five days after Acceptance
- **THEN** a credit line with quantity -1 is sent once

### Requirement: Off by default, never in the demo, scoped by Tenant

Without a `billing` block, or while the flag is off, Unfold SHALL send
nothing. The credential MUST come from the variable `tokenEnv` names. Demo
mode MUST refuse a `billing` block. Only administrators SHALL see or change
billing, and while `tenancy.enforce` is on, only for the Tenants they reach.

#### Scenario: Demo mode

- **WHEN** a demo-mode configuration has a `billing` block
- **THEN** Unfold refuses to start and names `billing`
