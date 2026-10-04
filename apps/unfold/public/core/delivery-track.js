import { dateTime } from './format.js';

/**
 * The delivery track of a Work Item's change, from its Run card's facts only: the pull request opening, CI on its head,
 * a person's approval, the merge, and the first deploy to each environment, in that order. Each stage is
 * `{ id, label, status, detail, at }` where `status` is `done`, `current` (the next stage to happen), `failed` or
 * `ahead`. A stage without a fact is never `done`. `known` is false when the card carries no deploy facts, as an older
 * Ploeg's card does, so a page can say so instead of implying nothing was deployed. Without a pull request the track
 * is empty.
 * @param {any} card
 * @returns {{ stages: { id: string, label: string, status: 'done'|'current'|'failed'|'ahead', detail: string, at: string|null }[], known: boolean, pullRequest: number|null }}
 */
export function deliveryStages(card) {
  const plays = Array.isArray(card?.plays) ? card.plays : [];
  const play = plays.at(-1);
  if (!play) return { stages: [], known: Array.isArray(card?.deployments), pullRequest: null };
  const ci = play.ci?.state ?? null;
  const approval = (play.reviews || []).filter(review => review.state === 'approved').at(-1) ?? null;
  const merged = play.state === 'merged';
  const closed = play.state === 'closed';
  const deployments = (Array.isArray(play.deployments) && play.deployments.length ? play.deployments : Array.isArray(card.deployments) ? card.deployments : [])
    .filter(entry => entry && entry.environment)
    .slice()
    .sort((a, b) => String(a.firstDeployedAt ?? '').localeCompare(String(b.firstDeployedAt ?? '')));
  const stages = [
    { id: 'opened', label: 'Pull request', status: 'done', detail: `#${play.number}`, at: null },
    { id: 'checks', label: 'Checks', status: ci === 'success' ? 'done' : ci === 'failure' || ci === 'error' ? 'failed' : 'ahead', detail: ci === 'success' ? 'Passed on head' : ci === 'failure' ? 'Failed' : ci === 'error' ? 'Errored' : ci === 'pending' ? 'Running' : 'Not reported', at: play.ci?.capturedAt ?? null },
    { id: 'approved', label: 'Approved', status: approval || merged ? 'done' : 'ahead', detail: approval ? approval.reviewer || 'A reviewer' : merged ? 'Merged without a recorded approval' : 'Waiting for a person', at: approval?.receivedAt ?? null },
    { id: 'merged', label: 'Merged', status: merged ? 'done' : closed ? 'failed' : 'ahead', detail: merged ? play.mergedBy || 'Merged' : closed ? 'Closed without merging' : 'Not yet', at: merged ? play.mergedAt : closed ? play.closedAt : null },
    ...deployments.map(entry => ({ id: `deploy:${entry.environment}`, label: entry.environment[0].toUpperCase() + entry.environment.slice(1), status: 'done', detail: entry.sha ? `Deployed ${String(entry.sha).slice(0, 7)}` : 'Deployed', at: entry.firstDeployedAt ?? null })),
  ];
  const next = stages.find(stage => stage.status === 'ahead');
  if (next && !stages.some(stage => stage.status === 'failed')) next.status = 'current';
  return { stages, known: Array.isArray(card.deployments) || Array.isArray(play.deployments), pullRequest: play.number };
}

/** The time a stage happened, as the page shows it, or '' when the card does not say. */
export function stageTime(stage) {
  return stage.at ? dateTime(stage.at) : '';
}
