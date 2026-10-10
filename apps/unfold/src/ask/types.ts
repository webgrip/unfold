/** Who an Ask was asked for: the agency's own people, or a Client through the Client Portal (system ADR-0031). */
export type AskAudience = 'internal' | 'client';

/** Where an Ask is: admitted and waiting for its answer, answered, failed after admission, or refused before any spend. */
export type AskStatus = 'answering' | 'answered' | 'failed' | 'refused';

/** A question about one Work Item and its answer, as Unfold stores it apart from Session events. `costUsd` is null until Ploeg settles the Ask; a demo Ask has no cost. */
export type Ask = {
  id: string;
  workItemId: string;
  askerId: string;
  askerName: string;
  audience: AskAudience;
  question: string;
  answer: string;
  status: AskStatus;
  demo: boolean;
  ploegAskId: string | null;
  model: string | null;
  costUsd: number | null;
  costStatus: 'demo' | 'pending' | 'settled' | 'unknown';
  failure: string | null;
  createdAt: string;
  answeredAt: string | null;
};
