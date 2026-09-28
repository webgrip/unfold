# Tasks — report-run-usage-on-pull-requests

Planning-only change: nothing below is implemented in this PR. Each step is at
most a day and names the test that checks it.

## 1. The forge can find and edit a comment

- [ ] 1.1 `provider.Comment` type and `Comments`/`EditComment` on the `ForgeProvider` SPI (`pkg/provider/provider.go`)
  Test: `pkg/provider` interface conformance — `TestForgeProvider_CommentMethodsInSPI` (a compile-time assertion plus a fake provider implementing all four methods).
- [ ] 1.2 Forgejo implementation on the issues endpoints: list `GET .../issues/{pr}/comments`, edit `PATCH .../issues/comments/{id}` (`pkg/provider/forgejo/forgejo.go`)
  Test: `pkg/provider/forgejo/forgejo_test.go`'s `TestComments_ListsAndPages` and `TestEditComment_SendsBody` against `net/http/httptest`, including a non-2xx that fails without leaking the token.
- [ ] 1.3 GitLab implementation on the merge-request notes endpoints: list `GET .../merge_requests/{iid}/notes`, edit `PUT .../notes/{note_id}` (`pkg/provider/gitlab/gitlab.go`)
  Test: `pkg/provider/gitlab/gitlab_test.go`'s `TestComments_ListsNotes` and `TestEditComment_SendsBody` against `net/http/httptest`, including a non-2xx that fails without leaking the token.
- [ ] 1.4 Reading the marker is bounded: stop at the first match, tolerate a large thread
  Test: `TestComments_StopsAtFirstMatch` with a synthetic multi-page list.

## 2. The store answers the report in one read

- [ ] 2.1 `store.RunUsage`, `store.ShiftUsage` and `Store.ShiftUsage(ctx, shiftID)` (`pkg/store`), joining `agent_runs` and `run_llm_accounts` and reading the `usage` JSON keys `ReconcileLLMAccountWithUsage` writes
  Test: `TestStore_ShiftUsageReadsTokensModelsAndAccountState` — a settled Run, an unreconciled Run, a reading Run with no account, and a Run with an empty `usage`.
- [ ] 2.2 `UnsettledLLMAccount` gains `ShiftID`, selected from the existing join, so the sweep knows which report to refresh; a NULL `shift_id` is skipped
  Test: `TestStore_UnsettledLLMAccountsCarryShiftID` in `pkg/store/llm_settlement_test.go`, including a NULL-`shift_id` row that is omitted.

## 3. The renderer

- [ ] 3.1 `usageReport(usageReportInput) string` (`pkg/shiftengine/usage.go`), pure: header with the `<!-- ploeg:usage-report -->` marker, per-Run rows, totals from the ledger, evidence section, trace alias
  Test: `TestUsageReport_RendersPerRunAndTotals` — a golden body for a two-Run Shift.
- [ ] 3.2 Provisional and unavailable are explicit; the authorization is never rendered as cost
  Test: `TestUsageReport_MarksUnreconciledProvisional` and `TestUsageReport_UnreadableSpendIsUnavailable`.
- [ ] 3.3 The alias is printed and no key value or `gateway_key_id` is; a Run without an account renders no account state
  Test: `TestUsageReport_PrintsAliasOnly` (asserts a key-shaped string cannot appear) and `TestUsageReport_ReadingRunHasNoAccountState`.
- [ ] 3.4 The evidence section names the writing Run's verification result and commit, and links the pull request's checks
  Test: `TestUsageReport_EvidenceNamesVerificationAndCommit`.

## 4. The publish path

- [ ] 4.1 `Engine.publishUsageReport(ctx, si, reports)` (`pkg/shiftengine/publish.go`): reuse `pullRequestThread`, read `ShiftUsage`, render, find the marker, edit or create
  Test: `TestPublishUsage_CreatesOnceThenEditsInPlace` — a fake forge records one create and subsequent edits, and the thread holds exactly one marker comment.
- [ ] 4.2 No pull request, no target, no provider, or the flag off → skip silently, exactly as findings do
  Test: `TestPublishUsage_SkipsWithoutAPullRequest` and `TestPublishUsage_SkipsWhenDisabled`.
- [ ] 4.3 A failed read, list or write is logged and skipped; a failed list never posts blind (no duplicate)
  Test: `TestPublishUsage_ReadFailureChangesNothing` and `TestPublishUsage_ListFailureDoesNotPost`.
- [ ] 4.4 Call sites: `evaluate` after `publishRound`; `close` in the terminal branch; nothing depends on findings being present
  Test: `TestEngine_PublishesReportAfterARoundWithoutFindings` and `TestEngine_PublishesReportOnClose`.
- [ ] 4.5 The report changes no Outcome, close reason or Work Item state
  Test: `TestPublishUsage_DoesNotChangeOutcome` — the Shift and item rows are read before and after.

## 5. The settlement sweep refreshes it

- [ ] 5.1 `ShiftEngine` gains `RefreshUsageReport(ctx, shiftID) error`, implemented on `Engine` and wired in `cmd/ploegd/main.go`
  Test: `TestEngine_RefreshUsageReportEditsTheComment`.
- [ ] 5.2 `managedSettlementSweep` calls it after a successful `Settle`, and only then
  Test: `TestSettlementSweep_RefreshesAfterSettlementAndNotOnFailure` in `cmd/ploegd`.
- [ ] 5.3 A settle for a Run with no pull request is a no-op, not an error
  Test: `TestSettlementSweep_RefreshWithoutPullRequestIsSilent`.

## 6. One chart value

- [ ] 6.1 `PLOEG_USAGE_REPORT: "true"` added to the existing generic `env:` map in `ops/helm/ploeg/values.yaml` (no `values.schema.json` change) and rendered by `templates/deployment.yaml`
  Test: `ops/helm/ploeg` golden render (`scripts/helm-golden.sh check`) plus `helm template -f ci/executor-values.yaml` shows the env.
- [ ] 6.2 `cmd/ploegd/main.go` reads it into `Engine.UsageReport`, defaulting on when unset
  Test: `TestEngineUsageReportFromEnv` in `cmd/ploegd`.

## 7. Gates and closure

- [ ] 7.1 `gofmt -l .`, `go vet ./...`, `go build ./...`, `go test ./...`, the Helm checks, and `openspec validate --all --strict` — output in the PR body
  Check: `mise run verify` (or the per-gate commands where the sandbox lacks a toolchain, listed under "Checks left to CI").
- [ ] 7.2 No code path mints, settles or blocks an account, and no print path carries a secret — self-review against ADR-0008 and R8
  Check: `go vet` plus the D8 tests in group 3; a reviewer re-reads the diff for a key-shaped string.
- [ ] 7.3 The owner reads the proposal and design and approves, or requests changes
  Check: the pull request's review state; a human merges — the agent does not.
