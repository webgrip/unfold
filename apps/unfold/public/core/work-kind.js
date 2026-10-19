/** The Work Kinds (RFC-0009) in their families, each with its label and the result it is expected to produce. */
export const workKinds = Object.freeze([
  ['feature', 'change', 'Feature', 'a diff and a pull request'],
  ['fix', 'change', 'Fix', 'a diff with a test that failed before'],
  ['refactor', 'change', 'Refactor', 'a diff that keeps behaviour'],
  ['docs', 'change', 'Docs', 'a diff to documentation only'],
  ['tests', 'change', 'Tests', 'a diff to tests or CI only'],
  ['dependency', 'chore', 'Dependency', 'a version bump'],
  ['config', 'chore', 'Config', 'a setting, a value or a rename'],
  ['repair', 'repair', 'Repair', 'a diff that answers review findings'],
  ['spike', 'investigate', 'Spike', 'a finding and a recommendation'],
  ['research', 'investigate', 'Research', 'findings or a proposal, no code'],
  ['review', 'review', 'Review', 'a Verdict'],
].map(([key, family, label, result]) => Object.freeze({ key, family, label, result })));

/** One Work Kind by key; an unknown key reads as Feature, the default for a writing Role. */
export function workKindMeta(key) { return workKinds.find(entry => entry.key === key) ?? workKinds[0]; }

const prefixes = Object.freeze({ docs: 'docs', doc: 'docs', test: 'tests', tests: 'tests', ci: 'tests', refactor: 'refactor', fix: 'fix', bug: 'fix', bugfix: 'fix', hotfix: 'fix', feat: 'feature', feature: 'feature', deps: 'dependency', dependencies: 'dependency', chore: 'config', config: 'config', build: 'config', spike: 'spike', research: 'research' });
const words = Object.freeze([
  ['spike', /\b(spike|prototype|proof of concept|try out|trial)\b/i],
  ['research', /\b(research|investigate|investigation|survey|compare|evaluate|plan the|plan a|propose|proposal|assess)\b/i],
  ['dependency', /\b(bump|upgrade|renovate|dependenc(y|ies)|update \S+ to v?\d)/i],
  ['fix', /\b(fix|fixes|bug|broken|regression|crash(es)?|flaky|unstable|make \S.* (stable|reliable))\b/i],
  ['refactor', /\b(refactor|rename|extract|split \S+ into|clean ?up|move \S+ (into|out of))\b/i],
  ['docs', /\b(document|documentation|readme|docs?|the guide|how-to)\b/i],
  ['tests', /\b(tests?|test job|coverage|ci job|pipeline)\b/i],
]);

/**
 * The Work Kind of one Run (RFC-0009) and where it came from, by rules alone: a reading Role is a Review, a writing Run
 * after the first Round is a Repair, a conventional prefix on the title (`docs:`, `fix(scope):`) names its kind, and
 * otherwise the first keyword family in the title does. Without a match a writing Run is a Feature by default; the
 * source says so, so a person sees it was not recognised.
 * @param {{ title?: string, description?: string }} item The Work Item.
 * @param {{ writes?: boolean, round?: number, role?: string } | null} run The Run.
 * @returns {{ kind: string, family: string, label: string, source: 'role'|'round'|'prefix'|'title'|'default', rule: string }} `runWork` adds `decider` for a guess.
 */
export function workKindOf(item, run) {
  const result = (key, source, rule) => { const meta = workKindMeta(key); return { kind: meta.key, family: meta.family, label: meta.label, source, rule }; };
  if (run && run.writes === false) return result('review', 'role', `a reading Role (${run.role || 'reader'})`);
  if (run && run.writes !== false && Number(run.round) > 1) return result('repair', 'round', `Round ${run.round} of a writing Role`);
  const title = String(item?.title ?? '').trim();
  const prefix = /^([a-z]+)(\([^)]*\))?!?:\s/i.exec(title);
  if (prefix && prefixes[prefix[1].toLowerCase()]) {
    const key = prefix[1].toLowerCase() === 'chore' && /\bdeps?\b|dependenc/i.test(prefix[2] ?? '') ? 'dependency' : prefixes[prefix[1].toLowerCase()];
    return result(key, 'prefix', `the title starts with ${prefix[0].trim()}`);
  }
  const subject = prefix ? title.slice(prefix[0].length) : title;
  for (const [key, pattern] of words) {
    const match = pattern.exec(subject);
    if (match) return result(key, 'title', `the title says "${match[0].toLowerCase()}"`);
  }
  return result('feature', 'default', 'no rule matched, so a writing Run counts as a Feature');
}
