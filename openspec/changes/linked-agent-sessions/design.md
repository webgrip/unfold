# Design — linked-agent-sessions

## Context

Research on 2026-10-17 surveyed the following:

- Claude Code's hooks, plugins, OpenTelemetry export and terms;
- the Agent Trace RFC and its hosted schema;
- prior art: Linear agent sessions, GitHub Agent HQ, Entire, git-ai, Amp
  thread trailers and SpecStory.

The owner's Claude Code already exports metrics, logs and traces to the
homelab's VictoriaMetrics, VictoriaLogs and VictoriaTraces. Grafana has a
Claude Code session explorer keyed by `session_id`. ADR 0047 records the
choice.

## Decisions local to this change

- **Command hooks, not HTTP hooks.**
  - SessionStart does not support HTTP hooks.
  - Agent Trace needs the git history and the edits remembered locally.
  - The script decides what leaves the machine, so prompts never do.
- **No command rewriting.**
  - A PreToolUse `updatedInput` is documented only with `allow`, which skips
    the person's permission prompt, or with `ask`, which prompts on every
    commit.
  - The trailer is asked for in the session's context instead, as the
    repository already asks for `VIK-<id>`. Each commit records whether it
    carries the trailer.
- **Fingerprints, not positions.**
  - Edits shift line numbers, so the plugin remembers hashed, trimmed lines per
    file and matches them against the commit's added lines.
  - Short lines follow their neighbours.
  - The method is named in metadata (`line-fingerprint`), so a reader knows
    the record is a heuristic.
- **The record names the commit that holds the lines.**
  - The reference implementation records the HEAD at edit time.
  - This change records the commit itself, so the specification's blame lookup
    (§6.5) finds it.
- **Strict validation.**
  - The hosted schema refuses unknown properties outside `metadata`, so Unfold
    does too, and names the field that failed.
  - The schema says `major.minor` while the specification's examples say
    `0.1.0`, so both are accepted. The plugin writes `0.1`.
- **Read telemetry, do not receive it.**
  - Claude Code exports to one endpoint, so Unfold reads the stores the
    estate already fills, through PromQL `increase()` and LogsQL stats.
  - It never reads prompt or tool content.
  - Cost is an API-price estimate.
- **Visibility.**
  - Readers of a linked Work Item see a session and its Agent Trace records.
  - Its owner and administrators also see telemetry and may change its links.
- **Heartbeats are not Action Records.** Link changes are.

## Increments

1. Server, API, MCP tools and browser pages (this change).
2. The plugin and its marketplace (this change).
3. Later: Ploeg's `claude-code` harness installs the plugin, so Runs write
   Agent Trace too. That needs a ploeg-hq change.
4. Later: a Forgejo commit status, or a human-readable note under
   `refs/notes/commits`, so reviewers see attribution in the forge.
5. Later: "waiting for its person" sessions in Now.
