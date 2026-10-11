# `spec-driven-with-adr`

The OpenSpec workflow schema for Unfold, resolved as a project schema:

```
proposal → specs → design → adr → tasks → apply
```

It is Ploeg's schema of the same name with Unfold's rules: the two ADR ledgers (`docs/adr/` for system decisions, `apps/unfold/docs/adrs/` for the application), Unfold's supersession convention (the old record's status changes, as `docs/documentation.md` describes), `scripts/validate_adr_consistency.py` instead of Ploeg's ledger test, and `mise run verify` as the gate. [ADR-0033](../../../docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md) records why.
