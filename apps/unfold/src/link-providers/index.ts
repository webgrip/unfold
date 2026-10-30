import { registerLinkProvider } from './registry.ts';
import { gitlabLinks } from './gitlab.ts';
import { clickupLinks } from './clickup.ts';

for (const adapter of [gitlabLinks, clickupLinks]) registerLinkProvider(adapter);

export { findLinkProvider, linkAdapters, registerLinkProvider, type LinkContext, type LinkProviderAdapter, type LinkRecord } from './registry.ts';
