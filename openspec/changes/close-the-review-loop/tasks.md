# Tasks — close-the-review-loop

## 1. The decision

- [x] 1.1 `docs/adrs/0017-the-review-loop-is-verdict-driven-and-capped.md` plus its Records row; `go test ./internal/ledger/` passes
- [ ] 1.2 A human ratifies ADR-0017 (status proposed → accepted) before group 3 merges

## 2. The verdict on the contract

- [ ] 2.1 Migration `0010`: `agent_runs.verdict TEXT NOT NULL DEFAULT ''` with a CHECK constraining it to `''`/`approve`/`request_changes`
- [ ] 2.2 `harness.OutcomeReport.Verdict` + the matching `docs/contracts/outcomereport.v1.schema.json` enum, edited together, plus a `contract_test.go` case
- [ ] 2.3 `validateOutcomeReport` rejects an unknown verdict at the API boundary (the closed-enum rule the failureReason taxonomy already follows)
- [ ] 2.4 `Store.ReportOutcome` persists it; `RoundReports` returns it

## 3. The loop

- [ ] 3.1 `pkg/plan`: `maxFixRounds` (default 2), and boot-time refusal of `maxFixRounds > 0` with no writing Round
- [ ] 3.2 `pkg/shiftengine`: derive the fix-round count; re-open the plan's last writing Round then its review Round on `request_changes`
- [ ] 3.3 Bounds in order — pool, cap, verdict — each closing with a reason that names which one stopped it
- [ ] 3.4 A verdict from a WRITING Role is ignored
- [ ] 3.5 Tests: fix round opens with findings in the briefing, approve closes, cap stops a never-approving reviewer, pool parks before the cap, writer verdict ignored, count survives a restart mid-loop
- [ ] 3.6 The reviewer prompt asks for a verdict and says what each value means

## 4. The forge route

- [ ] 4.1 Migration `0011`: `forge_deliveries` (delivery id, seen_at) for dedup
- [ ] 4.2 `POST /webhooks/forge/{provider}`: raw-body HMAC before parsing, dedup on the delivery id, 202 without synchronous work
- [ ] 4.3 Audit every accepted event; drop irrelevant ones without error
- [ ] 4.4 Sweep expired delivery ids alongside the leases
- [ ] 4.5 Tests: bad signature rejected, unknown provider handled, redelivery acts once, push creates nothing

## 5. Gates and closure

- [ ] 5.1 Per PR: `gofmt -l .`, `go vet ./...`, `go build ./...`, `go test ./...`, `helm lint`, three `helm template` renderings, and `./scripts/helm-golden.sh check` — output in the PR body
- [ ] 5.2 `go test ./internal/ledger/` wherever docs/adrs changes
- [ ] 5.3 `openspec validate --all`
- [ ] 5.4 architecture.md §9.1 updated: the forge webhook route exists, and what it does and does not yet do
- [ ] 5.5 Runbook note: the Forgejo→ploegd network path is blocked in both directions today, so the route is inert until ops wires it
