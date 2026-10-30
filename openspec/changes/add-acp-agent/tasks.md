# Tasks — add-acp-agent

## 1. The agent

- [x] 1.1 `extensions/acp-agent`: JSON-RPC over newline-delimited stdio, `initialize`, `authenticate`, `session/new`, `session/prompt`, `session/cancel`, `session/set_mode`, `session/set_config_option`
- [x] 1.2 `login` and `logout` with the editor sign-in; `editorLabel` names `unfold-acp-agent`
- [x] 1.3 Binding with `/work`, the `work-item` option, `_meta.unfold.workItem` and `UNFOLD_WORK_ITEM`
- [x] 1.4 Ask from the record, a model Ask after `session/request_permission`
- [x] 1.5 Steer to the person's own workbench session, or a note for the next Run, after confirmation
- [x] 1.6 The session feed as ACP updates; harness permissions relayed as allow or deny
- [x] 1.7 `/propose` drafts and admits nothing

## 2. Docs and registry

- [x] 2.1 How-to for PhpStorm, Air, Zed and Neovim; the package README
- [x] 2.2 ACP registry entry and icon, not submitted
- [x] 2.3 Unfold ADR 0058, proposed

## 3. Checks

- [x] 3.1 `test/acp-agent.test.ts`: a fake ACP client against the demo and a fake Unfold
- [x] 3.2 `mise run verify` and `mise run docs-check`, output in the pull request
- [ ] 3.3 Describe the Ploeg proposal admission (design D6) to ploeg-hq once the owner agrees

## 4. Following hand-offs (owner approval 2026-10-30)

- [x] 4.1 `session/list`, `session/resume` and `session/close` over handed-off and waiting Work Items
- [x] 4.2 Follow a Work Item Ploeg runs: Runs as the plan, transcripts as messages and tool calls, the ready pull request
- [x] 4.3 `usage_update` with the Work Item's cumulative cost; none for the demo
- [x] 4.4 Questions by form elicitation, or `/answer` after a permission prompt; a dismissed form answers nothing
- [x] 4.5 `/handoff` and "hand off <task> to <Team>" through the confirmed tracker hand-off
