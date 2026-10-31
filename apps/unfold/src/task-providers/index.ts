import { findTaskProvider, registerTaskProvider, taskProviders, type TaskProviderAdapter } from './registry.ts';
import { forgejo } from './forgejo.ts';
import { github } from './github.ts';
import { gitlab } from './gitlab.ts';
import { vikunja } from './vikunja.ts';
import { clickup } from './clickup.ts';
import { jira } from './jira.ts';
import { demo } from './demo.ts';

for (const adapter of [forgejo, github, gitlab, vikunja, clickup, jira, demo]) registerTaskProvider(adapter);

function reference(adapter: TaskProviderAdapter | undefined, externalId: string): string | undefined {
  if (!adapter?.reference) return undefined;
  if (!('prefix' in adapter.reference)) return adapter.taskId.test(externalId) ? externalId : undefined;
  return `${adapter.reference.prefix}-${externalId}`;
}

/** The reference people write for a tracker task, the adapter's prefix and the native id, or undefined when the provider supplies no reference format. */
export function trackerReference(provider: string, externalId: string): string | undefined { return reference(findTaskProvider(provider), externalId); }

/** `trackerReference` for a Ploeg Work Item, where an empty provider is the tracker Ploeg defaults to. */
export function ploegTrackerReference(provider: string, externalId: string): string | undefined {
  return reference(provider === '' ? taskProviders().find(adapter => adapter.reference && 'prefix' in adapter.reference && adapter.reference.ploegDefault) : findTaskProvider(provider), externalId);
}

/** Every reference prefix, lowercase, with the provider it names. A tracker whose native id is the reference supplies none. */
export function referencePrefixes(): Readonly<Record<string, string>> {
  return Object.fromEntries(taskProviders().flatMap(adapter => adapter.reference && 'prefix' in adapter.reference ? [[adapter.reference.prefix.toLowerCase(), adapter.name]] : []));
}

/** A description tidied for display by its adapter, or unchanged when the adapter does not tidy descriptions. */
export function displayDescription(provider: string, text: string): string { return findTaskProvider(provider)?.displayDescription?.(text) ?? text; }

/** Whether a provider sends task descriptions as HTML. */
export function sendsHtml(provider: string): boolean { return findTaskProvider(provider)?.descriptionFormat === 'html'; }

export { andList, findTaskProvider, handoffLabels, issueLabels, orList, providerByPrefix, registerTaskProvider, taskProvider, taskProviders, type IssueFiling, type ScopeDescription, type ScopeEntry, type TaskHandoff, type TaskProviderAdapter, type TaskSetup } from './registry.ts';
