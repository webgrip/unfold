/** The four stages a Work Item passes on its page, in order. */
export const stageIds = Object.freeze(['define', 'execute', 'review', 'deliver']);

/** Each stage's label. */
export const stageLabels = Object.freeze({ define: 'Define', execute: 'Execute', review: 'Review', deliver: 'Deliver' });

/**
 * Where a Work Item stands across the four stages, from its Ploeg state and its Run card. `current` is the stage the
 * work is in, or null when it is finished. `stopped` names why the current stage halted (`needs_human`, `stale` or
 * `withdrawn`), or is null. Each stage is `{ id, label, status }` with `status` one of `done`, `current`, `stopped`,
 * `ahead` and `skipped` (Deliver, for work that ended without a merged pull request).
 * @param {{ state?: string } | null | undefined} item
 * @param {any} [card]
 * @returns {{ current: string|null, stopped: string|null, stages: { id: string, label: string, status: 'done'|'current'|'stopped'|'ahead'|'skipped' }[] }}
 */
export function workStages(item, card = null) {
  const state = item?.state ?? '';
  const play = Array.isArray(card?.plays) ? card.plays.at(-1) ?? null : null;
  const merged = play?.state === 'merged';
  const released = Boolean(card?.release);
  let current = 'define';
  let stopped = null;
  let delivered = false;
  if (state === 'queued' || state === 'leased') current = 'execute';
  else if (state === 'awaiting_review') current = 'review';
  else if (state === 'needs_human' || state === 'stale' || state === 'withdrawn') { current = play?.state === 'open' ? 'review' : 'execute'; stopped = state; }
  else if (state === 'done') {
    if (merged && !released) current = 'deliver';
    else { current = null; delivered = merged; }
  }
  const at = current ? stageIds.indexOf(current) : stageIds.length;
  const stages = stageIds.map((id, index) => {
    let status;
    if (index < at) status = 'done';
    else if (index === at) status = stopped ? 'stopped' : 'current';
    else status = 'ahead';
    if (current === null && id === 'deliver' && !delivered) status = 'skipped';
    return { id, label: stageLabels[id], status };
  });
  return { current, stopped, stages };
}
