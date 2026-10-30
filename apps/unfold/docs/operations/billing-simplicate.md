---
type: how-to
audience: [owner, operator, integrator]
owner: unfold
last_verified: 2026-10-30
verified_by: "Written with the implementation on branch feat/simplicate-billing-lines: src/billing.ts, src/billing-export.ts, src/billing-simplicate.ts, src/billing-file.ts, src/config.ts, src/flag-registry.json and public/views/billing.js; test/billing.test.ts passed against a fake Simplicate that records every request. Simplicate endpoints, headers, fields and rate limit read on 2026-10-30 from developer.simplicate.com: the v2 getting started page, the filtering and known limitations pages, and the OpenAPI document openapi/apiV2.json. Not checked against a real Simplicate account."
---

# Bill accepted tickets through Simplicate

When a Work Item is accepted, Unfold can write one line for it into your Simplicate project, at your own price. Simplicate then makes the invoice and sends it, over Peppol where your customer needs that. Unfold never makes, sends or changes an invoice.

A Work Item is accepted when its pull request merges, a person approves it, or 10 working days pass with no decision ([system ADR-0006](../../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md)). The [delivery ledger](../contracts/api.md) on Insights shows the same Acceptance. A revert within 14 days for a defect is a Reversal. When you confirm one, Unfold writes a credit line.

Billing is off by default. It needs a `billing` block in the configuration, the `billing.export` feature flag on for your Tenant, and a mapping per Client.

## What Unfold sends, and what it never sends

| Unfold sends, per accepted Work Item | Unfold never sends |
| --- | --- |
| The Work Item reference and title, such as `VIK-41 Fix checkout` | An invoice, a draft invoice or a Peppol message |
| How it was accepted (merged, approved or silent) and the date | Unfold's own Delivery Fee, Token Charge or model spend |
| A link to the pull request | Anything about the Client's people, the code, or the agent's work |
| Quantity 1, or -1 on a credit line, at the price you entered for that Client | A price you did not enter |
| A key such as `unfold:agency:41:acceptance` that identifies the line | Anything to Simplicate while the flag is off or the Client is unmapped |

The Client never sees a line from Unfold. The line reaches the Client only on the invoice you send from Simplicate.

## Before you start

- Unfold in live mode. Demo mode refuses a `billing` block, because every demo visitor is an administrator.
- A Simplicate API key and secret. Create them in Simplicate under General settings, API. A token has the rights of the Simplicate user it was made for, so make it for a user who may add services to projects.
- For each Client: the Simplicate project the lines go on (its id, such as `project:…`) and the catalogue service each line is made from (its `default_service_id`).

## 1. Put the credential in a Secret

Store the key and secret as one value, `key:secret`, in the Secret your chart mounts as `credentialsSecret`, under a name such as `UNFOLD_SIMPLICATE_TOKEN`. The configuration names only the variable. Unfold refuses to start when the variable is missing or has another shape, and when `runtime.agentEnvironment` would pass it into agent workspaces.

## 2. Add the billing block

```json
"billing": {
  "exporter": "simplicate",
  "simplicate": { "domain": "agency", "tokenEnv": "UNFOLD_SIMPLICATE_TOKEN" },
  "currency": "EUR",
  "syncMinutes": 15
}
```

`domain` is your Simplicate subdomain, so `agency` means `https://agency.simplicate.nl/api/v2`. `currency` defaults to `EUR`, and `syncMinutes` (default 15) sets how often Unfold looks for new Acceptances. In the Helm chart the block goes under `config.billing`.

## 3. Turn on the flag for your Tenant

`billing.export` is a permission flag, evaluated per Tenant ([Feature flags](feature-flags.md)). Turn it on for one Tenant with a targeting rule on `tenantId`, or for everyone with `defaultVariant: on`. While it is off, Unfold adds no lines for that Tenant and sends none it already holds.

## 4. Map each Client

Open **Settings, Billing** as an administrator. Each Tenant, and each Client a registered repository or task source names, has a row. A Work Item belongs to the owner of its target repository ([system ADR-0017](../../../../docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md)). For each one you bill, enter:

- **Simplicate project id** and **Simplicate service id**. The VAT class and revenue group are optional; the catalogue service's own apply when you leave them empty.
- **Your price per ticket**, without VAT, or a price per Size. Ploeg records no Size yet, so a line under a mapping with only Size prices waits as **Needs your price** until you enter one on the line.
- **Bill acceptances from**: the first Acceptance date that is billed. It defaults to today, so turning billing on never bills the past month unless you choose an earlier date.

## What Simplicate receives

For each line Unfold makes one request, `POST /projects/service` on Simplicate API v2, with the headers `Authentication-Key` and `Authentication-Secret`:

```json
{
  "project_id": "project:…", "default_service_id": "defaultservice:…",
  "name": "VIK-41 Fix checkout", "explanation": "VIK-41: merged on 2026-10-20.\nPull request: https://…\nUnfold line unfold:agency:41:acceptance",
  "invoice_method": "FixedFee", "amount": 1, "price": 450,
  "external_id": "unfold:agency:41:acceptance", "start_date": "2026-10-20", "end_date": "2026-10-20",
  "track_hours": false, "track_cost": false
}
```

