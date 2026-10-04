import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { maskTimeline, type Timeline, type TimelineEvent } from '../src/lib/timeline.ts';

const unfoldSource = fileURLToPath(new URL('../../unfold/src/', import.meta.url));
export const TIMELINE_PATH = fileURLToPath(
  new URL('../src/data/demo-timeline.json', import.meta.url),
);

interface UnfoldApplication {
  server: Server;
  close(): Promise<void>;
}

interface HistoryEvent {
  type: string;
  at: string;
  actor: string;
  runId?: string;
  data: Record<string, unknown>;
}

interface SessionRun {
  id: string;
  roleName: string;
  mode: string;
  status: string;
  verdict?: string;
}

interface Session {
  id: string;
  title: string;
  objective: string;
  status: string;
  budgetUsd: number;
  spentUsd: number;
  costStatus: string;
  branch: string;
  runs: SessionRun[];
  artifacts: { name: string; kind: string; content: string }[];
  candidate?: { status: string; fileCount: number };
}

const WORK_ITEM = {
  title: 'Fix order total rounding',
  objective:
    'Reproduce the rounding regression. Apply a minimal fix, preserve the tests, and independently verify the patch.',
  budgetUsd: 5,
};

/** Starts Unfold's deterministic demo in-process on a free local port. */
export async function startDemo(
  dataDir: string,
): Promise<{ app: UnfoldApplication; base: string }> {
  const previous = process.env['UNFOLD_DATA_DIR'];
  process.env['UNFOLD_DATA_DIR'] = dataDir;
  const main = (await import(pathToFileURL(join(unfoldSource, 'main.ts')).href)) as {
    createApplication(config: unknown): Promise<UnfoldApplication>;
  };
  const config = (await import(pathToFileURL(join(unfoldSource, 'config.ts')).href)) as {
    loadConfig(argv: string[]): unknown;
  };
  const demoConfig = config.loadConfig(['--demo']);
  if (previous === undefined) delete process.env['UNFOLD_DATA_DIR'];
  else process.env['UNFOLD_DATA_DIR'] = previous;
  const app = await main.createApplication(demoConfig);
  await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
  const { port } = app.server.address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${port}` };
}

async function api<T>(base: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'x-unfold-request': '1',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const value = (await response.json()) as T & { error?: { message: string } };
  if (!response.ok) throw new Error(`${path}: ${response.status} ${value.error?.message ?? ''}`);
  return value;
}

/** Runs Unfold's deterministic demo in-process and returns its finished session and event history. */
export async function runDemo(): Promise<{
  session: Session;
  history: HistoryEvent[];
  repository: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'unfold-site-demo-'));
  const { app, base } = await startDemo(root);
  try {
    const bootstrap = await api<{ mode: string; repositories: { id: string; name: string }[] }>(
      base,
      '/api/bootstrap',
    );
    if (bootstrap.mode !== 'demo') throw new Error('Unfold did not start in demo mode');
    const repository = bootstrap.repositories.find((item) => item.id === 'order-service');
    if (!repository) throw new Error('The demo has no order-service repository');
    const created = await api<Session>(base, '/api/sessions', {
      title: WORK_ITEM.title,
      objective: WORK_ITEM.objective,
      repositoryId: repository.id,
      crewId: 'delivery',
      runtime: 'demo',
      budgetUsd: WORK_ITEM.budgetUsd,
    });
    await api(base, `/api/sessions/${created.id}/start`, {});
    const deadline = Date.now() + 60_000;
    let session: Session | undefined;
    while (Date.now() < deadline) {
      const current = await api<Session>(base, `/api/sessions/${created.id}`);
      if (['completed', 'failed', 'cancelled'].includes(current.status)) {
        session = current;
        break;
      }
      await delay(100);
    }
    if (!session) throw new Error('The demo did not finish within 60 seconds');
    const history = await api<HistoryEvent[]>(base, `/api/sessions/${created.id}/history`);
    return { session, history, repository: repository.name };
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
}

function testResults(output: unknown): { name: string; ok: boolean }[] {
  return (String(output ?? '').split(/^✖ failing tests:/mu)[0] ?? '')
    .split('\n')
    .map((line) => /^([✔✖]) (.+?)(?: \([\d.]+m?s\))?$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ name: match[2] ?? '', ok: match[1] === '✔' }));
}

/** Turns a finished demo session into the site's timeline, with ids and clock times normalised. */
export function buildTimeline(
  session: Session,
  history: HistoryEvent[],
  repository: string,
): Timeline {
  const start = Date.parse(history[0]?.at ?? '');
  const runs = new Map(session.runs.map((run, index) => [run.id, `run-${index + 1}`]));
  const at = (event: HistoryEvent) => Math.round((Date.parse(event.at) - start) / 100) * 100;
  const events: TimelineEvent[] = [];
  for (const event of history) {
    const run = event.runId ? runs.get(event.runId) : undefined;
    const data = event.data;
    switch (event.type) {
      case 'session.created':
        events.push({ at: at(event), kind: 'work-item' });
        break;
      case 'session.started':
        events.push({ at: at(event), kind: 'shift-started' });
        break;
      case 'run.started':
        events.push({
          at: at(event),
          kind: 'run-started',
          run: run ?? '',
          role: String(data['role']),
          mode: String(data['mode']),
        });
        break;
      case 'tool': {
        const status = String(data['status']);
        if (status === 'running') break;
        const tests = testResults(data['output']);
        if (tests.length)
          events.push({
            at: at(event),
            kind: 'check',
            run: run ?? '',
            phase: String(data['phase']),
            command: String(data['name']),
            exitCode: Number(data['exitCode']),
            expectedFailure: data['expectedFailure'] === true,
            tests,
          });
        else
          events.push({
            at: at(event),
            kind: 'edit',
            run: run ?? '',
            command: String(data['name']),
          });
        break;
      }
      case 'run.finished':
        events.push({
          at: at(event),
          kind: 'run-finished',
          run: run ?? '',
          status: String(data['status']),
          ...(data['verdict'] ? { verdict: String(data['verdict']) } : {}),
        });
        break;
      case 'candidate.ready':
        events.push({ at: at(event), kind: 'change-ready' });
        break;
      case 'session.completed':
        events.push({
          at: at(event),
          kind: 'shift-finished',
          merged: data['merged'] === true,
        });
        break;
      default:
        break;
    }
  }
  const diff = session.artifacts.find((artifact) => artifact.kind === 'diff')?.content ?? '';
  return {
    schema: 1,
    source: "apps/unfold createApplication(loadConfig(['--demo']))",
    modelCalls: 0,
    workItem: { title: session.title, objective: session.objective, repository },
    budget: {
      currency: 'USD',
      authorized: session.budgetUsd,
      spent: session.spentUsd,
      costStatus: session.costStatus,
    },
    roles: session.runs.map((run) => ({
      run: runs.get(run.id) ?? '',
      role: run.roleName,
      mode: run.mode,
    })),
    outcome: {
      status: session.status,
      verdict: session.runs.find((run) => run.mode === 'read')?.verdict ?? '',
      files: session.candidate?.fileCount ?? 0,
      merged: false,
    },
    diff: diff
      .split('\n')
      .filter((line) => /^[-+ @]/.test(line) && !/^(---|\+\+\+)/.test(line))
      .join('\n'),
    events,
  };
}

function firstDifference(a: unknown, b: unknown, path = '$'): string | undefined {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b))
    return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
  if (a !== null && typeof a === 'object' && b !== null && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const found = firstDifference(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (found) return found;
    }
    return undefined;
  }
  return a === b ? undefined : `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

async function videoFreshness(): Promise<string | undefined> {
  try {
    const manifest = JSON.parse(
      await readFile(new URL('../src/data/demo-video.json', import.meta.url), 'utf8'),
    ) as { unfoldVersion: string; sources: unknown[] };
    if (!manifest.sources.length)
      return 'notice: there is no demo video yet; run mise run site-video.';
    const unfold = JSON.parse(
      await readFile(new URL('../../unfold/package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    if (manifest.unfoldVersion !== unfold.version)
      return `notice: the demo video was recorded with Unfold ${manifest.unfoldVersion}; Unfold is now ${unfold.version}. Run mise run site-video when the workbench looks different.`;
  } catch {
    return 'notice: src/data/demo-video.json is unreadable; run mise run site-video.';
  }
  return undefined;
}

async function main(): Promise<void> {
  const { session, history, repository } = await runDemo();
  if (session.status !== 'completed') throw new Error(`The demo ended ${session.status}`);
  const fresh = buildTimeline(session, history, repository);
  if (process.argv.includes('--check')) {
    const committed = JSON.parse(await readFile(TIMELINE_PATH, 'utf8')) as Timeline;
    const difference = firstDifference(maskTimeline(committed), maskTimeline(fresh));
    if (difference) {
      process.stderr.write(
        `The committed demo timeline no longer matches Unfold's deterministic demo.\n${difference}\nRun: mise run site-timeline\n`,
      );
      process.exitCode = 1;
      return;
    }
    const notice = await videoFreshness();
    process.stdout.write(
      `PASS: the committed demo timeline matches the demo (${fresh.events.length} events, ${fresh.modelCalls} model calls).\n${notice ? `${notice}\n` : ''}`,
    );
    return;
  }
  await writeFile(TIMELINE_PATH, `${JSON.stringify(fresh, null, 2)}\n`);
  process.stdout.write(`Wrote ${TIMELINE_PATH} (${fresh.events.length} events).\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
