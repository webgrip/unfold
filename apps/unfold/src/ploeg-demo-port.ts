import { demoContextRefusal, PloegError } from './ploeg.ts';
import type { FactsPage, WorkItemFacts } from './cards/facts.ts';
import type { CommentResult } from './cards/service.ts';
import type { PloegContextItem } from './ploeg.ts';
import type { PloegPort } from './ploeg-port.ts';

/** What the demo answers a delivery facts read: it has none, and says so. */
export const demoFactsRefusal = 'The demo has no delivery facts: no pull request, CI run or deploy was recorded.';

/** The deterministic demo as a Ploeg adapter (Unfold ADR 0063): it stores nothing, admits nothing and invents no spend. */
export class DemoPloegPort implements PloegPort {
  readonly kind = 'demo';
  async factsSupported(): Promise<boolean> { return false; }
  async workItemFacts(): Promise<WorkItemFacts> { throw new PloegError(503, 'cards_facts_unavailable', demoFactsRefusal); }
  async factsPage(): Promise<FactsPage> { throw new PloegError(503, 'cards_facts_unavailable', demoFactsRefusal); }
  async putPullRequestComment(): Promise<CommentResult> { throw new PloegError(409, 'ploeg_demo', 'The demo opens no pull requests, so there is nothing to comment on.'); }
  async listContext(): Promise<PloegContextItem[]> { return []; }
  async addContext(): Promise<{ context: PloegContextItem; created: boolean }> { throw new PloegError(409, 'ploeg_demo', demoContextRefusal); }
}
