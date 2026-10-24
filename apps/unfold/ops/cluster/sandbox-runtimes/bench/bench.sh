#!/bin/sh
set -eu
repo="${BENCH_REPO:-https://github.com/expressjs/express.git}"
ref="${BENCH_REF:-v5.1.0}"
work=/work
export HOME="$work/home" npm_config_cache="$work/npm-cache" npm_config_update_notifier=false
mkdir -p "$HOME"
now() { date +%s%N; }
phase() {
  name="$1"; shift
  start=$(now)
  if "$@" >"$work/$name.log" 2>&1; then status=ok; else status=failed; fi
  end=$(now)
  echo "{\"runtime\":\"${BENCH_RUNTIME:-unknown}\",\"phase\":\"$name\",\"status\":\"$status\",\"ms\":$(( (end - start) / 1000000 ))}"
  [ "$status" = ok ] || { tail -n 20 "$work/$name.log" >&2; exit 1; }
}
files() {
  mkdir -p "$work/files"
  i=0
  while [ "$i" -lt 20000 ]; do echo "$i" > "$work/files/f$i"; i=$((i + 1)); done
  find "$work/files" -type f | wc -l
  rm -rf "$work/files"
}
echo "{\"runtime\":\"${BENCH_RUNTIME:-unknown}\",\"kernel\":\"$(uname -r)\",\"node\":\"${NODE_NAME:-}\"}"
phase clone git clone --depth 1 --branch "$ref" "$repo" "$work/repo"
cd "$work/repo"
install() { if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi; }
phase install install
phase test npm test
phase small-files files
