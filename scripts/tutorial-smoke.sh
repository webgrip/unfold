#!/usr/bin/env bash
# Usage: scripts/tutorial-smoke.sh [--check]
#   --check  report only whether the prerequisites are present; writes ready=true|false to GITHUB_OUTPUT.
# Runs the two commands in docs/workflows/local-demo.md: the interactive launcher (until ready, then SIGTERM) and --smoke.
# Environment: GLIDE_TUTORIAL_COMMAND, GLIDE_TUTORIAL_SMOKE_COMMAND, GLIDE_TUTORIAL_TIMEOUT (seconds, default 600).
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command="${GLIDE_TUTORIAL_COMMAND:-mise run demo-unified}"
smoke_command="${GLIDE_TUTORIAL_SMOKE_COMMAND:-mise exec -- node apps/vloer/scripts/unified-demo.ts --smoke}"
ready_timeout="${GLIDE_TUTORIAL_TIMEOUT:-600}"
stop_timeout=60

missing=()
if [ "$(id -u)" = 0 ]; then
  missing+=("a non-root user (PostgreSQL refuses to run as root)")
fi
if [ -z "${PG_BIN:-}" ] && ! command -v initdb >/dev/null 2>&1; then
  for candidate in /usr/lib/postgresql/*/bin; do
    if [ -x "$candidate/initdb" ] && [ -x "$candidate/postgres" ]; then
      export PG_BIN="$candidate"
    fi
  done
fi
for binary in initdb postgres; do
  if [ -n "${PG_BIN:-}" ]; then
    [ -x "$PG_BIN/$binary" ] || missing+=("$binary in PG_BIN")
  else
    command -v "$binary" >/dev/null 2>&1 || missing+=("$binary on PATH or in PG_BIN")
  fi
done
command -v git >/dev/null 2>&1 || missing+=("git")
if [ -z "${GLIDE_TUTORIAL_COMMAND:-}" ]; then
  command -v mise >/dev/null 2>&1 || missing+=("mise")
fi

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'tutorial-smoke: skipped; missing prerequisites:\n'
  printf '  - %s\n' "${missing[@]}"
  [ "${1:-}" = --check ] && [ -n "${GITHUB_OUTPUT:-}" ] && echo 'ready=false' >> "$GITHUB_OUTPUT"
  exit 0
fi
if [ "${1:-}" = --check ]; then
  echo 'tutorial-smoke: prerequisites present'
  [ -n "${GITHUB_OUTPUT:-}" ] && echo 'ready=true' >> "$GITHUB_OUTPUT"
  exit 0
fi

log="$(mktemp "${TMPDIR:-/tmp}/tutorial-smoke.XXXXXX")"
cd "$root" || exit 1
echo "tutorial-smoke: running '$command' (deterministic demo, no model calls)"
bash -c "$command" >"$log" 2>&1 &
wrapper=$!

fail() {
  echo "tutorial-smoke: FAILED: $1" >&2
  echo '--- launcher output ---' >&2
  cat "$log" >&2
  if [ -n "$wrapper" ]; then
    pid="$(grep -o '"pid":[0-9]*' "$log" | head -n 1 | cut -d: -f2)"
    [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null
    kill -TERM "$wrapper" 2>/dev/null
    wait "$wrapper" 2>/dev/null
  fi
  rm -f "$log"
  exit 1
}

deadline=$((SECONDS + ready_timeout))
until grep -q '"event":"unified-demo.ready"' "$log"; do
  kill -0 "$wrapper" 2>/dev/null || fail 'the launcher exited before unified-demo.ready'
  [ "$SECONDS" -lt "$deadline" ] || fail "no unified-demo.ready within ${ready_timeout}s"
  sleep 1
done
ready="$(grep '"event":"unified-demo.ready"' "$log" | head -n 1)"
pid="$(printf '%s' "$ready" | grep -o '"pid":[0-9]*' | cut -d: -f2)"
url="$(printf '%s' "$ready" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)"
printf '%s' "$ready" | grep -q '"modelCalls":0' || fail 'the ready event does not record zero model calls'
[ -n "$pid" ] && [ -n "$url" ] || fail 'the ready event lacks pid or url'
echo "tutorial-smoke: ready at $url (launcher pid $pid)"
if command -v curl >/dev/null 2>&1; then
  curl --fail --silent --show-error --max-time 10 --output /dev/null "$url/" || fail "the workbench at $url did not answer"
  echo 'tutorial-smoke: workbench answered'
fi

kill -TERM "$pid" 2>/dev/null || fail "could not signal launcher pid $pid"
deadline=$((SECONDS + stop_timeout))
until grep -q '"event":"unified-demo.stopped"' "$log"; do
  [ "$SECONDS" -lt "$deadline" ] || fail "no unified-demo.stopped within ${stop_timeout}s"
  sleep 1
done
wait "$wrapper" 2>/dev/null
wrapper=''
data_dir="$(grep -o '"dataDir":"[^"]*"' "$log" | head -n 1 | cut -d'"' -f4)"
[ -z "$data_dir" ] || [ ! -e "$data_dir" ] || fail "the temporary directory $data_dir was not removed"
echo 'tutorial-smoke: the documented demo started, served the workbench and cleaned up'

echo "tutorial-smoke: running '$smoke_command'"
if ! timeout "$ready_timeout" bash -c "$smoke_command" >"$log" 2>&1; then
  fail "'$smoke_command' did not exit cleanly"
fi
grep -q '"event":"unified-demo.smoke-passed"' "$log" || fail 'no unified-demo.smoke-passed'
grep -q '"event":"unified-demo.stopped"' "$log" || fail 'no unified-demo.stopped after the automated smoke check'
rm -f "$log"
echo 'tutorial-smoke: passed; the automated smoke check completed with zero model calls and cleaned up'
