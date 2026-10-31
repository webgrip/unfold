import { findTaskProvider, taskProviders } from './task-providers/index.ts';

/**
 * What a screen needs to name a tracker and its tasks, read from the tracker registry: the provider key, the product
 * name, the mark before a non-numeric native id, its priority words, and whether a task is handed to a Team by
 * assigning the Team's tracker user. Screens use these facts and never name a tracker themselves.
 */
export type TrackerDisplay = { name: string; label: string; idMark?: string; priorities?: { names: string[]; oneIsHighest: boolean }; handsOffByAssignment: boolean; fixture?: true };

/** The display facts of every registered tracker, in registry order. */
export function trackerDisplay(): TrackerDisplay[] {
  return taskProviders().map(adapter => ({
    name: adapter.name,
    label: adapter.label,
    ...(adapter.idMark ? { idMark: adapter.idMark } : {}),
    ...(adapter.priorities ? { priorities: { names: [...adapter.priorities.names], oneIsHighest: adapter.priorities.oneIsHighest } } : {}),
    handsOffByAssignment: Boolean(adapter.handoff),
    ...(adapter.fixture ? { fixture: true as const } : {}),
  }));
}

/**
 * A task's id as its tracker shows it to a person: a numeric id as `#624`, another native id with the tracker's mark
 * (`#86c0abc12`), and a key that already reads as one (`WEB-12`, `DEMO-8`) as it is. Empty when there is no id.
 */
export function taskIdText(provider: string, externalId: string): string {
  const id = externalId.trim();
  if (!id) return '';
  if (/^\d+$/.test(id)) return `#${id}`;
  const mark = findTaskProvider(provider)?.idMark;
  return mark && /^[a-z0-9]+$/.test(id) ? `${mark}${id}` : id;
}

/** How a notice or message names a tracker task: `ClickUp #86c0abc12`, or the id alone for a tracker the registry does not know. */
export function taskMention(provider: string, externalId: string): string {
  const id = taskIdText(provider, externalId);
  const label = findTaskProvider(provider)?.label ?? '';
  return label && id ? `${label} ${id}` : id;
}
