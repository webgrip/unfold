import { sessionProgress } from '../../public/core/progress.js';
import type { PloegCard, PloegDetail, PloegRun, PloegState } from '../ploeg.ts';
import type { Event, Session } from '../types.ts';

/** How sure a brief's spend figure is: settled by Ploeg, still provisional, not reported, or a demo with no spend. */
export type BriefSpendStatus = 'settled' | 'provisional' | 'unknown' | 'demo';

/** One Run as a brief shows it: what it did in words, never its prompt, tools, findings or failure detail. */
export type BriefRun = { role: string; round: number; state: PloegRun['state']; outcome: string | null; verdict: string | null; summary: string; problem: string; solution: string; startedAt: string | null; finishedAt: string | null };

/** One Role of the session that drives a Work Item, as the progress statechart labels it: never its summary or transcript. */
export type BriefStep = { role: string; mode: 'write' | 'read'; label: string; verdict: string | null; verdictRecorded: boolean };

/**
 * What the progress statechart (`public/core/progress.js`) says about the session that drives a Work Item, cut down to
 * the parts that are fixed vocabulary or Role names. A failure message, a blocker, a review note and tool activity are
 * left out, because they can carry internals. Every surface reads the same statechart, so an answer built from this
 * says what the UI says.
 */
export type BriefProgress = {
  phase: string;
  label: string;
  headline: string;
  next: string;
  stop: string | null;
  working: { role: string; round: number | null } | null;
  steps: BriefStep[];
  spend: { status: 'settled' | 'observed' | 'demo' | 'unknown'; text: string; note: string };
  actions: string[];
  pullRequest: number | null;
};

/** The session that drives a Work Item and its durable events, for the brief's progress. `viewer` hides mutating actions. */
export type BriefSession = { session: Session; events: Event[]; now: number; viewer: boolean };

/** The Client-safe projection of a Work Item that an Ask answers from (system ADR-0031). Built from an allow-list of fields, so a fact Ploeg adds later stays out until someone adds it here. */
export type WorkItemBrief = {
  workItemId: string;
  title: string;
  objective: string;
  state: PloegState;
  stateText: string;
  stoppedBecause: string | null;
  pullRequest: { number: number | null; status: 'open' | 'conflicted' | 'finished' | 'left' } | null;
  previews: { environment: string; since: string | null }[];
  runs: BriefRun[];
  spend: { status: BriefSpendStatus; deliveryUsd: number | null };
  progress: BriefProgress | null;
  updatedAt: string;
  truncated: boolean;
  demo: boolean;
};

const stateText: Record<PloegState, string> = {
  ingested: 'received, not queued yet',
  queued: 'waiting to start',
  leased: 'being worked on now',
  awaiting_review: 'finished by the agents and waiting for a person to review the pull request',
  needs_human: 'stopped and waiting for a person',
  proposed: 'proposed and waiting for approval before any work starts',
  done: 'done',
  withdrawn: 'withdrawn; no more work will happen on it',
  stale: 'on hold because its tracker item changed',
};

const reasonText: Record<string, string> = {
  pool_exhausted: 'it used up its budget',
  plan_exhausted: 'every planned round of work ran without a change being approved',
  review_failed: 'no agent could review it: the reviewer kept failing',
  fix_round_cap_reached: 'its fix rounds ran out',
  budget_exhausted_before_fix_round: 'its budget ran out before another fix round',
  writing_run_failed_repeatedly: 'the agent writing the change kept failing',
  writing_run_killed_repeatedly: 'the cluster kept stopping the agent writing the change',
  operator_cancelled: 'the session working on it was cancelled',
  operator_failed: 'the session working on it failed',
  operator_admission_expired: 'the session meant to work on it never started',
  operator_adopted: 'a person took it over',
  withdrawn_by_operator: 'a person withdrew it',
  withdrawn_closed: 'its tracker item was closed',
  withdrawn_session_ended: 'the session that ran it ended',
  withdrawn_unassigned: 'it was unassigned in the tracker',
};

const limits = { objective: 4000, runText: 600, runs: 12, previews: 5 };
const code = /^[a-z][a-z0-9_-]{0,39}$/;
const askRole = 'ask';

function clip(value: unknown, max: number): [string, boolean] {
  const text = typeof value === 'string' ? value.replace(/\0/g, '').trim() : '';
  return text.length > max ? [`${text.slice(0, max - 1)}…`, true] : [text, false];
}

