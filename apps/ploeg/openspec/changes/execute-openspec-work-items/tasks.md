## 1. Work Item directive

- [ ] 1.1 `pkg/work`: `OpenSpecChange(description)` parses `openspec: <id>` from plain text, markdown and HTML, validates kebab-case, rejects conflicting ids
- [ ] 1.2 Table tests: plain, HTML, backticks, case-insensitive key, none, malformed, traversal, conflicting, repeated

## 2. Contract

- [ ] 2.1 `harness.TaskSpec.OpenSpec` and `docs/contracts/taskspec.v1.schema.json` `openSpec`, edited together; `fullTaskSpec` in `contract_test.go` carries it

## 3. Worker

- [ ] 3.1 Locate `openspec/changes/<id>` in the clone without following symlinks; stuck on none or several
- [ ] 3.2 Brief from `openspec instructions apply --change <id> --json`, falling back to proposal, design and tasks; size-capped, repository-relative
- [ ] 3.3 Prompt section for writer, reader and planner, ranked below the delivery contract
- [ ] 3.4 Gate: fetch the pushed branch, `openspec validate <id> --type change --strict --json --no-interactive`; writer stuck, reader `request_changes`, cannot-run stuck
- [ ] 3.5 CLI environment: PATH, scratch HOME, telemetry off, no credentials, timeout
- [ ] 3.6 Tests with a fake `openspec` executable and a real git remote: brief from CLI and from files, gate pass and fail for writer and reader, CLI absent, directive errors

## 4. Docs

- [ ] 4.1 `docs/contracts/README.md` and `docs/ops/board.md`: the directive, the gate and the image requirement

## 5. Gates

- [ ] 5.1 `openspec validate execute-openspec-work-items --strict`
- [ ] 5.2 `mise run verify`, `mise run release-check`, `mise run docs-check`
