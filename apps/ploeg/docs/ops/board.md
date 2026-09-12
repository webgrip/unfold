# Tracker configuration and historical board notes

The tracker owns current work and priorities. Ploeg receives configured provider events and resolves a Work Target from the registered Scope. De Vloer registers its own task sources and repository mapping; there is no universal project-ID default.

For current integration behavior, read [tracker execution binding](../contracts/tracker-execution.md), the [Vikunja provider](../../pkg/provider/vikunja/vikunja.go), the [ClickUp provider](../../pkg/provider/clickup/clickup.go) and [Vloer's connection guide](https://forgejo.webgrip.dev/webgrip/de-vloer/src/branch/development/docs/operations/task-connections.md).

Before expecting an assignment to dispatch work, verify the actual tracker project, the assignee's access, webhook registration, provider routing and target mapping. A planning board and an execution test board may be different projects.

The [July board snapshot](https://forgejo.webgrip.dev/webgrip/ploeg/src/commit/f2333b96c6b44f489c562f74d6a4654fed29cc01/docs/ops/board.md) records IDs and MCP failures observed then. Do not treat those IDs, counts, API errors or the old console default as current configuration.
