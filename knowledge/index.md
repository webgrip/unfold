# Unfold knowledge

An Open Knowledge Format (OKF v0.1) bundle about this repository. Ploeg's worker packs the concepts that match a Work Item's title, description and labels into its brief (system ADR-0021, proposed); pitfalls rank first. Each concept is a short fact with a link to the page that owns it. Rules every agent must follow live in `AGENTS.md`, never here.

- [Merging while a release runs ships untested code](pitfalls/merging-during-a-release.md) (Pitfall)
- [Forgejo ignores if: on a reusable-workflow caller](pitfalls/reusable-workflow-if-is-ignored.md) (Pitfall)
- [A tool version bump without mise.lock breaks every run](pitfalls/tool-version-without-lockfile.md) (Pitfall)
- [mise run setup puts the pinned Ploeg bundle back](pitfalls/setup-resets-the-ploeg-pin.md) (Pitfall)
- [Edits inside apps/ploeg are lost on the next pin](pitfalls/edits-inside-apps-ploeg-are-lost.md) (Pitfall)
- [A stopped session is investigated from evidence](facts/stopped-session-evidence.md) (Fact)
- [Unfold's routes to Ploeg sit under /api/ploeg/](facts/unfold-talks-to-ploeg-under-api-ploeg.md) (Fact)
- [Non-trivial changes are planned as OpenSpec changes](decisions/plan-changes-with-openspec.md) (Decision)
