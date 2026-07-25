#!/usr/bin/env bash
# The tracer-bullet demo: a tracker assignment becomes a leased, audited,
# completed run — the whole dispatch-plane loop against the local compose
# stack, with this script playing both the tracker (signed webhook) and the
# agent (claim / checkpoint / outcome).
#
#   docker compose -f ops/local/docker-compose.yml up -d --build
#   ops/local/demo.sh
set -euo pipefail

BASE="${PLOEG_URL:-http://localhost:18080}"
SECRET="${PLOEG_VIKUNJA_SECRET:-local-demo-secret}"
COMPOSE="docker compose -f $(dirname "$0")/docker-compose.yml"

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "waiting for ploegd"
for i in $(seq 1 30); do curl -fsS "$BASE/readyz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "$BASE/readyz" >/dev/null || { echo "ploegd not ready at $BASE"; exit 1; }

step "tracker assigns ticket #101 (signed webhook)"
BODY='{"event_name":"task.assignee.created","data":{"task":{"id":101,"title":"Demo: implement the widget","priority":4},"assignee":{"username":"ryan"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' -X POST "$BASE/webhooks/tracker/vikunja" \
  -H "X-Vikunja-Signature: $SIG" -d "$BODY"

step "queue for team alpha"
curl -fsS "$BASE/api/v1/queue/alpha"; echo

step "agent claims the work item"
CLAIM=$(curl -fsS -X POST "$BASE/api/v1/claim" -d '{"team":"alpha"}')
echo "$CLAIM"
TOKEN=$(printf '%s' "$CLAIM" | sed -n 's/.*"runToken":"\([^"]*\)".*/\1/p')

step "agent checkpoints progress"
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' -X POST "$BASE/api/v1/runs/$TOKEN/checkpoint" \
  -d '{"phase":"branch_created","branch":"ploeg/101-widget"}'

step "agent reports outcome: pr_opened"
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' -X POST "$BASE/api/v1/runs/$TOKEN/outcome" \
  -d '{"outcome":"pr_opened","summary":"Widget implemented","links":["https://example.test/pr/1"]}'

step "audit trail (every mutation is a row)"
$COMPOSE exec -T postgres psql -U ploeg -d ploeg \
  -c "SELECT at::time(0), actor, action, work_item_id FROM audit_log ORDER BY id"

step "runs"
$COMPOSE exec -T postgres psql -U ploeg -d ploeg \
  -c "SELECT team, outcome, summary, links FROM agent_runs ORDER BY id"

step "done — item lifecycle: ingested -> queued -> leased -> done"
