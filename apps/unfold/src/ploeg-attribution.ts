import type { PersonProofStatus } from './person-proof.ts';

/** The code Ploeg answers, with HTTP 403, to an operator change that carried no verified person token while it runs `PLOEG_OPERATOR_ATTRIBUTION=proven` (Ploeg ADR-0171). */
export const personTokenRequired = 'person_token_required';

/** The one error code Unfold gives every change Ploeg refused for want of proof of the person. */
export const personUnprovenCode = 'ploeg_person_unproven';

/** Why Ploeg refused a change for want of proof: Unfold had no person token to send, or Ploeg did not accept the one it sent. */
export type UnprovenCause = 'missing' | 'rejected';

/** A change Ploeg refused for want of proof, with Ploeg's own words for a rejected token when it gave them. */
export type Unproven = { cause: UnprovenCause; reason?: string };

const messages: Record<UnprovenCause, (reason?: string) => string> = {
  missing: () => 'Ploeg needs proof it is you before it changes anything, and Unfold had none to send, so nothing changed. Sign out and sign in again with single sign-on. If this keeps happening, an administrator must connect Unfold’s person tokens to Ploeg.',
  rejected: reason => `Ploeg did not accept Unfold’s proof that it is you${reason ? ` (${reason})` : ''}, so nothing changed. Sign out and sign in again with single sign-on. If this keeps happening, an administrator must check the person-token settings of Unfold and Ploeg.`,
};

/** What Unfold tells a person whose change Ploeg refused for want of proof. */
export function unprovenMessage(unproven: Unproven): string { return messages[unproven.cause](unproven.reason); }

/** What a session's blocker says when Ploeg refused its execution change for want of proof. */
export const unprovenSessionBlocker = 'Ploeg stopped this session because it needs proof it is you, and changed nothing. Sign out and sign in again with single sign-on, then reconcile the session before you resume it.';

const statusSummary = 'Ploeg refused your last change because it needs proof it is you, so nothing changed. Sign out and sign in again with single sign-on. If this stays, an administrator must connect Unfold’s person tokens to Ploeg.';

/** Ploeg's words for a refused person token: one printable line of at most 200 characters, or nothing when it sent none. */
export function ploegReason(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const line = value.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
  return line ? line.slice(0, 200) : undefined;
}

/** Reads the error code of a refusal from a copy of its body, leaving the response itself unread. */
export async function refusalCodeOf(response: Response): Promise<string | undefined> {
  if (Number(response.headers.get('content-length') ?? 0) > 65_536) return undefined;
  try {
    const data = await response.clone().json() as { error?: { code?: unknown } };
    return typeof data?.error?.code === 'string' ? data.error.code : undefined;
  } catch { return undefined; }
}

/** Whether Ploeg refused this change for want of a verified person token (403 `person_token_required`, Ploeg ADR-0171). */
export async function refusesUnproven(response: Response): Promise<boolean> {
  return response.status === 403 && await refusalCodeOf(response) === personTokenRequired;
}

/**
 * Why Ploeg refused the change `response` answers for want of proof of `person`, or undefined when it did not. A
 * `rejection` from person proof marks a change whose person token Ploeg rejected: its 401, or the 403 that answered
 * the retry without the token, is then `rejected` with Ploeg's reason, never a bare `missing`. Notes the refusal, or a
 * later accepted change, in `attribution`.
 */
export async function unprovenAnswer(response: Response, person: string, attribution?: PloegAttribution, rejection?: { reason?: string }): Promise<Unproven | undefined> {
  let unproven: Unproven | undefined;
  if (rejection && ((response.status === 401 && await refusalCodeOf(response) === 'invalid_token') || await refusesUnproven(response))) unproven = { cause: 'rejected', ...(rejection.reason ? { reason: rejection.reason } : {}) };
  else if (await refusesUnproven(response)) unproven = { cause: 'missing' };
  if (unproven) attribution?.refusedFor(person, unproven.cause);
  else if (response.ok) attribution?.acceptedFor(person);
  return unproven;
}

const warned = new Set<string>();

/** Logs each distinct `Warning: 299` Ploeg answers (Ploeg ADR-0171 clause 5) once per process, naming the route it came from. */
export function logPloegWarning(response: Response, route: string): void {
  const warning = response.headers.get('warning');
  if (!warning || !/^299\s/.test(warning) || warned.has(warning)) return;
  if (warned.size >= 64) return;
  warned.add(warning);
  console.error(JSON.stringify({ level: 'warn', event: 'ploeg.warning', route: route.slice(0, 200), warning: warning.replace(/[^\x20-\x7e]/g, ' ').slice(0, 512) }));
}

/**
 * Remembers which people Ploeg last refused a change for want of proof, so the Status page can say so, and whether
 * this Ploeg has shown it runs `proven`. Ploeg does not report its attribution mode (its version route names only its
 * release and contracts), so Unfold learns it from the first such refusal.
 */
export class PloegAttribution {
  private readonly refused = new Map<string, { at: number; cause: UnprovenCause }>();
  private provenSeen = false;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) { this.now = now; }

  /** Whether a Ploeg refusal has shown that this Ploeg refuses changes without a person token. */
  get requiresProof(): boolean { return this.provenSeen; }

  /** Records that Ploeg refused a change made for `person` for want of proof. */
  refusedFor(person: string, cause: UnprovenCause): void {
    if (!this.provenSeen) console.error(JSON.stringify({ level: 'error', event: 'ploeg.person_unproven', cause, message: 'Ploeg refuses operator changes without a person token (PLOEG_OPERATOR_ATTRIBUTION=proven). Configure ploeg.personTokens.' }));
    this.provenSeen = true;
    if (this.refused.size >= 10_000 && !this.refused.has(person)) this.refused.delete(this.refused.keys().next().value!);
    this.refused.set(person, { at: this.now(), cause });
  }

  /** Records that Ploeg accepted a change made for `person`, which ends what an earlier refusal said. */
  acceptedFor(person: string): void { this.refused.delete(person); }

  /** The Status page's person-proof line for `userId`: degraded after a refusal, otherwise `proof` unchanged. */
  status(userId: string, proof: PersonProofStatus | undefined): PersonProofStatus | undefined {
    const refusal = this.refused.get(userId);
    if (!refusal) return proof;
    return { state: 'degraded', gap: 'required', summary: refusal.cause === 'rejected' && proof?.gap === 'rejected' ? proof.summary : statusSummary, since: new Date(refusal.at).toISOString() };
  }
}
