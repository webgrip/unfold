import { plural } from './format.js';

/** One-sentence glossary definitions (docs/reference/glossary.md) for the Ploeg terms a surface shows as a tooltip. */
export const glossary = Object.freeze({
  round: 'Round: a set of agent runs within one attempt that start together. Each later Round sees everything the earlier ones found.',
  shift: 'Shift: one Team’s whole attempt at a Work Item. It owns the branch, the budget and every agent run in it.',
});

/** The glossary definitions of `terms`, as one tooltip. */
export function termTitle(...terms) {
  return terms.map(term => glossary[term]).filter(Boolean).join(' ');
}

/** How much agent work an item took, in plain words: "2 agent runs in 1 attempt", "2 agent runs", or '' when nothing is known. */
export function effortText({ runs = null, attempts = null } = {}) {
  const known = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const work = known(runs) ? plural(runs, 'agent run') : '';
  const tries = known(attempts) ? plural(attempts, 'attempt') : '';
  return work && tries ? `${work} in ${tries}` : work || tries;
}

const internalProviders = new Set(['manual', 'ploeg']);
const humanKey = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;
const machineKey = /^(?=[0-9a-f-]*[a-f])[0-9a-f-]{12,}$/i;

/**
 * The tracker ticket a Work Item came from, as Ploeg's `work.Reference` writes it: `VIK-<id>` for a numbered Vikunja
 * task, `<provider>-<id>` for another numbered tracker, the key itself when it already is one (`DEMO-8`). Empty for
 * work no tracker holds (manual and agent-proposed Work Items) and for machine identifiers, which mean nothing to a
 * person and belong in a tooltip or the details instead.
 */
export function trackerReference(item) {
  const external = String(item?.externalId ?? '').trim();
  const provider = String(item?.provider ?? '').trim();
  if (!external || internalProviders.has(provider) || !humanKey.test(external) || machineKey.test(external)) return '';
  if (!/^\d+$/.test(external)) return external;
  return provider === '' || provider === 'vikunja' ? `VIK-${external}` : `${provider.replace(/[^A-Za-z0-9_-]/g, '-')}-${external}`;
}
