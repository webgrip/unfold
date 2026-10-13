/** Who an Ask was asked for: the agency's own people, or a Client through the Client Portal (system ADR-0031). */
export type AskAudience = 'internal' | 'client';

/** Where an Ask is: admitted and waiting for its answer, answered, failed after admission, or refused before any spend. */
export type AskStatus = 'answering' | 'answered' | 'failed' | 'refused';

/** Where an answer came from: the record, with no model call and no spend, or one metered model call admitted by Ploeg. */
export type AskSource = 'record' | 'model';

/**
 * Why an Ask has no answer. Refused before any model call: `allowance_used_up`, `not_admitted`. Failed before any model
 * call, so nothing was spent: `ploeg_unavailable`, `no_model`, `gateway_unreachable`. Failed at the model gateway or
 * provider: `key_rejected`, `budget_exceeded`, `rate_limited`, `provider_error`, `bad_response`, `timeout`. Failed with
 * no answer text: `cut_off` (the model spent its output thinking), `filtered`, `empty`. `interrupted`: Unfold stopped
 * while the Ask was being answered.
 */
export type AskFailureCode = 'allowance_used_up' | 'not_admitted' | 'ploeg_unavailable' | 'no_model' | 'gateway_unreachable' | 'key_rejected' | 'budget_exceeded' | 'rate_limited' | 'provider_error' | 'bad_response' | 'timeout' | 'cut_off' | 'filtered' | 'empty' | 'interrupted';

/** A question about one Work Item and its answer, as Unfold stores it apart from Session events. `costUsd` is null until Ploeg reports the Ask's spend; a demo Ask has no cost. A failed or refused Ask says why in `failure`, names the cause in `failureCode` and says in `retryable` whether asking again may help. `cutOff` marks an answer the model stopped writing at its length limit. An answer from the record costs nothing and names the standing question it answered in `intent`. */
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
  failureCode?: AskFailureCode | null;
  retryable?: boolean;
  cutOff?: boolean;
  source: AskSource;
  intent: string | null;
  createdAt: string;
  answeredAt: string | null;
};
