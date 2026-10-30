# FOCUS cost export

## ADDED Requirements

### Requirement: Each settled Run is a FOCUS row owned by its Client

The export SHALL write one FOCUS 1.4 Cost and Usage row per settled Run whose
Run finished inside the period, with `BillingAccountId` the Tenant,
`SubAccountId` the Client (or the Tenant when there is none), `ResourceId`
`unfold:run:<id>` and the Tags `unfold/workItem`, `unfold/team`,
`unfold/repository`, `unfold/tenant` and `unfold/client`. With
`granularity=work-item` it SHALL add a Work Item's Runs of one UTC day into one
row with `ResourceId` `unfold:work-item:<id>`.

#### Scenario: Two Clients

- **WHEN** an operator exports a month with `client=x`
- **THEN** only rows whose SubAccountId is `x` are written

### Requirement: Every file meets the FOCUS 1.4 column rules

Every Mandatory Cost and Usage column SHALL be present, every value SHALL have
the column's type and nullability, and every custom column SHALL start with
`x_`.

#### Scenario: CSV, JSON Lines and Parquet

- **WHEN** a month is exported as CSV, as JSON Lines and as Parquet
- **THEN** each passes the encoded FOCUS 1.4 checks, and the Parquet file holds the CSV's cells

### Requirement: Unsettled spend is never billed

A Run whose cost is not settled MUST NOT add to any cost column. It SHALL be
left out, or, with `unsettled=include`, written with every cost 0,
`x_UnfoldSpendStatus` `Unsettled` and the observed amount in
`x_UnfoldObservedCost`.

#### Scenario: A running Run

- **WHEN** a Run is still running and `unsettled=include`
- **THEN** its row has BilledCost 0 and its observed cost in `x_UnfoldObservedCost`

### Requirement: Euros only at a rate the request gives

Costs SHALL be US$ by default. `currency=EUR` MUST carry `usdToEur`; Unfold
MUST NOT look up or assume a rate, and SHALL state it in `x_UnfoldExchangeRate`.

#### Scenario: No rate

- **WHEN** a request asks for `currency=EUR` without `usdToEur`
- **THEN** Unfold answers 400 `cost_export_filter`

### Requirement: Operators and administrators, scoped, never in the demo

Only operators and administrators SHALL export, and only rows of the Teams,
Tenants and Clients they reach. Demo mode MUST answer a file without rows and
say so.

#### Scenario: A viewer

- **WHEN** a viewer requests the export
- **THEN** Unfold answers 403
