export type TimelineEvent =
  | { at: number; kind: 'work-item' | 'shift-started' | 'change-ready' }
  | { at: number; kind: 'shift-finished'; merged: boolean }
  | { at: number; kind: 'run-started'; run: string; role: string; mode: string }
  | { at: number; kind: 'run-finished'; run: string; status: string; verdict?: string }
  | { at: number; kind: 'edit'; run: string; command: string }
  | {
      at: number;
      kind: 'check';
      run: string;
      phase: string;
      command: string;
      exitCode: number;
      expectedFailure: boolean;
      tests: { name: string; ok: boolean }[];
    };

/** The deterministic demo's event timeline as the site plays it; written by scripts/demo-timeline.ts. */
export interface Timeline {
  schema: number;
  source: string;
  modelCalls: number;
  workItem: { title: string; objective: string; repository: string };
  budget: { currency: string; authorized: number; spent: number; costStatus: string };
  roles: { run: string; role: string; mode: string }[];
  outcome: { status: string; verdict: string; files: number; merged: boolean };
  diff: string;
  events: TimelineEvent[];
}

/** The fields that change between two runs of the same demo. Everything else must match exactly. */
export const VOLATILE_FIELDS = ['events[].at'] as const;

/** Returns a copy of the timeline with every volatile field set to zero. */
export function maskTimeline(timeline: Timeline): Timeline {
  return { ...timeline, events: timeline.events.map((event) => ({ ...event, at: 0 })) };
}

/** The moment, in milliseconds after the Work Item was created, at which the demo ended. */
export function timelineDuration(timeline: Timeline): number {
  return timeline.events.reduce((latest, event) => Math.max(latest, event.at), 0);
}

/** Formats a timeline offset as seconds with one decimal, the way the walkthrough's clock shows it. */
export function formatOffset(ms: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ms / 1000);
}

/** Formats a Budget amount with two decimals in the page's locale. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
