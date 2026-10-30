import { registerDeliveryPublisher } from './registry.ts';
import { forgejoPublishing } from './forgejo.ts';
import { githubPublishing } from './github.ts';
import { gitlabPublishing } from './gitlab.ts';

for (const adapter of [forgejoPublishing, githubPublishing, gitlabPublishing]) registerDeliveryPublisher(adapter);

export { createDeliveryPublisher, deliveryPublishers, findDeliveryPublisher, registerDeliveryPublisher, type DeliveryPublisher, type DeliveryPublisherAdapter, type ProposedChange, type PublisherConfig } from './registry.ts';
