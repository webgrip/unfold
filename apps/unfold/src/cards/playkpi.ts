import { deriveCI, type CI } from './playkpi-ci.ts';
import { deriveTimeline, type Play, type Timeline } from './playkpi-timeline.ts';

export * from './playkpi-timeline.ts';
export * from './playkpi-ci.ts';
export * from './playkpi-complexity.ts';
export * from './playkpi-shape.ts';
export * from './playkpi-summary.ts';

/** A play's Timeline and CI as Ploeg's `playkpi.Derive` computes them: `human` reports whether a forge login is a person, not a login Ploeg acts as. The Timeline is null when nothing about the conversation is known, the CI until CI was read. */
export function derive(p: Play, human: (login: string) => boolean): [Timeline | null, CI | null] {
  const t = deriveTimeline(p, human);
  return [t?.timeline ?? null, deriveCI(p, t?.readyAt ?? null)];
}
