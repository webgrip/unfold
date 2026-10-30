import type { Auth } from '../auth.ts';
import type { Store } from '../store.ts';
import type { PersonProof } from '../person-proof.ts';

/** How many credentials of each kind one revocation ended. */
export type RevocationCounts = { browserSessions: number; editorCredentials: number; agentsWindowTokens: number; delegatedCredentials: number; personGrants: number };

/** The part of the agent host a revocation needs: ending the Agents-window tokens of one sign-in or of one person. */
export type AgentsWindowTokens = { revokeSignIn(signIn: string): number; revokeUser(userId: string): number };

const none = (): RevocationCounts => ({ browserSessions: 0, editorCredentials: 0, agentsWindowTokens: 0, delegatedCredentials: 0, personGrants: 0 });

function add(total: RevocationCounts, part: RevocationCounts): RevocationCounts {
  return { browserSessions: total.browserSessions + part.browserSessions, editorCredentials: total.editorCredentials + part.editorCredentials, agentsWindowTokens: total.agentsWindowTokens + part.agentsWindowTokens, delegatedCredentials: total.delegatedCredentials + part.delegatedCredentials, personGrants: total.personGrants + part.personGrants };
}

/**
 * Ends credentials, the one way every caller does it: sign-out ends one sign-in, and SCIM deprovisioning and Shared
 * Signals end everything one person holds. A sign-in's browser session or editor credential goes, with the
 * Agents-window tokens it issued and the sign-in tokens kept for it, so nothing it left behind can mint a new token.
 */
export class Revocation {
  private readonly store: Store;
  private readonly auth: Auth;
  private readonly agentHost: AgentsWindowTokens | undefined;
  private readonly proof: PersonProof | undefined;

  constructor(store: Store, auth: Auth, agentHost?: AgentsWindowTokens, proof?: PersonProof) {
    this.store = store;
    this.auth = auth;
    this.agentHost = agentHost;
    this.proof = proof;
  }

  /** Ends the sign-in `signIn` identifies, a browser login or an editor credential, and what hangs off it. */
  signIn(signIn: string): RevocationCounts {
    const counts = none();
    if (this.store.getSecret(`person-grant:${signIn}`) !== undefined) counts.personGrants++;
    if (this.proof) this.proof.forget(signIn); else this.store.deletePersonGrant(signIn);
    counts.agentsWindowTokens += this.agentHost?.revokeSignIn(signIn) ?? 0;
    const login = Number(this.store.db.prepare('DELETE FROM logins WHERE token_hash=?').run(signIn).changes);
    const editor = Number(this.store.db.prepare('DELETE FROM editor_credentials WHERE token_hash=?').run(signIn).changes);
    counts.browserSessions += login;
    counts.editorCredentials += editor;
    return counts;
  }

  /** Ends every credential `userId` holds: browser sessions, editor credentials, Agents-window tokens, delegated credentials and kept sign-in tokens. */
  person(userId: string): RevocationCounts {
    let counts = none();
    for (const signIn of [...this.store.loginHashes(userId), ...this.store.editorCredentialHashes(userId)]) counts = add(counts, this.signIn(signIn));
    counts.agentsWindowTokens += this.agentHost?.revokeUser(userId) ?? 0;
    counts.delegatedCredentials += this.auth.forgetPerson(userId);
    return counts;
  }
}
