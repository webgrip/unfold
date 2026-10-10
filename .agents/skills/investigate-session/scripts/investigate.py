#!/usr/bin/env python3
"""Read-only first checks for a stopped Unfold session on the homelab cluster.

Usage: investigate.py <session-id-or-prefix> [--context admin@kubernetes] [--namespace ploeg] [--window 120]
"""
import argparse
import json
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

UNFOLD_QUERY = r"""
const {DatabaseSync}=require('node:sqlite');
const [prefix, windowSeconds]=[process.argv[1], Number(process.argv[2])];
const db=new DatabaseSync('/data/workbench/unfold.sqlite',{readOnly:true});
const rows=db.prepare('SELECT id, body FROM sessions WHERE id LIKE ?').all(prefix+'%');
if(rows.length!==1){console.log(JSON.stringify({error:`${rows.length} sessions match ${prefix}`, matches:rows.map(r=>r.id)}));process.exit(0);}
const id=rows[0].id; const s=JSON.parse(rows[0].body);
const stopTypes=['execution.authority_lost','execution.reconciliation_required','execution.reconciliation_pending','run.failed','session.failed','session.interrupted'];
const stop=db.prepare(`SELECT at,type FROM events WHERE session_id=? AND type IN (${stopTypes.map(()=>'?').join(',')}) ORDER BY id LIMIT 1`).get(id,...stopTypes)
  ?? db.prepare('SELECT at,type FROM events WHERE session_id=? ORDER BY id DESC LIMIT 1').get(id);
const from=new Date(Date.parse(stop.at)-windowSeconds*1000).toISOString();
const types=db.prepare('SELECT type, count(*) c, sum(length(data)) bytes FROM events WHERE session_id=? GROUP BY type ORDER BY c DESC').all(id);
const perSecond=db.prepare('SELECT substr(at,1,19) sec, count(*) c FROM events WHERE session_id=? AND at>=? GROUP BY sec ORDER BY sec').all(id,from);
const notable=db.prepare("SELECT at,type,actor,run_id runId,substr(data,1,400) data FROM events WHERE session_id=? AND type NOT IN ('message','tool') ORDER BY id").all(id);
const lastMessages=db.prepare("SELECT at,actor,substr(data,1,160) data FROM events WHERE session_id=? AND type='message' AND at<=? ORDER BY id DESC LIMIT 3").all(id,stop.at);
console.log(JSON.stringify({id, title:s.title, status:s.status, blocker:s.blocker, runtime:s.runtime, budgetUsd:s.budgetUsd, spentUsd:s.spentUsd, observedUsd:s.observedUsd,
  execution:s.execution, runs:(s.runs||[]).map(r=>({role:r.roleName,status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt,verdict:r.verdict,summary:(r.summary||'').slice(0,200)})),
  stop, types, perSecond, notable, lastMessages}));
"""


def run(cmd, check=True):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:6])}…: {result.stderr.strip()[:400]}")
    return result.stdout


def kubectl(args, ctx, ns=None, check=True):
    return run(["kubectl", "--context", ctx, *(["-n", ns] if ns else []), *args], check)


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def local(value):
    return value.astimezone().strftime("%H:%M:%S.%f")[:-3] if value else "—"


def section(title):
    print(f"\n## {title}")


