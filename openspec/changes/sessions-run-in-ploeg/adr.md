# ADR Review Manifest

## ADR Review Completed

- **Date**: 2026-10-13
- **Reviewer**: Claude (planning session for Ryan Grippeling)
- **Change**: `sessions-run-in-ploeg`

## Accepted Records Reviewed

- `docs/adr/adr-0002-ploeg-is-the-only-engine.md` — accepted, not implemented; this change implements it.
- `docs/adr/adr-0019-unfold-pins-ploeg-from-its-own-repository-and-releases-only-its-application.md` — Ploeg changes land in ploeg-hq first; the tasks order pin moves before each Unfold increment.
- `apps/unfold/docs/adrs/0023-unfold-submits-work-to-ploeg-and-never-executes-it.md` — accepted 2026-10-11; its submission, live view, cancel, requeue and deletion parts constrain this change; its pause, steering, Harness and permission-answer parts are what ADR-0044 supersedes.
- `apps/unfold/docs/adrs/0017-delegate-interactive-execution-to-ploeg.md` (proposed) — the Operator Execution path that drains and is deleted.
- `apps/unfold/docs/adrs/0012-agent-host-protocol-host.md` — the Agents window stays as Ploeg's projection and command surface.
- `apps/unfold/docs/adrs/0003-runtime-workspace-and-credential-seams.md`, `0009-workspace-placement-is-a-session-choice.md`, `0011-sandboxes-dial-out-through-a-relay.md`, `0013-sandbox-crd-placement-with-warm-kata-pools.md` — their subject, Unfold-owned Workspaces, is removed.
- `apps/unfold/docs/adrs/0014-signed-candidates.md`, `0019-verify-canonical-candidates-outside-agent-workspaces.md`, `0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md` — transitional per ADR-0023; they lose their input when the engine path goes (design Open Question 6).
- Ploeg ADR-0068 (next-Run notes), ADR-0044 (requeue) and ADR-0091 (Harness recorded per Run) — reused, not restated.
- Ploeg ADR-0103 (model per session, narrows 0039) and ADR-0104 (messages into an attended Run, narrows 0068), proposed with the Ploeg changes.
- Ploeg ADR-0039 (a Run calls only its Role's model) — narrowed on the Ploeg side by the record `select-harness-per-run` adds for the owner's 2026-10-13 decision (design R1): a session chooses its model from the Role's policy list, and a Run still calls exactly one model.
- Ploeg ADR-0097 to ADR-0101 (proposed, in ploeg-hq on `feat/per-run-harness-and-interaction`, not in the pinned Ploeg) and ADR-0102, which `submit-work-items` adds and which supersedes Ploeg ADR-0024 — the Ploeg side this change consumes.

## Records Created

- `apps/unfold/docs/adrs/0044-sessions-run-in-ploeg-with-a-harness-chosen-per-session-and-interaction-kept.md` — sessions execute in `ploeg-worker`, the Harness is chosen per session from Ploeg's Team offer, interaction is kept through a Ploeg channel, and each Run shows its Harness and version (owner decisions of 2026-10-13), including the per-session model from the Team's list and "Approve tool use automatically" as Ploeg's per-Run `autoApprove`.

## Supersessions

- `0044` proposes to supersede parts of `0023`: "no pause in v1", "steering reaches the next Round only", the one-Harness-per-Team-plan reading of "the ACP adapter is the only OpenCode driver", and "interactive permission answers go away". The owner rejected losing interaction on 2026-10-13. Following the ledger's convention for partial supersession (0038 → 0024, 0041 → 0026), 0023 keeps its status and body; a dated More Information bullet and its README row link forward to 0044.

## Validation

```sh
$ python3 scripts/validate_adr_consistency.py .
validate-adr-consistency: OK (36 record(s) in docs/adr, registry-checked)
```

The validator checks the system ledger only; the application ledger row for 0044 was added by hand.

## Notes

ADR-0044 stays `proposed`; only the owner accepts it. No VIK ticket exists yet.