This creates a fixed-fee service on the project, which Simplicate lists under "to be invoiced" in its own invoicing flow. A credit line is the same request with `amount: -1`, a name that starts with `Credit:`, the Reversal's reason in the explanation, and the key followed by `:reversal`.

### What is verified and what is not

| Part | Source | Status |
| --- | --- | --- |
| Base URL `https://{domain}.simplicate.nl/api/v2`, HTTPS only | [Getting started](https://developer.simplicate.com/docs/api/v2/getting_started), [OpenAPI document](https://developer.simplicate.com/openapi/apiV2.json) | Verified |
| `Authentication-Key` and `Authentication-Secret` headers, `Content-Type: application/json` | [Getting started](https://developer.simplicate.com/docs/api/v2/getting_started) | Verified |
| `POST /projects/service` and its fields (`invoice_method` `FixedFee`, `amount`, `price`, `project_id`, `default_service_id`, `vat_class_id`, `revenue_group_id`, `external_id`, `start_date`, `end_date`, `track_hours`, `track_cost`) | [OpenAPI document](https://developer.simplicate.com/openapi/apiV2.json), schema `PostProjectService` | Verified |
| The API creates and changes only fixed-fee and hours services, and cannot create installments | [Known limitations](https://developer.simplicate.com/docs/api/v2/known_limitations) | Verified |
| Invoices made through the API have no link to project services | [Known limitations](https://developer.simplicate.com/docs/api/v2/known_limitations) | Verified; why Unfold writes services, not invoices |
| At least 60 requests per minute, and HTTP 429 above the limit | [Getting started](https://developer.simplicate.com/docs/api/v2/getting_started) | Verified. No `Retry-After` header is documented |
| Errors in the 400 range as `{"data": null, "errors": [...], "debug": null}`; 503 during maintenance | [Getting started](https://developer.simplicate.com/docs/api/v2/getting_started) | Verified |
| The created id under `data.id` | Getting started says the id is returned "depending on the resource" | Not verified. Unfold keeps it when present |
| The date format of `start_date` and `end_date` (`YYYY-MM-DD`) | Not documented | Not verified |
| `amount: -1` accepted for a credit line | Not documented | Not verified |
| Reading `external_id` back or filtering on it | Not in the `GetProjectService` schema | Not verified, so Unfold never looks a line up before sending |

Run one line against a test Simplicate environment before billing a real Client, and check that the service shows the price, date and VAT you expect.

## Sent once, and what happens when it fails

Each line has one key: `unfold:<tenant>:<workItemId>:acceptance`, plus `:reversal` for its credit line. Unfold saves the line before the first attempt and never makes a second line with the same key.

| What Simplicate does | What Unfold does |
| --- | --- |
| Takes the line | **Sent**, with Simplicate's id when it returns one |
| Answers 429 or 503, or no connection could be made | Tries again after 1, 2, 4 and so on up to 60 minutes, at most 8 times, then **Failed** |
| Refuses the line (another 400-range answer) | **Failed** at once, with Simplicate's message |
| Times out, drops the connection, or answers another 500-range error | **Failed, uncertain**: Simplicate may have created the line |
| Unfold restarts while it is sending | **Failed, uncertain** |

Unfold sends at most 30 lines per sweep, one at a time, which stays under Simplicate's documented limit.

On the Billing page, a failed line has **Send again**. For an uncertain line, look in Simplicate first. If the line is there, choose **It is in the tool**, and Unfold counts it as sent. If it is not, choose **Checked: send again**. Unfold never resends an uncertain line on its own, because that could bill your Client twice.

## Reverse a ticket

When an accepted change is reverted within 14 days for a defect inside its Acceptance Conditions, open the line and choose **Reverse**. Say which defect the revert fixed, and add the revert's link if you have it. When Unfold finds a merged revert in Ploeg's delivery facts, it says so on the line, but you decide whether it was a defect.

- A line Simplicate already has gets one credit line: quantity -1 at the same price.
- A line that was never sent is cancelled, and nothing goes to Simplicate.
- After 14 days, or a second time, the Reversal is refused.

## Without Simplicate

Set `"exporter": "file"` to have Unfold write lines for any other tool. Each line becomes `<directory>/<tenant>/<key>.json`, a UBL 2.1 JSON document with that single invoice line, plus one record in `<directory>/<tenant>/lines.csv`. `billing.file.directory` defaults to `billing-export` in the data directory. The mapping takes an optional reference, such as your tool's customer code, which goes on every line.

Whatever the exporter, `GET /api/billing/lines?format=csv` or `format=ubl` downloads every line, and the Billing page links both ([HTTP API](../contracts/api.md)). A UBL credit line has quantity -1 at a positive price, because EN 16931 does not allow a negative item price. Moneybird, Teamleader and Exact are planned as further exporters.
