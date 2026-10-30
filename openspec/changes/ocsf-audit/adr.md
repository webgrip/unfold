# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-30
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `ocsf-audit`

## In-Force ADR Context Reviewed

- System ADR-0050 (proposed in PR #697, not merged when this was written),
  rule 3 — audit records are OCSF, and what leaves Unfold is reachable through
  the API. This change implements that rule for audit.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md`
  — Action Records stay as they are; the audit trail maps the same calls to
  OCSF API Activity and keeps the channel and confirmation.
- `docs/adr/adr-0017-a-tenant-sits-above-teams-and-bounds-what-users-sources-and-budgets-reach.md`
  — one chain per Tenant, and the admin API answers only for Tenants the
  caller administers.
- `apps/unfold/docs/adrs/0043-feature-flags-are-flagd-rules-evaluated-in-process-behind-openfeature-s-interface.md`
  — export sits behind a registered flag, off by default.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md`
  — the form of this change.

## Repository-Level ADRs Created

None. The change stays inside ADR-0050 rule 3. The retention default and the
tamper-evidence guarantee are documented in the operations page as settings
and limits; a stronger guarantee is an open question for the owner.
