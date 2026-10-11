# ADR Review Manifest

## ADR Review Completed

- **Date**: YYYY-MM-DD
- **Reviewer**: `<who>`
- **Change**: `<change-id>`

## Accepted Records Reviewed

- `docs/adr/adr-NNNN-kebab-title.md` — how it constrained this change

## Records Created

- `docs/adr/adr-NNNN-kebab-title.md` or `apps/unfold/docs/adrs/NNNN-kebab-title.md` — one line on the decision
- …or "none: no durable decision was introduced by this change."

## Supersessions

- `NNNN` supersedes `MMMM` — why the prior decision was revisited
- …or "none"

## Validation

```sh
$ python3 scripts/validate_adr_consistency.py .
# paste the output here
```

## Notes

Anything the owner must ratify, in particular every record left `proposed`.
