# Design — accept-and-merge

Status: proposed. The owner answered the design questions on 2026-11-01
(Decisions recorded); automatic acceptance stays open.

## Context

- Acceptance is defined in the [glossary](../../../docs/reference/glossary.md#acceptance):
  an explicit approval, a merge, or ten working days without a decision. It
  charges the Delivery Fee ([ADR-0006](../../../docs/adr/adr-0006-the-ticket-is-the-billing-unit.md)).
- Unfold reads a Work Item's pull request, head commit, checks and merge from
  Ploeg's delivery facts. Ploeg learns merges from forge webhooks and has no
  merge call of its own today.
- Unfold already has an **Accept** for a Session's candidate (application
  [ADR 0040](../../../apps/unfold/docs/adrs/0040-accept-opens-a-pull-request-through-the-trusted-publisher-in-the-unfold-control-service.md)):
  it opens a pull request and never merges. Ploeg's **approve** means
  approving proposed work before spend. Neither word is free.
- Unfold's own actions on a Work Item (`approve`, `reject`, `cancel`,
  `requeue`, `notes`) are `POST /api/ploeg/work-items/:id/<action>` routes,
  checked in `apps/unfold/src/auth.ts` and recorded in
  `apps/unfold/src/action-records.ts`.

## Goals / Non-Goals

Goals: one click from review to merge; an Acceptance that means exactly the
commit the person saw; the forge's rules unchanged; the card on the tracker
moves to Done without anyone touching it.

Non-goals: automatic acceptance; Unfold holding forge credentials; choosing a
merge method; bypassing branch protection.

## Decisions

### D1. Ploeg merges, through a generic contract

Unfold calls Ploeg's merge contract (ploeg-hq ADR-0188) with the Work Item,
the head commit and the proven person. Ploeg asks the forge with a merge
identity only ploegd holds; no Run, worker or sandbox receives it. Unfold
holds no forge write credential. (Owner 1A.)

### D2. Running checks use the forge's auto-merge

Ploeg takes a merge only for a Work Item that awaits review, which under Ploeg ADR-0119 means its CI passed. Checks Ploeg's gate does not count, such as a required review or a late status, use the forge's "merge when checks succeed" (`whenChecksPass`).
Unfold shows **Merging** with **Cancel merge**. Failed checks end the merge
request with a reason; the Work Item stays in review. (Owner 2A.)

### D3. The merge identity merges, and git holds no name

The forge shows the merge identity as merger. The merge commit carries Ploeg's
trailers: `Merge-Requested-By` with Ploeg's pseudonymous person id and the
consumer's name, `Merge-Request` with Ploeg's merge request id, and
`Merge-Request-Ref` with a link to the Acceptance in Unfold
(`/#acceptance/<id>`, no query string). Unfold passes the person's display
name as `displayName`, which Ploeg puts only in its pull request comment. A
commit can never be erased; a comment and an Acceptance record can. (Owner 3A,
then "fix it the best way you know how".)

### D4. "Unfold never merges" is amended

The rule becomes "a person accepts in Unfold or on the forge; the forge
merges under its own protection". It changes in the concept pages and
product copy when slice S2 ships: `docs/concepts/who-unfold-is-for.md`,
`docs/concepts/users-and-journeys.md`,
`apps/unfold/docs/product/at-a-glance.md` and
`apps/unfold/docs/operations/working-from-clickup.md`. (Owner 4A.)

### D5. The repository's merge method

Ploeg uses the repository's default merge style; Unfold offers no choice.
(Owner 6A.)

### D6. The action is called Accept and merge

The button and the MCP tool say what happens: **Accept and merge**,
`unfold_accept_work`. The glossary term stays Acceptance. The Session
candidate's **Accept** keeps its label.

### D7. The Acceptance is bound to the head

Unfold reads the head from `workItemFacts(id, true)` at confirm time and sends
it with the request; a request whose head differs from the current facts is
refused with 409 before any Ploeg call. Ploeg passes the head to the forge, so
a push between Ploeg's call and the merge is refused by the forge. A refused
or cancelled merge request leaves the Acceptance record marked as not merged;
a new head needs a new Acceptance.

### D8. One Acceptance per head

The Acceptance store keys on Work Item and head commit. A forge merge of a
head that already has an Acceptance in Unfold adds the merge to that record;
a forge merge without one records an Acceptance with channel `forge`. Billing
reads the store, so a Delivery Fee is charged once.

### D9. Who may accept

Until Access Roles exist, the permission is the one that approves and rejects
Work Items today. When they exist, it is the Developer's "accepts" permission
per project ([glossary](../../../docs/reference/glossary.md#access-role)).

### D10. Security controls

The owner put security first on 2026-11-01. Unfold's controls:

- **Fresh sign-in.** Accept and merge needs a sign-in at most 15 minutes old
  (the OIDC `auth_time`); otherwise Unfold asks the person to sign in again
  before it shows the confirmation. Ploeg checks the same age on its side.
- **Scoped permission.** Unfold's Operator Consumer gets Ploeg's `merge`
  permission only for the Teams the installation names.
- **Confirmation every time.** The dialog names the repository, pull request,
  base branch, short head, merge method and whether the forge still waits.
  The MCP tool acts only after the person confirms in the client; a client
  that cannot show it gets a link to Unfold, never a merge.
- **No agent path.** The action is never offered to an Ask, a Run or an
  agent session; it needs a person's session or a person-confirmed MCP call.
- **Everyone sees it.** Each merge request, merge and refusal notifies the
  Work Item's people and the installation owner on their channels, and is an
  audit event.
- **Off by default.** The flag `work.accept-merge` stays off until the
  homelab merge identity exists with merging restricted to it on
  `development`; Ploeg refuses `protection_unsafe` otherwise.

## States the person sees

| State | Shown as | Actions |
| --- | --- | --- |
| Pull request awaiting review, checks green | In review | Accept and merge, Reject |
| Checks running | Running checks, not yet in review | none until Ploeg moves it to review |
| Merge requested, waiting for a forge rule such as a required review | Merging | Cancel merge |
| Merged | Done | — |
| Refused: `head_changed` | In review: "New commits since you accepted" | Accept and merge again after looking |
| Refused: checks failed | In review: "Checks failed" | Reject, or let Ploeg's repair follow-up run |
| Refused: conflict | In review: "Conflicts with the base branch" | wait for Ploeg's base sync, then accept again |
| Refused: protection or permission | In review: the forge's rule, named | merge on the forge, or fix the rule |

## Risks / Trade-offs

- A merge identity is a standing write credential. Mitigations: ploegd only,
  branch protection's merge allow-list scoped to the repositories Ploeg
  routes, head binding, per-action confirmation, and the Operator Consumer's
  merge permission scoped to Teams.
- Two Accepts in Unfold (candidate and pull request) can confuse; D6.
- A forge without auto-merge refuses D2; Ploeg reports the capability and
  Unfold then offers Accept and merge only when checks are green.

## Migration Plan

Behind a flag `work.accept-merge`, off by default, until S1 to S3 are live on
homelab. The flag hides the action; nothing else changes for people who merge
on the forge.

## Decisions recorded 2026-11-01

1A Ploeg merges with its own identity · 2A forge auto-merge while checks run ·
3A merge identity as merger, person in a trailer · 4A amend "Unfold never
merges" · 6A repository's merge method.

## Open Questions

1. Automatic acceptance: may a rule accept on a person's behalf (for example a
   docs-only change, green checks and an approving Verdict), and per what
   scope? Not answered; nothing here builds it.
