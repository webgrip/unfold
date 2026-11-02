# Design — ci-integration

Status: proposed. The owner answered the design questions on 2026-11-01 and
2026-11-02 (Decisions recorded).

## Context

- Ploeg holds a pull request back from review until the forge's CI passed on
  its head ([Ploeg ADR-0119](https://github.com/ploeg-hq/ploeg/blob/development/docs/adrs/0119-a-pull-request-is-ready-for-review-only-when-the-forges-ci-passed-on-its-head.md)).
  Today every check gates, one cause-less reason parks the Work Item, and only
  GitHub can be re-run.
- ploeg-hq ADR-0189 (#408) makes a forge without re-run wait for a person's
  re-run of a cancelled check, and lets a CI-parked Work Item return to review
  or finish on merge.
- ploeg-hq ADR-0190 (#411) adds the CI port: adapters for Forgejo Actions,
  GitHub Actions and GitLab CI with the commit statuses as fallback; only
  required checks gate; cause classes and close reasons; caps; the CI facts
  read and three actions.
- Unfold renders Ploeg's close reasons through
  `apps/unfold/public/core/reasons.js`, shared by the browser and `mcp.ts`.

## Goals / Non-Goals

Goals: the cause and the next step wherever the person looks; one source of
truth; no CI credentials or vendor logic in Unfold.

Non-goals: reading CI from the forge in Unfold; changing how Ploeg classifies
failures; Bitbucket.

## Decisions

### D1. Unfold reads only Ploeg's CI facts

`PloegPort.ci(id)` reads `GET /api/v1/operator/work-items/{id}/ci`. A job's log
excerpt is fetched on demand from Ploeg's log link, which needs `readContent`,
and is shown as untrusted text. An older Ploeg without the route hides the
panel and keeps today's reason.

### D2. The CI panel

Required jobs first, each with state, cause class, duration or queue time, and
the log excerpt behind a disclosure. Advisory jobs in a folded "Not required"
group that never sets the waiting reason. The gate's current step (`proceed`,
`hold`, `fix`, `park`) and the counts against Ploeg's caps sit in the header:
"Re-run 1 of 3", "Waiting for development to turn green, 1 h of 4 h".

### D3. Actions

| Action | Ploeg route | Confirmation names |
| --- | --- | --- |
| Re-run CI | `POST …/work-items/{id}/ci/rerun` | the head and the jobs that re-run |
| Ignore for Ploeg | `PUT …/ci/checks/{check}/ignore` with `reason` | the check, that it applies to every later head of this Work Item, that merging still needs it |
| Mark as flaky | `PUT …/ci/checks/{check}/flaky` with `reason` | the check, that it applies to the whole repository route |

Undo is `DELETE` on the same routes. `409 rerun_unavailable` turns Re-run CI
into a link to the forge's run. The permission is the one that approves and
rejects Work Items today.

### D4. Reason copy

| Close reason | Chip | Fix |
| --- | --- | --- |
| `ci_change_failed` | CI fails on the change | Read the failing job; fix by hand or assign again with a sharper brief |
| `ci_base_red` | development is red | Fix development; the Work Item continues once it is green, or assign again |
| `ci_infrastructure` | CI infrastructure failed | Check the runners, then Re-run CI |
| `ci_cancelled` | CI was cancelled and not re-run | Re-run CI in the forge |
| `ci_policy` | A policy check needs a person | Read the check; only a person can clear it |
| `ci_not_finished` | CI did not finish | Check the queue and the runners, then Re-run CI |

### D5. Notifications

A Work Item that CI parks sends one notice naming the cause and the fix, with
links to Unfold and the tracker task, through the person's chosen channels. A
`base_red` wait that starts sends one notice to the installation owner: trunk
is red.

### D6. MCP and the Agents window

`unfold_get_ci` reads; `unfold_rerun_ci`, `unfold_ignore_check` and
`unfold_mark_check_flaky` act after the person confirms in the client, and a
client that cannot confirm gets a link to Unfold. The Agents window shows the
cause chip and the same actions.

## Risks / Trade-offs

- Forgejo 15 has neither re-run nor log reading in its API; the panel links to
  the forge for both.
- Ignore for Ploeg could hide a real failure from review; it needs a reason,
  is audited, and never lets a merge through the forge's protection.

## Migration Plan

Behind a flag `work.ci-panel`, off by default, until Ploeg's CI facts route is
live on homelab.

## Decisions recorded

- 2026-11-01: full adapters for Forgejo Actions, GitHub Actions and GitLab CI;
  every surface (Work Item page, tracker card, pull request comment,
  notifications with MCP and the Agents window).
- 2026-11-02: build Ploeg's job and cause reading first; one automatic re-run
  before a fix round; a person's cancel pauses; a red base branch waits.

## Open Questions

1. Proposing a re-run and log API to Forgejo upstream.
2. Ploeg ADR-0190's own choices for the owner: a red required check on a forge
   without re-run goes straight to a fix round unless marked flaky; a red base
   branch holds the Shift and its budget up to 4 hours and Ploeg updates the
   branch through the forge afterwards; on Forgejo a lost runner reads as a
   test failure.
