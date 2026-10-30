---
type: how-to
audience: [owner, operator, integrator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/focus-cost-export, Parquet added on feat/focus-parquet-export: src/focus-export.ts, the /api/ploeg/cost-export route in src/http.ts and the Insights button in public/ploeg-activity.js. test/focus-export.test.ts checks every exported file against the FOCUS 1.4 Cost and Usage column table and rules, read on 2026-10-30 from tag v1.4 (commit f1eeb30, 2026-06-05) of github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec and from focus.finops.org/docs/specification/v1-4/. The Parquet tests read every written file back with hyparquet and compare it with the CSV; a written file was also read with pyarrow and DuckDB by hand on 2026-10-30. Not loaded into a FinOps tool, and not run through the FinOps Foundation's focus-validator."
---

# Export AI cost per Client (FinOps FOCUS)

Unfold can write the model cost of your agents' work as a [FinOps FOCUS](https://focus.finops.org/) 1.4 file. FOCUS is the open format FinOps tools read for cloud bills, so you can load your AI spend next to your cloud spend and charge it back to each Client. One row is one Run's model usage on one day, or one Work Item's usage on one day, with the Client and Tenant it belongs to.

The export is figures, not a charge. Unfold sends nothing anywhere: you download the file, or a tool fetches it from the API.

## Who can export

Operators and administrators. A viewer gets 403. The rows cover only the Teams your account reaches in Ploeg, and, while `tenancy.enforce` is on, only the Tenants and Clients your memberships reach, the same as the Deliveries ledger on Insights. In demo mode the export has no rows: the demo makes no model calls, so it has no cost. The file says so in the `X-Unfold-Demo: true` header.

## Download it from Insights

Open **Insights**. The **Deliveries** section has **Download FOCUS cost** next to **Download CSV**. It downloads this calendar month's settled cost per Run, in US$, as CSV. For another period, Client, currency or format, use the API.

## Fetch it from the API

```sh
curl -H "Cookie: …" "https://unfold.example/api/ploeg/cost-export?month=2026-10&client=acme&format=csv" -o acme-2026-10.csv
```

| Parameter | Values | Default |
| --- | --- | --- |
| `month` | A UTC calendar month, `YYYY-MM` | The current month |
| `from`, `to` | UTC dates `YYYY-MM-DD`; `from` is included, `to` is not; at most 366 days | Instead of `month` |
| `tenant`, `client` | Keep only one Tenant's or one Client's rows | All you reach |
| `granularity` | `run`: one row per Run. `work-item`: one row per Work Item per day | `run` |
| `unsettled` | `exclude` or `include` (see below) | `exclude` |
| `currency` | `USD` or `EUR` | `USD` |
| `usdToEur` | The euros one US dollar buys, such as `0.9210`. Required with `currency=EUR` | None |
| `provider` | The model provider, such as `Anthropic`, when you know all usage went there | `unknown` |
| `format` | `csv`, `jsonl` or `parquet` | `csv` |

A wrong value answers 400 `cost_export_filter` with the reason. The [API contract](../contracts/api.md) and [OpenAPI document](../contracts/openapi.yaml) describe the route.

The response headers say what the file leaves out:

| Header | Meaning |
| --- | --- |
| `X-Unfold-Focus-Version` | `1.4` |
| `X-Unfold-Unsettled-Runs` | Runs in the period whose cost is not settled yet |
| `X-Unfold-Unreported-Runs` | Runs that finished without reporting a cost. They have no row |
| `X-Unfold-Unowned-Work-Items` | Work Items whose repository is registered to more than one owner. They have no row |
| `X-Unfold-Truncated` | `true` when Unfold stopped after 1000 Work Items with activity since the period began. Export a shorter period |

## How Unfold fills the FOCUS columns

| FOCUS column | Value |
| --- | --- |
| `BillingAccountId`, `BillingAccountName` | The Tenant |
| `SubAccountId`, `SubAccountName` | The Client, or the Tenant when the repository names no Client |
| `SubAccountType` | `Client` or `Tenant` |
| `ResourceId` | `unfold:run:<id>` per Run, `unfold:work-item:<id>` per Work Item |
| `ResourceName`, `ResourceType` | The Work Item title, or null for a Run, which has no name; `Run` or `Work Item` |
| `Tags` | `unfold/workItem`, `unfold/team`, `unfold/repository`, `unfold/tenant` and, when there is one, `unfold/client` |
| `ChargeCategory`, `ChargeFrequency` | `Usage`, `Usage-Based` |
| `ChargeClass` | Always null: no row corrects a closed billing period |
| `ChargePeriodStart`, `ChargePeriodEnd` | The UTC day the Run finished, start included and end excluded |
| `BillingPeriodStart`, `BillingPeriodEnd` | That day's calendar month |
| `BilledCost`, `EffectiveCost`, `ListCost`, `ContractedCost` | The settled cost, all four the same: Unfold knows no list price, discount or commitment |
| `BillingCurrency` | `USD`, or `EUR` with `currency=EUR` |
| `PricingCurrency`, `PricingCurrencyEffectiveCost` | `USD` and the cost in US$, as the model gateway recorded it |
| `ServiceName`, `ServiceCategory`, `ServiceSubcategory` | `Model usage`, `AI and Machine Learning`, `Generative AI` |
| `ServiceProviderName`, `HostProviderName`, `InvoiceIssuerName` | The `provider` parameter, else `unknown` |
| `ConsumedQuantity`, `ConsumedUnit`, `PricingQuantity`, `PricingUnit` | Null. FOCUS allows a quantity only next to a `SkuPriceId` from the provider's price list. Ploeg records no model or price id per Run, so Unfold writes tokens to `x_` columns instead |

Unfold's own columns start with `x_Unfold`, as FOCUS requires of custom columns:

| Column | Value |
| --- | --- |
| `x_UnfoldSpendStatus` | `Settled` or `Unsettled` |
| `x_UnfoldObservedCost` | For an unsettled row, the cost seen so far, in the billing currency; otherwise null |
| `x_UnfoldExchangeRate` | The `usdToEur` rate the request gave; null in US$ |
| `x_UnfoldWorkItemId`, `x_UnfoldExternalReference` | The Work Item and its ticket, such as `VIK-41` |
| `x_UnfoldRunId`, `x_UnfoldRunCount` | The Run (null on a Work Item row) and how many Runs the row adds |
| `x_UnfoldInputTokens`, `x_UnfoldOutputTokens`, `x_UnfoldCacheReadInputTokens`, `x_UnfoldCacheCreationInputTokens` | Token counts. On a Work Item row a count is null when any of its Runs did not report it |

## Unsettled spend is never billed

A Run's cost settles once it finished and holds no budget. Before that it is unsettled ([delivery economics](../contracts/api.md)). FOCUS says `BilledCost` holds only amounts as invoiced, never estimates, and its `ChargeClass` marks nothing but corrections. So Unfold never puts unsettled spend in a cost column:

- `unsettled=exclude`, the default, leaves those Runs out. `X-Unfold-Unsettled-Runs` counts them.
- `unsettled=include` writes them with every cost column 0, `x_UnfoldSpendStatus` `Unsettled` and the amount seen so far in `x_UnfoldObservedCost`. A FinOps tool that adds `BilledCost` adds nothing for them.

## Euros

Costs are recorded in US$. With `currency=EUR&usdToEur=0.9210`, every cost column is multiplied by that rate, `BillingCurrency` is `EUR`, and each row carries the rate in `x_UnfoldExchangeRate` and the US$ amount in `PricingCurrencyEffectiveCost`. Unfold never looks a rate up and never guesses one. Choose the rate your books use, such as the ECB reference rate on the last day of the month. FOCUS says `BillingCurrency` matches the currency of the invoice, so export euros only when you charge your Clients in euros.

Money on Insights is shown in nl-NL format with two decimals. The file keeps full precision: decimals with a point, no thousands separator, no currency sign and no exponent.

## File formats

- **CSV** (RFC 4180, UTF-8, CRLF): a header row of FOCUS column ids. A null is an empty cell. A text that starts with `=`, `+`, `-` or `@` gets a leading apostrophe, so a spreadsheet does not run a Work Item title as a formula.
- **JSON Lines**: one object per row with every column, `null` for null, decimals as JSON numbers and text unchanged.
- **Parquet** (`application/vnd.apache.parquet`, Snappy-compressed): the CSV's columns in the same order, each one nullable, with typed values. A FOCUS Decimal column is `DECIMAL(38,10)`, so it keeps every digit the CSV has; a Date/Time column is a UTC timestamp in milliseconds; every other column is UTF-8 text, written unchanged without the CSV's apostrophe. `Tags` is text holding its JSON object, as in CSV. The file's metadata says `FocusVersion: 1.4`. An export with no rows is still a file with every column. Unfold writes it with `hyparquet-writer` ([ADR 0060](../adrs/0060-the-focus-cost-export-writes-parquet-through-hyparquet-writer.md)).

```sh
curl -H "Cookie: …" "https://unfold.example/api/ploeg/cost-export?month=2026-10&format=parquet" -o unfold-2026-10.parquet
duckdb -c "SELECT SubAccountId, sum(BilledCost) FROM 'unfold-2026-10.parquet' GROUP BY 1"
```

FOCUS asks a data generator to state its delivery mechanism. Unfold's is **Overwrite**: each export is a complete snapshot of its period and replaces an earlier export of the same period. Export a closed month again after its last Runs settled to get every settled Run.

## What is not verified

- No FinOps tool has loaded the file yet. pyarrow and DuckDB read a Parquet file with the types above. The test checks the FOCUS 1.4 Cost and Usage column table (presence, nulls, types) and the rules this export can break, citing the specification's sections; it is not the FinOps Foundation's own `focus-validator`.
- `unknown` as a provider name is a placeholder, which the FOCUS null-handling rules discourage. Pass `provider` when you know it.
- The settled cost is what the model gateway recorded with its price table. Whether it equals the provider's invoice is not checked.
- `BillingAccountId` is the Tenant id, which is unique within one Unfold installation, not across installations.

The FOCUS specification is copyright Joint Development Foundation Projects, LLC, FinOps Open Cost and Usage Specification (FOCUS) Series and its contributors, and published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
