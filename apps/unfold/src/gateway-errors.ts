/**
 * What a failed model gateway call means. `budget_exceeded` is a LiteLLM spend limit (see `budgetOwner`);
 * `provider_quota` is the provider's own billing or quota; `key_rejected` is the gateway refusing the caller's key;
 * `provider_auth` is the provider refusing the gateway's credential; `model_unavailable` is a model the key may not
 * use or that does not exist; `bad_request` is any other refused request; `unknown` is an answer with no recognised
 * status or wording.
 */
export type GatewayErrorKind = 'budget_exceeded' | 'rate_limited' | 'provider_quota' | 'key_rejected' | 'provider_auth' | 'model_unavailable' | 'context_too_long' | 'content_filtered' | 'timeout' | 'provider_unavailable' | 'bad_request' | 'unknown';

/** Whose LiteLLM spend limit was reached, as the gateway named it; `null` when it did not say. */
export type BudgetOwner = 'key' | 'team' | 'user' | 'end_user' | 'organization' | 'project' | 'tag' | 'model_group' | null;

/** One classified gateway failure: its kind, whose budget for `budget_exceeded`, and LiteLLM's error `type` when the body had one. */
export type GatewayError = { kind: GatewayErrorKind; budgetOwner: BudgetOwner; type: string | null };

const budgetTypes = new Set(['budget_exceeded']);
const keyTypes = new Set(['auth_error', 'expired_key', 'token_not_found_in_db']);
const rateTypes = new Set(['throttling_error', 'rate_limit_error', 'rate_limit_exceeded']);
const quotaTypes = new Set(['insufficient_quota', 'billing_error']);

const budgetWords = /budget has been exceeded|exceeded ?budget|budget[_ ]?exceeded|crossed budget|over (?:its |the )?budget|max budget/i;
const quotaWords = /insufficient_quota|exceeded your current quota|insufficient (?:credits|balance|funds)|credit balance is too low|billing/i;
const modelWords = /_model_access_denied|not allowed to access model|is not available for this api key|invalid model name|model_not_found|model .{0,80} does not exist|litellm\.NotFoundError/i;
const contextWords = /ContextWindowExceeded|context_length_exceeded|maximum context length|context window|context length|(?:prompt|input) is too long/i;
const contentWords = /ContentPolicyViolation|content_policy_violation|content management policy|content_filter/i;
const rateWords = /RateLimitError|rate limit|too many requests|no healthy deployments?|no deployments available/i;
const timeoutWords = /litellm\.Timeout|APITimeoutError|timed? ?out/i;
const owners: [RegExp, Exclude<BudgetOwner, null>][] = [
  [/\bKey[= ]|\bKey over\b/, 'key'],
  [/\bEnd User=/, 'end_user'],
  [/\bTeamMember=|\bUser=\S+ in Team=/, 'user'],
  [/\bTeam=/, 'team'],
  [/\bUser=/, 'user'],
  [/\bOrganization=/, 'organization'],
  [/\bProject=/, 'project'],
  [/\bTag=/, 'tag'],
  [/\bModel access group=/i, 'model_group'],
];

function parts(body: string): { type: string | null; message: string } {
  let data: any;
  try { data = JSON.parse(body); } catch { return { type: null, message: body }; }
  const error = data?.error ?? data?.detail ?? data;
  if (typeof error === 'string') return { type: null, message: error };
  const inner = typeof error?.error === 'object' && error.error ? error.error : error;
  const message = [inner?.message, typeof error?.error === 'string' ? error.error : undefined].filter(value => typeof value === 'string').join(' ');
  return { type: typeof inner?.type === 'string' ? inner.type : null, message: message || body };
}

function ownerOf(message: string): BudgetOwner {
  return owners.find(([pattern]) => pattern.test(message))?.[1] ?? null;
}

/**
 * Classifies a failed call to a LiteLLM gateway from its HTTP `status` and response `body`. LiteLLM's error `type` and
 * wording decide first and the status only when they say nothing, so a spend limit is recognised whichever status the
 * gateway gives it: LiteLLM answered 429 up to 1.103 and 422 from 1.104, and 400 or 402 elsewhere.
 */
export function gatewayError(status: number, body: string): GatewayError {
  const { type, message } = parts(body);
  const text = `${type ?? ''} ${message}`;
  const known = (kind: GatewayErrorKind, budgetOwner: BudgetOwner = null): GatewayError => ({ kind, budgetOwner, type });
  if ((type && budgetTypes.has(type)) || budgetWords.test(text)) return known('budget_exceeded', ownerOf(message));
  if (modelWords.test(text)) return known('model_unavailable');
  if (type && keyTypes.has(type)) return known('key_rejected');
  if (contextWords.test(text)) return known('context_too_long');
  if (contentWords.test(text)) return known('content_filtered');
  if ((type && quotaTypes.has(type)) || quotaWords.test(text)) return known('provider_quota');
  if (type === 'authentication_error' || /litellm\.AuthenticationError/i.test(message)) return known('provider_auth');
  if ((type && rateTypes.has(type)) || rateWords.test(text)) return known('rate_limited');
  if (type === 'timeout' || status === 408 || status === 504 || (status >= 500 && timeoutWords.test(message))) return known('timeout');
  if (status === 401 || status === 403) return known('key_rejected');
  if (status === 402) return known('budget_exceeded');
  if (status === 404) return known('model_unavailable');
  if (status === 429) return known('rate_limited');
  if (status >= 500) return known('provider_unavailable');
  if (status >= 400) return known('bad_request');
  return known('unknown');
}
