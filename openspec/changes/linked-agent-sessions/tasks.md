# Tasks — linked-agent-sessions

## 1. Decisions

- [x] 1.1 Application ADR 0047 (proposed) with its index row
- [x] 1.2 Domain term Linked Session, glossary regenerated
- [ ] 1.3 The owner accepts or rejects ADR 0047 (VIK-2137)

## 2. Unfold application

- [x] 2.1 Linked Session store, hook reports, branch and explicit links, dismissed links
- [x] 2.2 Agent Trace 0.1 validation, storage, JSON Lines export, lookup by commit
- [x] 2.3 Telemetry read from `observability.metricsUrl` and `logsUrl`, Grafana link
- [x] 2.4 `unfold_linked_sessions` and `unfold_link_session`, delegated routes for `unfold-mcp` over HTTP
- [x] 2.5 Work Item Agent sessions card, `#linked-session/<id>`, Settings › Agent sessions

## 3. Claude Code plugin

- [x] 3.1 Hooks, Agent Trace builder, git notes, skill, marketplace entry
- [ ] 3.2 Install it in the owner's Claude Code and check one real session end to end

## 4. Deployment

- [ ] 4.1 homelab-cluster: `observability.metricsUrl`, `dashboards["claude-code-session"]`, NetworkPolicy egress to VictoriaMetrics on 8429
