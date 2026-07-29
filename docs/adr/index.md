# Architecture Decision Records

One defensible decision per record — the durable answer to *"why is it built this way?"*.
Design exploration lives in RFCs/design docs; operational procedure lives in runbooks. An ADR
records a single decision and the alternatives it beat.

## Conventions

- **Location:** `adr-NNNN-<kebab-title>.md` in this directory — zero-padded, monotonically
  increasing, never reused, never renamed. Start from the template:
  [adr-0000-template.md](adr-0000-template.md).
- **Format: [MADR 4.0.0](https://adr.github.io/madr/).** `status` / `date` live in YAML
  frontmatter (`date` = when the decision was **last updated**, per MADR). Static-site
  generators don't render frontmatter, so status is also visible in the Records table below
  and in each record's dated history. Sections: Context and Problem Statement → (Decision
  Drivers) → Considered Options (chosen option first) → Decision Outcome ("Chosen option: …,
  because …" + Consequences as `Good/Bad, because` bullets + Confirmation: the concrete check
  that proves compliance) → (Pros and Cons of the Options) → More Information (parent
  RFC/issue as `Technical story:`, dated history, cross-ADR relations).
- **ADRs are records, not living docs.** When reality changes (revert, partial rollout,
  supersession), append a dated entry to the record's **More Information** section and update
  `status`/`date` — never silently rewrite the body. A reversed decision gets a *new* ADR
  that supersedes the old.
- **Records keep their birth format.** Older records in MADR 2.x or Nygard shape are amended
  in their own format, not retro-migrated.
- Register every new ADR in the Records table below; file ↔ table consistency is enforced by
  `validate_adr_consistency.py` (keep it wired into CI).

## Status legend

| Status | Meaning |
| ------ | ------- |
| **proposed** | Decided to pursue, not yet ratified/implemented end-to-end. |
| **accepted** | Decided. Current source of truth. |
| **rejected** | Considered and declined; kept to prevent re-derivation. |
| **superseded by ADR-NNNN** | Replaced by a later ADR. Never deleted. |
| **deprecated** | No longer relevant, not directly replaced. |

The `Last updated` column mirrors each record's `date` (MADR semantics: last update, not
creation); the dated history behind any change lives in that record's More Information
section.

## Records

<!-- Keep this table the LAST element of this file so new rows can simply be appended.
     Row shape (validated): | [NNNN](adr-NNNN-file.md) | Decision | status | YYYY-MM-DD | -->

| ADR | Decision | Status | Last updated |
| --- | -------- | ------ | ------------ |
| [0001](adr-0001-work-target-is-a-work-item-attribute.md) | Bind the Work Target to the Work Item, not to the Team | accepted | 2026-07-29 |
| [0002](adr-0002-routing-is-core-policy-over-provider-opaque-scopes.md) | Route work in the core over provider-opaque Scopes | proposed | 2026-07-29 |
| [0003](adr-0003-forge-registry-and-per-run-repo-scoped-credentials.md) | Resolve forges through a registry and mint forge credentials per Run | proposed | 2026-07-29 |
