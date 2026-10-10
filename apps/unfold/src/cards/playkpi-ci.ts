import { goRound, rfc3339 } from './go.ts';
import { compareStrings } from './rarity-go.ts';
import { between, kindForcePush, kindPush, sinceReady, type Play, type Run } from './playkpi-timeline.ts';

/** One of a play's slowest CI jobs: its name and its longest attempt in seconds. */
export type SlowJob = { name: string; seconds: number };

/** How many jobs `CI.slowest` lists. */
export const slowestJobs = 3;

/** How a play's CI went, serialized as Ploeg's `playkpi.CI` (ADR-0058). */
export type CI = {
  runs: number;
  failedRuns: number;
  reruns: number;
  lastGreenSeconds: number | null;
  queueSeconds: number | null;
  timeToGreenSeconds: number | null;
  minutes: number | null;
  slowest: SlowJob[];
  firstPassGreen: boolean | null;
  source: string;
  truncated: boolean;
  capturedAt: string;
};

const zeroTime = -62135596800000;

function before(a: Run, b: Run): number {
  const ta = a.createdAt ?? zeroTime;
  const tb = b.createdAt ?? zeroTime;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return compareStrings(a.id, b.id);
}

function firstGreen(runs: readonly Run[]): number | null {
  const latest = new Map<string, Map<string, Run>>();
  for (const r of runs) {
    let byWorkflow = latest.get(r.sha);
    if (!byWorkflow) latest.set(r.sha, (byWorkflow = new Map()));
    byWorkflow.set(r.workflow ?? '', r);
  }
  let first: number | null = null;
  for (const byWorkflow of latest.values()) {
    let at = zeroTime;
    let green = true;
    for (const r of byWorkflow.values()) {
      if (r.status !== 'success' || r.completedAt == null) {
        green = false;
        break;
      }
      if (r.completedAt > at) at = r.completedAt;
    }
    if (green && (first === null || at < first)) first = at;
  }
  return first;
}

function readyHead(p: Play, readyAt: number | null): string {
  let head = '';
  let first = '';
  for (const e of p.events ?? []) {
    if ((e.kind !== kindPush && e.kind !== kindForcePush) || !e.headSha) continue;
    if (first === '') first = e.headSha;
    if (readyAt !== null && !(e.at > readyAt)) head = e.headSha;
  }
  return head === '' ? first : head;
}

function firstPassGreen(p: Play, runs: readonly Run[], readyAt: number | null): boolean | null {
  let head = readyHead(p, readyAt);
  if (head === '' && runs.length > 0) head = runs[0]!.sha;
  for (const r of runs) {
    if (r.sha !== head) continue;
    switch (r.status) {
      case 'success':
        return !(r.jobs ?? []).some(j => j.attempt > 1);
      case 'failure':
      case 'error':
        return false;
      default:
        return null;
    }
  }
  return null;
}

/** A play's CI as Ploeg's `playkpi` derives it, or null until CI was read; readyAt is the play's readiness in epoch milliseconds. */
export function deriveCI(p: Play, readyAt: number | null): CI | null {
  if (p.ciCapturedAt == null) return null;
  const runs = [...(p.runs ?? [])].sort(before);
  let failedRuns = 0;
  let reruns = 0;
  const groups = new Map<string, number>();
  let queue = 0;
  let busy = 0;
  let queued = false;
  let timed = false;
  const slowest = new Map<string, number>();
  for (const r of runs) {
    if (r.status === 'failure' || r.status === 'error') failedRuns++;
    const key = JSON.stringify([r.sha, r.workflow ?? '']);
    groups.set(key, (groups.get(key) ?? 0) + 1);
    let attempts = 1;
    for (const j of r.jobs ?? []) {
      attempts = Math.max(attempts, j.attempt);
      if (j.queuedSeconds != null) {
        queue += j.queuedSeconds;
        queued = true;
      }
      const d = between(j.startedAt, j.completedAt);
      if (d !== null) {
        busy += d;
        timed = true;
        const longest = slowest.get(j.name);
        if (longest === undefined || d > longest) slowest.set(j.name, d);
      }
    }
    reruns += attempts - 1;
  }
  for (const n of groups.values()) reruns += n - 1;
  const slow = [...slowest].map(([name, s]) => ({ name, seconds: s }));
  slow.sort((a, b) => (a.seconds !== b.seconds ? b.seconds - a.seconds : compareStrings(a.name, b.name)));

  let lastGreenSeconds: number | null = null;
  const head = p.headSha ?? '';
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i]!;
    if (r.sha === head && head !== '' && r.status === 'success') {
      lastGreenSeconds = between(r.startedAt, r.completedAt);
      break;
    }
  }
  const green = firstGreen(runs);
  return {
    runs: (p.runs ?? []).length,
    failedRuns,
    reruns,
    lastGreenSeconds,
    queueSeconds: queued ? queue : null,
    timeToGreenSeconds: green !== null && readyAt !== null ? sinceReady(readyAt, green) : null,
    minutes: timed ? goRound((busy / 60) * 10) / 10 : null,
    slowest: slow.slice(0, slowestJobs),
    firstPassGreen: firstPassGreen(p, runs, readyAt),
    source: p.ciSource ?? '',
    truncated: p.ciTruncated === true,
    capturedAt: rfc3339(p.ciCapturedAt),
  };
}
