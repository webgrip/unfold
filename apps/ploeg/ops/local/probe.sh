#!/usr/bin/env bash
# Safety-property probes against the local stack — the negative half of the
# demo. demo.sh shows the happy path works; this shows the guards hold.
#
#   docker compose -f ops/local/docker-compose.yml up -d --build
#   ops/local/probe.sh
#
# Every check here is a rule the dispatch plane must never break, exercised
# over the real wire rather than in a unit test: R4 (a stuck outcome always
# carries a reason), the closed failure taxonomy, and R2 (a swept run cannot
# report). Run it after touching pkg/httpapi or pkg/store.
set -uo pipefail

BASE="${PLOEG_URL:-http://localhost:18080}"
SECRET="${PLOEG_VIKUNJA_SECRET:-local-demo-secret}"
COMPOSE="docker compose -f $(dirname "$0")/docker-compose.yml"
FAILED=0

step()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
check() {
  if [ "$2" = "$3" ]; then printf '  PASS  %s: HTTP %s\n' "$1" "$2"
  else printf '  \033[31mFAIL\033[0m  %s: HTTP %s (expected %s)\n' "$1" "$2" "$3"; FAILED=1; fi
}
psql_() { $COMPOSE exec -T postgres psql -U ploeg -d ploeg "$@"; }

assign() {
  local body="{\"event_name\":\"task.assignee.created\",\"data\":{\"task\":{\"id\":$1,\"title\":\"$2\",\"priority\":3},\"assignee\":{\"username\":\"probe\"}}}"
  local sig; sig=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
  curl -fsS -o /dev/null -X POST "$BASE/webhooks/tracker/vikunja" -H "X-Vikunja-Signature: $sig" -d "$body"
}

# Claim until the item under test comes up, retiring anything else terminally.
# A `failed` outcome legitimately re-queues an item for retry (R5), so an
# earlier probe's item can still be at the queue head — correct behaviour that
# a blind claim would mistake for a bug.
claim_for() {
  local want="$1" c got tok
  for _ in $(seq 1 10); do
    c=$(curl -fsS -X POST "$BASE/api/v1/claim" -d '{"team":"alpha"}') || return 1
    got=$(printf '%s' "$c" | sed -n 's/.*"externalId":"\([^"]*\)".*/\1/p')
    tok=$(printf '%s' "$c" | sed -n 's/.*"runToken":"\([^"]*\)".*/\1/p')
    [ -z "$tok" ] && { echo "  queue empty while looking for $want" >&2; return 1; }
    if [ "$got" = "$want" ]; then printf '%s' "$tok"; return 0; fi
    curl -fsS -o /dev/null -X POST "$BASE/api/v1/runs/$tok/outcome" \
      -d '{"outcome":"no_change_needed","summary":"retired by probe"}'
  done
  echo "  could not reach $want" >&2; return 1
}
report() { curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/runs/$1/outcome" -d "$2"; }

curl -fsS "$BASE/readyz" >/dev/null 2>&1 || { echo "ploegd not ready at $BASE"; exit 1; }

step "R4 — a stuck outcome always carries a reason"
assign 201 "R4 probe"; T=$(claim_for 201) || exit 1
check "reasonless stuck refused" "$(report "$T" '{"outcome":"stuck","summary":"gave up"}')" 400
check "stuck with reason accepted" "$(report "$T" '{"outcome":"stuck","summary":"gave up","stuckReason":"needs a human"}')" 204

step "the failure taxonomy is closed"
assign 202 "taxonomy probe"; T=$(claim_for 202) || exit 1
check "published value accepted" "$(report "$T" '{"outcome":"failed","summary":"429","failureReason":"infra_llm"}')" 204
assign 203 "bad taxonomy probe"; T=$(claim_for 203) || exit 1
check "invented value refused" "$(report "$T" '{"outcome":"failed","summary":"x","failureReason":"vibes"}')" 400
check "near miss refused"      "$(report "$T" '{"outcome":"failed","summary":"x","failureReason":"infra-llm"}')" 400

step "R2 — a swept run cannot report (crash-safety needs no cleanup code)"
assign 204 "sweeper probe"; T=$(claim_for 204) || exit 1
echo "  claimed; waiting for the lease to lapse..."
for i in $(seq 1 90); do
  s=$(psql_ -tAc "SELECT state FROM work_items WHERE external_id='204'" 2>/dev/null | tr -d '[:space:]')
  [ "$s" = "queued" ] && { echo "  re-queued after ~${i}s"; break; }
  sleep 1
done
C=$(report "$T" '{"outcome":"pr_opened","summary":"zombie write","links":["https://example.test/pr/9"]}')
case "$C" in
  404|409|410) printf '  PASS  dead token refused: HTTP %s\n' "$C" ;;
  *) printf '  \033[31mFAIL\033[0m  a swept run reported an outcome: HTTP %s\n' "$C"; FAILED=1 ;;
esac

step "resulting state"
psql_ -c "SELECT external_id, state, attempts, infra_failures FROM work_items ORDER BY id"
psql_ -c "SELECT work_item_id, outcome, failure_reason, stuck_reason FROM agent_runs ORDER BY id"

[ "$FAILED" = 0 ] && { printf '\n\033[1mall probes passed\033[0m\n'; exit 0; }
printf '\n\033[31mprobes failed\033[0m\n'; exit 1
