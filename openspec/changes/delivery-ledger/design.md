# Design — delivery-ledger

## Context

ADR-0006 sets the rules: a merge or explicit approval is Acceptance, silence
for 10 working days is too, and tokens are charged for every attempt. PR #676
already reads Ploeg's delivery facts for an Insights window, with a page bound
and the caller's Teams, and decides whether each Run's spend is settled.

## Decisions local to this change

- **Reuse #676's readers.** `runSpend`, `handedOverAt` and `readWindowFacts`
  are exported from `delivery-economics.ts`, so cost per merged Work Item and
  the Token Charge base cannot disagree about what is settled.
- **The hand-over stands in for ready-for-review.** ADR-0006 starts the
  silence timer when the pull request opens. Using the last writing Run
  restarts the clock after a fix Round. That matches the clean-merge rate and
  is never earlier than the opening.
- **UTC dates, whole days.** Silence ends at a UTC midnight, so the date is
  the same for every reader. A Tenant time zone can come with the calendar
  decision.
- **Earliest Acceptance wins.** An approval followed by a merge is one
  Acceptance, dated at the approval. A merge after silence is still silent
  Acceptance, dated at the silence.
- **Rows are attempted Work Items.** A Work Item with no Shift has no
  Token Charge and no Acceptance to show, so it is left out.
- **CSV beside JSON in one route.** `format=csv` keeps the route count at
  one. Amounts keep a decimal point, so spreadsheets in any locale read them.

## Open Questions

- The holiday calendar: which country's holidays, per Tenant or global, and
  whether time zones matter. Until the owner decides, the calendar is weekdays
  plus a configured list.
- Whether Ploeg should record a ready-for-review moment, which would be a
  Ploeg contract change made upstream first.
- Phase 2: Credits, the Delivery Fee, Reversals, Disputes and invoices all
  need the owner's pricing decisions before they are built.