@contextmanager
def port_forward(ctx, ns, service, remote):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    proc = subprocess.Popen(["kubectl", "--context", ctx, "-n", ns, "port-forward", service, f"{port}:{remote}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.1)
        yield f"http://127.0.0.1:{port}"
    finally:
        proc.terminate()


def http(url, params):
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=30) as response:
        return response.read().decode()


def unfold_facts(ctx, ns, prefix, window):
    pod = kubectl(["get", "pod", "-l", "app.kubernetes.io/name=unfold", "-o", "jsonpath={.items[0].metadata.name}"], ctx, ns).strip()
    out = kubectl(["exec", pod, "-c", "workbench", "--", "node", "-e", UNFOLD_QUERY, prefix, str(window)], ctx, ns)
    return pod, json.loads(out)


def ploeg_events(ctx, ns, execution_id):
    primary = kubectl(["get", "cluster", "ploeg-db", "-o", "jsonpath={.status.currentPrimary}"], ctx, ns).strip()
    sql = ("SELECT revision, to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), kind, detail->>'state', left(coalesce(detail->>'text',''),80) "
           f"FROM operator_execution_events WHERE execution_id='{execution_id}' ORDER BY revision")
    head = ("SELECT state, revision, generation, to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') "
            f"FROM operator_executions WHERE id='{execution_id}'")
    psql = lambda q: kubectl(["exec", primary, "-c", "postgres", "--", "psql", "-U", "postgres", "-d", "app", "-AtF", "\t", "-v", "default_transaction_read_only=on", "-c", q], ctx, ns)
    rows = [line.split("\t") for line in psql(sql).splitlines() if line]
    current = psql(head).strip().split("\t")
    return primary, rows, current


def pods_and_rollouts(ctx, ns, start, end):
    pods = json.loads(kubectl(["get", "pods", "-o", "json"], ctx, ns))["items"]
    lines = []
    for pod in pods:
        name = pod["metadata"]["name"]
        if not (name.startswith("unfold-") or name.startswith("ploeg-") and not name.startswith("ploeg-worker")):
            continue
        if pod["status"].get("phase") != "Running":
            continue
        started = parse_time(pod["status"]["startTime"])
        restarts = sum(c.get("restartCount", 0) for c in pod["status"].get("containerStatuses", []))
        last = [c.get("lastState", {}).get("terminated") for c in pod["status"].get("containerStatuses", [])]
        flag = " ← started after the stop" if started > end else (" ← started inside the window" if started >= start else "")
        lines.append(f"- {name}: started {started.astimezone():%Y-%m-%d %H:%M:%S}, restarts {restarts}{flag}")
        for term in filter(None, last):
            lines.append(f"  last termination: {term.get('reason')} at {term.get('finishedAt')} (exit {term.get('exitCode')})")
    replicasets = json.loads(kubectl(["get", "rs", "-o", "json"], ctx, ns))["items"]
    for rs in sorted(replicasets, key=lambda r: r["metadata"]["creationTimestamp"]):
        created = parse_time(rs["metadata"]["creationTimestamp"])
        if start - timedelta(minutes=10) <= created <= end + timedelta(minutes=10) and rs["metadata"]["name"].split("-")[0] in ("unfold", "ploeg"):
            image = rs["spec"]["template"]["spec"]["containers"][0]["image"].split("/")[-1][:70]
            lines.append(f"- rollout {rs['metadata']['name']} created {local(created)} → {image}")
    return lines


def cluster_events(vlogs, ns, start, end):
    query = f'_time:[{start:%Y-%m-%dT%H:%M:%SZ}, {end:%Y-%m-%dT%H:%M:%SZ}] job:"kubernetes/events" namespace:{ns} (unfold OR ploeg) -disaster-recovery -kyverno -Kustomization | sort by (_time)'
    out = http(f"{vlogs}/select/logsql/query", {"query": query, "limit": 200})
    seen = []
    for line in out.splitlines():
        row = json.loads(line)
        msg = row.get("_msg", "")
        reason = next((p[7:] for p in msg.split() if p.startswith("reason=")), "")
        name = msg.split()[0].removeprefix("name=") if msg else ""
        if reason in ("ReconciliationSucceeded", "PolicyViolation", "Pulled", "Created", "Scheduled"):
            continue
        text = msg.split('msg="', 1)[-1][:140] if 'msg="' in msg else ""
        if any(f"{name} {reason}: {text}" in line for line in seen):
            continue
        seen.append(f"- {row.get('_time', '')[11:19]}Z {name} {reason}: {text}")
    return seen


def container_logs(vlogs, ns, start, end):
    query = f'_time:[{start:%Y-%m-%dT%H:%M:%SZ}, {end:%Y-%m-%dT%H:%M:%SZ}] namespace:{ns} container:(workbench OR ploegd) -healthz -readyz | sort by (_time)'
    out = http(f"{vlogs}/select/logsql/query", {"query": query, "limit": 60})
    return [f"- {json.loads(l).get('_time', '')[11:23]}Z {json.loads(l).get('container')}: {json.loads(l).get('_msg', '')[:200]}" for l in out.splitlines()]


def metrics(vm, ns, pod, start, end):
    series = {
        "cpu cores": f'sum(rate(container_cpu_usage_seconds_total{{namespace="{ns}",pod="{pod}",container!=""}}[1m]))',
        "cpu throttled periods/s": f'sum(rate(container_cpu_cfs_throttled_periods_total{{namespace="{ns}",pod="{pod}"}}[1m]))',
        "memory MiB": f'sum(container_memory_working_set_bytes{{namespace="{ns}",pod="{pod}",container!=""}})/1048576',
    }
    lines = []
    for label, query in series.items():
        data = json.loads(http(f"{vm}/api/v1/query_range", {"query": query, "start": start.timestamp(), "end": end.timestamp(), "step": "30s"}))["data"]["result"]
        values = " ".join(f"{float(v):.2f}" for _, v in data[0]["values"]) if data else "no data"
        lines.append(f"- {label}: {values}")
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("session")
    parser.add_argument("--context", default="admin@kubernetes")
    parser.add_argument("--namespace", default="ploeg")
    parser.add_argument("--window", type=int, default=120, help="seconds before the stop to inspect")
    args = parser.parse_args()
    ctx, ns = args.context, args.namespace

    pod, s = unfold_facts(ctx, ns, args.session, args.window)
    if "error" in s:
        sys.exit(f"{s['error']}: {s.get('matches')}")
    stop = parse_time(s["stop"]["at"])
    start, end = stop - timedelta(seconds=args.window), stop + timedelta(seconds=30)

    print(f"# Session {s['id'][:8]} — {s['title']}")
    print(f"status {s['status']} · runtime {s['runtime']} · spent {s.get('spentUsd')} / observed {s.get('observedUsd')} of {s.get('budgetUsd')} USD")
    print(f"blocker: {s.get('blocker') or '—'}")
    print(f"first stop event: {s['stop']['type']} at {local(stop)} (local) · Unfold pod {pod}")

    section("Runs")
    for r in s["runs"]:
        print(f"- {r['role']}: {r['status']} (started {r['startedAt']}, finished {r.get('finishedAt') or '—'}) verdict={r.get('verdict') or '—'}")
    if s["lastMessages"]:
        tail = "".join(json.loads(m["data"]).get("text", "") for m in reversed(s["lastMessages"]) if m["data"].startswith("{") and m["data"].endswith("}"))
        print(f"last streamed text before the stop: {tail!r}")

    section("Unfold events")
    print("by type: " + ", ".join(f"{t['type']}={t['c']}" for t in s["types"]))
    busiest = max(s["perSecond"], key=lambda r: r["c"], default=None)
    if busiest:
        print(f"per second in the {args.window}s before the stop: peak {busiest['c']} at {busiest['sec']}Z, mean {sum(r['c'] for r in s['perSecond']) / max(len(s['perSecond']), 1):.0f} over {len(s['perSecond'])} active seconds")
    for e in s["notable"]:
        at = parse_time(e["at"])
        if at >= start - timedelta(minutes=5):
            print(f"- {local(at)} {e['type']} ({e['actor']}) {e['data'][:200]}")

    execution = s.get("execution") or {}
    if execution.get("id"):
        section(f"Ploeg execution {execution['id'][:12]} (work item {execution.get('workItemId')})")
        primary, rows, current = ploeg_events(ctx, ns, execution["id"])
        previous, gaps = None, []
        for rev, at, kind, state, text in rows:
            when = parse_time(at)
            gap = (when - previous).total_seconds() if previous else 0
            gaps.append((gap, previous, when))
            print(f"- r{rev} {local(when)} {kind} state={state}{f'  (+{gap:.1f}s)' if previous else ''}{'  ' + text if text else ''}")
            previous = when
        if current and current[0]:
            print(f"now: state={current[0]} revision={current[1]} generation={current[2]} lease expires {local(parse_time(current[3]))}")
        heartbeats = [parse_time(at) for _, at, kind, _, _ in rows if kind == "execution.heartbeat"]
        before = [h for h in heartbeats if h <= stop]
        if before:
            last = before[-1]
            print(f"last heartbeat Ploeg accepted before the stop: {local(last)} ({(stop - last).total_seconds():.1f}s before it)")
        if gaps:
            worst = max(gaps)
            print(f"largest gap between Ploeg revisions: {worst[0]:.1f}s ({local(worst[1])} → {local(worst[2])})")
    else:
        section("Ploeg execution")
        print("this session has no Ploeg execution binding")

    section("Pods and rollouts")
    for line in pods_and_rollouts(ctx, ns, start, end):
        print(line)

    try:
        with port_forward(ctx, "observability", "svc/vlsingle-victorialogs", 9428) as vlogs:
            section("Kubernetes events in the window (VictoriaLogs)")
            for line in cluster_events(vlogs, ns, start, end) or ["- none"]:
                print(line)
            section("Unfold and Ploeg container logs in the window")
            for line in container_logs(vlogs, ns, start, end) or ["- none (both were silent)"]:
                print(line)
        with port_forward(ctx, "observability", "svc/vmsingle-vmsingle", 8428) as vm:
            section(f"Unfold pod resources, 30s steps {local(start)} → {local(end)}")
            for line in metrics(vm, ns, pod, start, end):
                print(line)
    except Exception as error:
        print(f"observability unavailable: {error}")


if __name__ == "__main__":
    main()
