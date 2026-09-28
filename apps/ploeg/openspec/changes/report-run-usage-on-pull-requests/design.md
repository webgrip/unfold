## Context

`run-multi-agent-shifts` shipped the blackboard and `close-the-review-loop`
taught Ploeg to act on it. What the blackboard still lacks is the arithmetic:
`publishRound` posts each reading Run's findings and `publishBudgetExhausted`
posts one notice when the pool empties, but the per-Run cost, the tokens, the
settled-versus-provisional state and the verification evidence are only in
Postgres. This change adds a report rendered from those records to the pull
request, so `#1305`'s question ("what did this cost and what was checked?") is
answered where the work is reviewed.

Read-only seams this leans on: `pkg/shiftengine/publish.go`,
`pkg/litellm/client.go` (`SpendLogs`, `Alias`), `cmd/ploegd/sweep.go`
(`managedSettlementSweep`), `pkg/provider/forgejo`. The accounting itself is
unchanged; ADR-0008 keeps LiteLLM the metering seam and this report never
crosses it.

## Goals / Non-Goals

**Goals:** one report comment per agent pull request, from stored state, updated
in place; per-Run usage and Shift totals; provisional/unavailable marked
honestly; verification evidence named and linked; a failure to publish never
changes the Shift.

**Non-Goals:** as in the proposal — no new accounting, no gateway call, no
billing statement, no CI reading, no tracker field or UI, no state stored for the
report itself.

## Decisions

### D1 — The renderer is pure; the store read is one call

The whole artifact is one function whose input is already read:

```go
// usageReportInput is everything the report renders.
type usageReportInput struct {
    Shift   store.ShiftUsage // id, work item, team, branch, rounds, close reason
    Runs    []store.RunUsage // oldest first
    Ledger  store.ShiftLedger
    TraceID string           // writing Run's alias ploeg-<12hex>; "" if none
    Settled bool             // false when any managed account is unreconciled
}

// usageReport renders the one body. Pure: no clock, no network, no store.
func usageReport(in usageReportInput) string
```

`store.ShiftUsage(ctx, shiftID)` reads `agent_runs` LEFT JOIN `run_llm_accounts`
plus `Ledger`, once. `RunUsage` carries `Role, Round, Writes, Outcome, Verdict,
Alias, Models, InputTokens, OutputTokens, CostUSD, AccountState`. Tokens, models
and cost come from `agent_runs.usage` (`inputTokens`, `outputTokens`, `models`,
`costUsd` — the keys `ReconcileLLMAccountWithUsage` writes); the account state
comes from `run_llm_accounts.state` (`reserved|minting|issued|unknown|blocked|
reconciled`, migration 0012). Because both already exist, **no migration is
needed** — the rejected alternative below is the one that would have added one.

### D2 — The report is identified by a marker on the forge, not by stored state

`const usageReportMarker = "<!-- ploeg:usage-report -->"`. Refresh is
`fp.Comments(repo, pr)` → find the comment whose body starts with the marker →
`fp.EditComment(...)`; if none, `fp.Comment(...)`. Nothing about the comment is
written back to Postgres. This is the R6-correct split: the report's identity is
forge state and its numbers are database state, and neither is shadowed in the
publisher. It also means a lost comment id is never a reason to post a second
one.

### D3 — The SPI gains two additive methods

```go
type Comment struct { ID int64; Body string }

// Comments lists a pull request's conversation comments, oldest-first.
Comments(ctx context.Context, repo string, pr int) ([]Comment, error)
// EditComment replaces the body of one existing comment.
EditComment(ctx context.Context, repo string, pr int, id int64, body string) error
```

Both in-tree forge providers implement them on the endpoints they already use
for `Comment`: Forgejo on `GET`/`PATCH /api/v1/repos/{owner}/{name}/issues/
{pr}/comments` and `.../issues/comments/{id}`, GitLab on the merge-request notes
it posts to (`GET /api/v4/projects/{id}/merge_requests/{iid}/notes`, `PUT
.../notes/{note_id}`). Everything forge-shaped stays behind the SPI (R7); the
core only sees `[]provider.Comment`. `Comment` was the SPI's only method with a
caller; these two are the smallest pair that makes "one comment, edited in
place" expressible, and every implementation must gain them to satisfy
`ForgeProvider`.

### D4 — Publishing is one engine method at three call sites

```go
func (e *Engine) publishUsageReport(ctx context.Context, si store.ShiftInfo, reports []store.RunReport)
```

It returns immediately when `!e.UsageReport`, resolves the thread through the
existing `pullRequestThread` (so a Shift with no PR, no target or no provider
skips exactly as findings do), reads `ShiftUsage`, renders, and finds-or-edits.
The three call sites, all after state is durable:

1. `pkg/shiftengine/engine.go` in `evaluate`, after `e.publishRound(...)`
   (currently line 159) — a Round just completed or a PR just appeared.
2. `pkg/shiftengine/engine.go` in `close`, in the `closed && work.Terminal(settled)`
   branch (currently ~line 282) — the Shift is over, so its totals are final
   enough to show.
