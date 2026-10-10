/** Who an Ask was asked for: the agency's own people, or a Client through the Client Portal (system ADR-0031). */
export type AskAudience = 'internal' | 'client';

/** Where an Ask is: admitted and waiting for its answer, answered, failed after admission, or refused before any spend. */
export type AskStatus = 'answering' | 'answered' | 'failed' | 'refused';

/** Where an answer came from: the record, with no model call and no spend, or one metered model call admitted by Ploeg. */
export type AskSource = 'record' | 'model';

/** A question about one Work Item and its answer, as Unfold stores it apart from Session events. `costUsd` is null until Ploeg settles the Ask; a demo Ask has no cost. An answer from the record costs nothing and names the standing question it answered in `intent`. */
export type Ask = {
  id: string;
  workItemId: string;
  workItemTitle: string;
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
  source: AskSource;
  intent: string | null;
  createdAt: string;
  answeredAt: string | null;
};
