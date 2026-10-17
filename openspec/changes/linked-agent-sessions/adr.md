# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-17
- **Reviewer**: Claude (session with Ryan Grippeling)
- **Change**: `linked-agent-sessions`

## In-Force ADR Context Reviewed

- `apps/ploeg/docs/adrs/0084-a-claude-code-run-can-execute-in-a-teams-self-hosted-claude-environment.md`
  — Ploeg never offers a Claude sign-in. This change does not either.
- `apps/unfold/docs/adrs/0037-an-editor-signs-in-only-after-its-person-approves-it-and-gets-its-own-credential.md`
  — the plugin's only credential.
- `docs/adr/adr-0037-people-act-on-work-through-either-mcp-server-and-every-action-names-its-person-channel-and-confirmation.md`
  — link changes are Action Records. `unfold_link_session` is a non-read-only
  tool that spends nothing.
- `docs/adr/adr-0032-unfold-also-serves-its-own-read-only-mcp-tools-next-to-ploeg-mcp.md`
  — `unfold-mcp` gains one tool that changes something, under ADR-0037.
- `apps/unfold/docs/adrs/0002-native-node-and-single-writer-storage.md` — new
  tables in the workbench database. No dependency is added.
- `docs/adr/adr-0033-unfold-plans-non-trivial-changes-as-openspec-changes.md`
  — the form of this change.

## Repository-Level ADRs Created

- `apps/unfold/docs/adrs/0047-people-link-their-own-agent-sessions-through-a-plugin-agent-trace-and-telemetry-never-a-claude-sign-in.md`
