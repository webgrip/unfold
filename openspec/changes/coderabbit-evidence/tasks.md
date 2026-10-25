## 1. Implement

- [x] 1.1 Validate optional configuration and credential separation.
- [x] 1.2 Implement bounded remote CLI reviews and scoped findings imports.
- [x] 1.3 Persist request identities, lifecycle events and snapshots; fence retries, quota and cancellation.
- [x] 1.4 Add authenticated HTTP routes, session evidence UI and Helm Secret references.
- [x] 1.5 Document supported scope, activation, billing and qualification limits in the operator guide and proposed ADR 0056.

## 2. Verify

- [x] 2.1 Exercise focused configuration, subprocess, API, scope, completion, authorization, redaction, lifecycle and UI tests without paid calls.
- [x] 2.2 Run `mise run verify` and record its result in the pull request: not green in this environment; embedded PostgreSQL refuses root execution. The full application suite separately reports 2,123 passed, three failures (two existing relay process-group failures and a Node native assertion in the Docker test), two skipped. The relay failures reproduce on unchanged development; the Docker test also crashes when run alone.
- [x] 2.3 Run `mise run docs-check` and record its result in the pull request: passed, 705 sources and 6,678 repository links.

The 20 focused integration, HTTP, UI, privacy and served-module checks pass, as do typecheck, source checks, design, icons, license checks, OpenSpec validation and Helm rendering, including refusal of a workspace-shared CodeRabbit Secret. No paid provider call was made. Browser visual qualification remains outstanding because the pinned Chromium download failed.
