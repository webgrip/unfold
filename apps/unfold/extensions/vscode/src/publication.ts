import type { UnfoldClient } from './client.js';
import type { Bootstrap, DeliveryView, PublicationBinding, PublicationOffer, Session } from './types.js';

const inFlight = ['reserving', 'authorized', 'pushed', 'proposed'];

/** Whether a session goes through the delivery gate: it ran under a Ploeg execution on a repository with a delivery policy and completed with a captured candidate. */
export function deliveryGated(session: Session, bootstrap: Bootstrap): boolean {
  return Boolean(session.execution && bootstrap.deliveryRepositories?.includes(session.repositoryId) && session.status === 'completed' && session.candidate?.status === 'ready');
}

function binding(view: DeliveryView): PublicationBinding | undefined {
  const verified = view.receipt?.passed === true && Boolean(view.candidate) && view.candidate!.policySha256 === view.policySha256;
  return verified && view.policySha256 ? { candidateId: view.candidate!.id, receiptId: view.receipt!.id, policySha256: view.policySha256 } : undefined;
}

function state(view: DeliveryView): Pick<PublicationOffer, 'state' | 'title' | 'detail'> {
  const publication = view.publication;
  const pullRequest = publication?.phase === 'published' ? publication.pullRequest : undefined;
  if (pullRequest) return { state: 'published', title: `Pull request #${pullRequest.number}`, detail: `Opened from ${publication!.branch}. Merging it stays with you on the forge.` };
  if (publication && inFlight.includes(publication.phase)) return { state: 'publishing', title: 'Publishing…', detail: `Pushing this commit to ${publication.branch} and opening one pull request.` };
  if (publication?.phase === 'recovery_required') return { state: 'recovery', title: 'Needs recovery', detail: 'Publishing stopped before Unfold could confirm it was allowed to push. Nothing was pushed. An operator reconciles it with Ploeg before anything continues.' };
  if (publication?.phase === 'unknown') return { state: 'recovery', title: 'Needs recovery', detail: 'The branch or pull request on the forge does not match this commit, so Unfold stopped and closed anything it could not verify. A person decides what happens next.' };
  if (publication?.phase === 'refused') return { state: 'refused', title: 'Refused', detail: 'Ploeg refused to reserve publication for this commit, for example because its delivery policy does not allow publishing. Nothing was pushed.' };
  return { state: 'ready', title: 'Opens after your decision', detail: 'Accepting pushes this exact commit to its own branch and opens one pull request. Merging it stays with you.' };
}

/**
 * What a VS Code panel offers for a gated session's delivery: Accept and open pull request on a verified candidate while
 * publishing is enabled and nothing is published yet, the displayed identities that action sends, and the pull request stage.
 * Undefined when publishing is disabled and nothing was ever reserved, so the panel keeps its note-only Accept.
 */
export function publicationOffer(view: DeliveryView | undefined, viewer: boolean): PublicationOffer | undefined {
  if (!view || (!view.publicationEnabled && !view.publication)) return undefined;
  const shown = state(view);
  const bound = view.publicationEnabled ? binding(view) : undefined;
  const offered = !viewer && Boolean(bound) && (shown.state === 'ready' || shown.state === 'publishing');
  const pullRequest = view.publication?.phase === 'published' && view.publication.pullRequest && /^https:\/\/[^\s@]+$/.test(view.publication.pullRequest.url) ? view.publication.pullRequest : undefined;
  return { ...shown, offered, ...(offered ? { binding: bound } : {}), ...(pullRequest ? { pullRequest } : {}) };
}

/** Reads a gated session's delivery view and turns it into an offer. A failed read leaves the panel with its note-only Accept, except an expired sign-in, which the caller reports. */
export async function readPublication(client: UnfoldClient, session: Session, bootstrap: Bootstrap): Promise<PublicationOffer | undefined> {
  if (!deliveryGated(session, bootstrap)) return undefined;
  try { return publicationOffer(await client.delivery(session.id), bootstrap.user.role === 'viewer'); }
  catch (error) { if ((error as { status?: unknown } | undefined)?.status === 401) throw error; return undefined; }
}