function word(value: unknown): string | null {
  return typeof value === 'string' && code.test(value) ? value : null;
}

function spendOf(detail: PloegDetail, card: PloegCard | undefined, runs: PloegRun[]): WorkItemBrief['spend'] {
  if (detail.demo || card?.demo) return { status: 'demo', deliveryUsd: null };
  if (card) {
    const { costStatus, usageComplete, costUsd } = card.totals;
    if (costStatus === 'not_reported' || typeof costUsd !== 'number') return { status: 'unknown', deliveryUsd: null };
    return { status: costStatus === 'observed' && usageComplete === true ? 'settled' : 'provisional', deliveryUsd: costUsd };
  }
  const observed = runs.filter(run => run.costStatus === 'observed' && typeof run.usage?.costUsd === 'number');
  if (!observed.length) return { status: 'unknown', deliveryUsd: null };
  const total = observed.reduce((sum, run) => sum + (run.usage?.costUsd ?? 0), 0);
  return { status: observed.length === runs.length ? 'settled' : 'provisional', deliveryUsd: Math.round(total * 1e6) / 1e6 };
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const sharedHeadline = new Set(['ready', 'preparing', 'working', 'asking', 'capturing', 'paused', 'stopped', 'review', 'changes_requested', 'cancelled']);
const fixedNext = new Set(['ready', 'preparing', 'working', 'asking', 'capturing', 'paused', 'review', 'changes_requested', 'cancelled']);
const fixedStop: Record<string, 'plain' | 'sentence'> = { reconciliation: 'plain', reconciliation_pending: 'plain', authority_lost: 'plain', restart: 'plain', paused: 'sentence', cancelled: 'sentence' };
const sessionOnlyActions = new Set(['open-session', 'cancel']);

/** The Client-safe part of the progress statechart for the session that drives a Work Item. Pure. */
export function briefProgress({ session, events, now, viewer }: BriefSession): BriefProgress {
  const progress = sessionProgress(session, { events, now, viewer });
  const label = progress.meta.label;
  const headline = sharedHeadline.has(progress.phase) ? progress.headline : label;
  const stopField = progress.reason ? fixedStop[progress.reason.code] : undefined;
  const stop = stopField && progress.reason ? text((progress.reason as Record<string, unknown>)[stopField]) : '';
  return {
    phase: progress.phase,
    label,
    headline: clip(headline, 300)[0],
    next: fixedNext.has(progress.phase) ? progress.next : '',
    stop: stop || null,
    working: progress.current ? { role: clip(progress.current.role, 60)[0], round: typeof progress.current.round === 'number' ? progress.current.round : null } : null,
    steps: progress.steps.map((step: { role: string; mode: 'write' | 'read'; label: string; verdict: { label: string; recorded: boolean } | null }): BriefStep => ({ role: clip(step.role, 60)[0], mode: step.mode, label: step.label, verdict: step.verdict?.label ?? null, verdictRecorded: Boolean(step.verdict?.recorded) })),
    spend: { status: progress.spend.status as BriefProgress['spend']['status'], text: progress.spend.text, note: progress.spend.note },
    actions: progress.actions.filter((action: { id: string }) => !sessionOnlyActions.has(action.id)).map((action: { label: string }) => action.label),
    pullRequest: typeof progress.change.pullRequest?.number === 'number' ? progress.change.pullRequest.number : null,
  };
}

/** Builds the brief for one Work Item from Ploeg's detail and, when available, its card and the session that drives it. Pure. Ask Runs are left out, so earlier questions never feed later answers. */
export function workItemBrief(detail: PloegDetail, card?: PloegCard, session?: BriefSession): WorkItemBrief {
  const { item } = detail;
  let truncated = detail.truncated.runs;
  const [objective, objectiveCut] = clip(item.description, limits.objective);
  truncated ||= objectiveCut;
  const delivery = detail.runs.filter(run => run.role !== askRole);
  if (delivery.length > limits.runs) truncated = true;
  const runs = delivery.slice(-limits.runs).map((run): BriefRun => {
    const [summary, a] = clip(run.summary, limits.runText);
    const [problem, b] = clip(run.problem, limits.runText);
    const [solution, c] = clip(run.solution, limits.runText);
    truncated ||= a || b || c;
    return { role: word(run.role) ?? 'agent', round: run.round, state: run.state, outcome: word(run.outcome), verdict: word(run.verdict), summary, problem, solution, startedAt: run.startedAt, finishedAt: run.finishedAt };
  });
  const reason = word(item.latestShift?.closeReason);
  const stoppedBecause = item.state === 'needs_human' || item.state === 'withdrawn' ? (reason ? reasonText[reason] ?? reason.replace(/_/g, ' ') : null) : null;
  const pr = item.pullRequest;
  const deployments = card?.deployments ?? [];
  if (deployments.length > limits.previews) truncated = true;
  return {
    workItemId: item.id,
    title: clip(item.title, 300)[0],
    objective,
    state: item.state,
    stateText: stateText[item.state],
    stoppedBecause,
    pullRequest: pr ? { number: pr.number, status: item.state === 'done' ? 'finished' : item.state === 'withdrawn' ? 'left' : pr.mergeState === 'conflicted' ? 'conflicted' : 'open' } : null,
    previews: deployments.slice(0, limits.previews).map(deployment => ({ environment: clip(deployment.environment, 60)[0], since: deployment.firstDeployedAt })),
    runs,
    spend: spendOf(detail, card, delivery),
    progress: session ? briefProgress(session) : null,
    updatedAt: item.updatedAt,
    truncated,
    demo: Boolean(detail.demo || card?.demo),
  };
}

const pullRequestText: Record<NonNullable<WorkItemBrief['pullRequest']>['status'], string> = {
  open: 'open',
  conflicted: 'open, with merge conflicts',
  finished: 'part of the finished work; the record does not say whether it was merged or closed',
  left: 'left as it was when the work was withdrawn; the record does not say whether it is still open',
};

const usd = (value: number) => `US$ ${value.toFixed(value < 1 ? 4 : 2)}`;

function progressLines(progress: BriefProgress | null): string[] {
  if (!progress) return [];
  return [
    `Progress as Unfold shows it: ${progress.label}${progress.headline === progress.label ? '' : ` (${progress.headline})`}.${progress.stop ? ` ${progress.stop}` : ''}`,
    progress.steps.length ? `Roles in the session: ${progress.steps.map(step => `${step.role} (${step.mode === 'read' ? 'reader' : 'writer'}) ${step.label.toLowerCase()}${step.verdict ? `, ${step.verdict.toLowerCase()}${step.verdictRecorded ? '' : ' in its transcript, not recorded'}` : ''}`).join('; ')}` : 'Roles in the session: none started yet',
    `Session spend as Unfold shows it: ${progress.spend.text}${progress.spend.note ? ` (${progress.spend.note})` : ''}`,
  ];
}

/** Renders a brief as the plain text a model answers from. Every value comes from the brief, so the text is as Client-safe as the brief. */
export function briefText(brief: WorkItemBrief): string {
  const lines = [
    `Work Item ${brief.workItemId}: ${brief.title}`,
    `State: ${brief.stateText}.${brief.stoppedBecause ? ` It stopped because ${brief.stoppedBecause}.` : ''}`,
    `Last updated: ${brief.updatedAt}`,
    brief.pullRequest ? `Pull request${brief.pullRequest.number === null ? '' : ` #${brief.pullRequest.number}`}: ${pullRequestText[brief.pullRequest.status]}` : 'Pull request: none yet',
    brief.previews.length ? `Previews: ${brief.previews.map(preview => `${preview.environment}${preview.since ? ` since ${preview.since}` : ''}`).join('; ')}` : 'Previews: none',
    `Spend on the work so far: ${brief.spend.status === 'demo' ? 'none, this is a demo' : brief.spend.deliveryUsd === null ? 'not reported yet' : `${usd(brief.spend.deliveryUsd)} (${brief.spend.status})`}`,
    ...progressLines(brief.progress),
    '',
    'What was asked for:',
    brief.objective || '(no description)',
    '',
    brief.runs.length ? 'Runs, oldest first:' : 'Runs: none yet',
    ...brief.runs.map(run => [
      `- ${run.role}, round ${run.round}, ${run.state}${run.outcome ? `, outcome ${run.outcome}` : ''}${run.verdict ? `, verdict ${run.verdict}` : ''}${run.finishedAt ? `, finished ${run.finishedAt}` : run.startedAt ? `, started ${run.startedAt}` : ''}`,
      run.summary ? `  Summary: ${run.summary}` : '',
      run.problem ? `  Problem: ${run.problem}` : '',
      run.solution ? `  Solution: ${run.solution}` : '',
    ].filter(Boolean).join('\n')),
  ];
  if (brief.truncated) lines.push('', 'Some of this record was shortened.');
  return lines.join('\n');
}
