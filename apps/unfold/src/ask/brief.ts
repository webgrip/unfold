import type { PloegCard, PloegDetail, PloegRun, PloegState } from '../ploeg.ts';

/** How sure a brief's spend figure is: settled by Ploeg, still provisional, not reported, or a demo with no spend. */
export type BriefSpendStatus = 'settled' | 'provisional' | 'unknown' | 'demo';

/** One Run as a brief shows it: what it did in words, never its prompt, tools, findings or failure detail. */
export type BriefRun = { role: string; round: number; state: PloegRun['state']; outcome: string | null; verdict: string | null; summary: string; problem: string; solution: string; startedAt: string | null; finishedAt: string | null };

/** The Client-safe projection of a Work Item that an Ask answers from (system ADR-0031). Built from an allow-list of fields, so a fact Ploeg adds later stays out until someone adds it here. */
export type WorkItemBrief = {
  workItemId: string;
  title: string;
  objective: string;
  state: PloegState;
  stateText: string;
  stoppedBecause: string | null;
  pullRequest: { number: number | null; status: 'open' | 'conflicted' } | null;
  previews: { environment: string; since: string | null }[];
  runs: BriefRun[];
  spend: { status: BriefSpendStatus; deliveryUsd: number | null };
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

/** Builds the brief for one Work Item from Ploeg's detail and, when available, its card. Pure. Ask Runs are left out, so earlier questions never feed later answers. */
export function workItemBrief(detail: PloegDetail, card?: PloegCard): WorkItemBrief {
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
    pullRequest: pr ? { number: pr.number, status: pr.mergeState === 'conflicted' ? 'conflicted' : 'open' } : null,
    previews: deployments.slice(0, limits.previews).map(deployment => ({ environment: clip(deployment.environment, 60)[0], since: deployment.firstDeployedAt })),
    runs,
    spend: spendOf(detail, card, delivery),
    updatedAt: item.updatedAt,
    truncated,
    demo: Boolean(detail.demo || card?.demo),
  };
}

const usd = (value: number) => `US$ ${value.toFixed(value < 1 ? 4 : 2)}`;

/** Renders a brief as the plain text a model answers from. Every value comes from the brief, so the text is as Client-safe as the brief. */
export function briefText(brief: WorkItemBrief): string {
  const lines = [
    `Work Item ${brief.workItemId}: ${brief.title}`,
    `State: ${brief.stateText}.${brief.stoppedBecause ? ` It stopped because ${brief.stoppedBecause}.` : ''}`,
    `Last updated: ${brief.updatedAt}`,
    brief.pullRequest ? `Pull request${brief.pullRequest.number === null ? '' : ` #${brief.pullRequest.number}`}: ${brief.pullRequest.status === 'conflicted' ? 'open, with merge conflicts' : 'open'}` : 'Pull request: none yet',
    brief.previews.length ? `Previews: ${brief.previews.map(preview => `${preview.environment}${preview.since ? ` since ${preview.since}` : ''}`).join('; ')}` : 'Previews: none',
    `Spend on the work so far: ${brief.spend.status === 'demo' ? 'none, this is a demo' : brief.spend.deliveryUsd === null ? 'not reported yet' : `${usd(brief.spend.deliveryUsd)} (${brief.spend.status})`}`,
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
