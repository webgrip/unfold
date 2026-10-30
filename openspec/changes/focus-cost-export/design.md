# Design — focus-cost-export

## Context

`runSpend` in `src/delivery-economics.ts` already says whether a Run's cost is
settled, unsettled or unreported, and `readWindowFacts` reads Ploeg's facts
within the caller's Teams and Tenant reach. `TenantScope.workItemOwner` gives a
Work Item's Tenant and Client from its target repository. FOCUS 1.4 was read at
tag v1.4 (commit f1eeb30, 2026-06-05) of `FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec`.

## Decisions local to this change

- **A charge is one Run on one UTC day.** FOCUS has no notion of a Run, so
  ChargePeriod is the UTC day the Run finished and BillingPeriod its calendar
  month. `granularity=work-item` adds a Work Item's Runs of one day and one
  status into one row.
- **Tenant is the billing account, Client the sub account.** A repository
  without a Client bills to the Tenant as its own sub account, with
  `SubAccountType` `Tenant`. A Work Item with no single owner has no row and is
  counted in a header.
- **Unsettled spend is never in a cost column.** FOCUS 1.4 allows only
  invoiced amounts in BilledCost and only `Correction` in ChargeClass, so
  ChargeClass cannot mark it. Unsettled Runs are left out by default; with
  `unsettled=include` every cost is 0 and the observed amount sits in
  `x_UnfoldObservedCost` with `x_UnfoldSpendStatus` `Unsettled`.
- **Tokens go to x_ columns.** FOCUS requires ConsumedQuantity and
  PricingQuantity to be null while SkuPriceId is null, and Unfold has no price
  list id per Run. The columns are present and null.
- **ProviderName and PublisherName are gone.** FOCUS 1.4 removed them; the
  export writes ServiceProviderName, HostProviderName and InvoiceIssuerName
  from the request's `provider`, else `unknown`.
- **Euros only at a given rate.** `currency=EUR` needs `usdToEur`. The US$
  amount stays in PricingCurrencyEffectiveCost, the rate in
  `x_UnfoldExchangeRate`.
- **CSV and JSON Lines, no Parquet.** Unfold's only runtime dependency is
  `ws`. The one small pure JavaScript writer, `hyparquet-writer` 0.18.0 (MIT),
  is pre-1.0, pulls in `hyparquet`, and released a day before this change.
  DuckDB converts the CSV in one statement.
- **The validator is encoded from the specification.** The FinOps Foundation's
  `focus-validator` is a Python tool and the requirements model is about 2 MB
  of rule graphs; the test copies the 65-column table and the rules this export
  can break, citing sections, under CC-BY-4.0.
- **Overwrite delivery.** Each export is a full snapshot of its period.

## Open Questions

- Whether an Agency wants a stored provider name per Team instead of the
  `provider` parameter, once Ploeg records the model per Run.
- Whether to offer Parquet once a writer reaches 1.0.