3. `cmd/ploegd/sweep.go` in `managedSettlementSweep`, after `LLMControl.Settle`
   returns nil — a late settlement edits the same comment to the settled figure.
   This needs the Shift, so `UnsettledLLMAccount` gains `ShiftID` (from the
   existing `agent_runs.shift_id` join) and `ShiftEngine` gains
   `RefreshUsageReport(ctx context.Context, shiftID int64) error`, which loads the
   Shift and reports and calls `publishUsageReport`; an account with a NULL
   `shift_id` (historical rows, migration 0008) is skipped. `Engine` already
   satisfies `ShiftEngine` in `pkg/httpapi`.

The report does not depend on findings being present, so it cannot live *inside*
`publishRound` (which returns early when a Round produced no findings).

### D5 — Nothing provisional is presented as settled

`Settled` is true only when every managed account is `reconciled`; otherwise the
report heads with "provisional until settlement" and marks each unreconciled
Run's cost and tokens `provisional`. A Run whose spend could not be read shows
`unavailable` — the report never substitutes the authorization for the cost. A
Run with no managed account (a reading Run does not mint one, ADR-0013) shows
its `agent_runs.usage` figures, which are what the harness reported, and no
account state.

### D6 — Failure is logged, never a lifecycle event

A failed `ShiftUsage` read, `Comments` list or forge write logs and returns; no
Outcome, close reason or Work Item state changes (R2, R3). If the list fails the
report is **skipped rather than posted blind**, because a comment we cannot find
is a duplicate waiting to happen on the next refresh. A killed pod records
nothing partial: the next refresh edits the one comment (R6).

### D7 — One chart value, and it is the kill switch

The chart already renders a generic `env:` map onto the deployment
(`ops/helm/ploeg/values.yaml`: "Plain PLOEG_* env rendered onto the deployment"),
so the switch is `PLOEG_USAGE_REPORT: "true"` added there — **no
`values.schema.json` change**, unlike a new typed values key. `cmd/ploegd/main.go`
reads it with the same `envOr(...) != "false"` helper as
`PLOEG_SHIFTS_UNIFORM`, into `Engine.UsageReport`. It is the only new desired
state; rollback is a values edit that removes the env line (the code default is
the same `true`), not a redeploy of anything but ploegd. Default `true` because
the outcome is "every agent PR"; the value exists so a noisy deployment can
silence the report without a rollback.

### D8 — The report prints the alias, never a secret

The one identifier exposed is the writing Run's alias `ploeg-<12hex>` the
dashboards already join on (`pkg/litellm`). The report never prints a key value
or `gateway_key_id`; it is rendered from numbers and identifiers, and the forge
provider's existing rule (the token never appears in a logged error) is
unchanged.

## Rejected Trade-offs

- **Store the report's data — per-Run tokens or cost — in ploeg-db, or store the
  comment id in a new column.** Rejected because `agent_runs.usage` and
  `run_llm_accounts` already hold every figure, so the read needs **no
  migration**; a second copy would be a source of truth that can drift from the
  one the settlement engine writes, and it would need its own reconciliation.
- **Fetch spend from LiteLLM at render time.** Rejected: reading spend logs is
  `LLMControl.Settle`'s job and LiteLLM is the single metering seam (ADR-0008);
  duplicating it puts an authenticated, paid call on the publish path.
- **Post a fresh comment per Round or per refresh.** Rejected: a thread of
  near-identical reports is noise, and no single comment holds the current
  answer.
- **Piggyback on the writing Run's findings comment.** Rejected: findings are one
  Role's, the report spans the Shift; editing another Role's comment muddies
  attribution and the marker search.
- **Publish the report to the tracker instead of the pull request.** Rejected:
  ADR-0011 makes the pull request the blackboard; the tracker already gets a
  notification that links it.
- **A per-team opt-in** (mirroring `forgeFollowUps`). Rejected for now: the
  report is additive and non-destructive, so one global kill switch is enough
  surface; a Team that wants silence is better served by the global value until a
  real need appears.

## Risks / Trade-offs

- [Listing comments on every refresh is an API cost] → the refresh points are
  bounded by Round transitions and settlements, the search stops at the first
  marker, and the report is created at the first PR write, so it sits near the
  front of an oldest-first list. If a forge ever paginates past it, the worst
  case is a second comment, not a wrong figure.
- [Two publishers race and both create a comment] → ploegd is a single
  controller (one process owns the fast path and the sweep), so there is one
  publisher. If ploegd is ever scaled out, the marker scheme needs a lock or a
  stored id — named in Open Questions rather than assumed away.
- [Provisional totals read as final] → the header and per-Run marks say
  provisional, and the settlement sweep edits the same comment when the number
  firms up.
- [A huge thread makes the read expensive] → the API cost is one list per
  refresh; it never runs per Run.

## Migration Plan

None. No schema change, no new credential, no new network path. The chart value
defaults to on; setting it false disables the publish call with no other effect.
Rollback is the values edit.

## Open Questions

- Rollout default (on at merge versus a staged opt-in) — owner's call.
- Whether the tracker notification should echo the totals; not proposed.
- Whether the report earns an ADR if it becomes the surface a human bills from.
- The single-publisher assumption above, if ploegd ever runs more than one
  replica.
