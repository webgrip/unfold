import type { FactsPage, WorkItemFacts } from './cards/facts.ts';
import type { CommentRequest, CommentResult, FactsQuery } from './cards/service.ts';
import type { PloegContextItem } from './ploeg.ts';

/** Which implementation answers for Ploeg: the operator API, the deterministic demo, or a test fake. */
export type PloegPortKind = 'live' | 'demo' | 'fake';

/** One context file on its way to Ploeg, already checked, with the person it is added for. */
export type PloegContextUpload = { actor: string; name: string; note: string; bytes: Uint8Array };

/** Ploeg's delivery facts (Ploeg ADR-0079) and Unfold's keyed pull request comment through them. */
export interface PloegFacts {
  /** Whether this Ploeg serves delivery facts; false where it never can, such as in the demo. */
  factsSupported(fresh?: boolean): Promise<boolean>;
  workItemFacts(id: string, fresh?: boolean): Promise<WorkItemFacts>;
  factsPage(query: FactsQuery, fresh?: boolean): Promise<FactsPage>;
  putPullRequestComment(id: string, key: string, body: CommentRequest): Promise<CommentResult>;
}

/** The context files people give a Work Item (system ADR-0022). */
export interface PloegContextFiles {
  /** The context attached to Work Item `id`, in the order Ploeg added it. */
  listContext(id: string, fresh: boolean): Promise<PloegContextItem[]>;
  /** Stores one file for Work Item `id`; `created` is false when Ploeg already held the same file. */
  addContext(id: string, upload: PloegContextUpload): Promise<{ context: PloegContextItem; created: boolean }>;
}

/**
 * What Unfold asks of Ploeg, in Unfold's own types (Unfold ADR 0063). An adapter speaks to one Ploeg and applies no
 * Unfold authorization, Team or Tenant check: `PloegClient` does that before it calls the port. This first slice holds
 * delivery facts and context files; the ADR lists the areas that follow.
 */
export interface PloegPort extends PloegFacts, PloegContextFiles {
  readonly kind: PloegPortKind;
}
