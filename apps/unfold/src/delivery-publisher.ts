import { deliveryFailure, deliveryGit, type DeliveryRemote } from './trusted-candidate.ts';
import type { ForgejoPublisherConfig } from './delivery-config.ts';

export type PublicationPhase = 'reserving' | 'authorized' | 'pushed' | 'proposed' | 'published' | 'unknown' | 'recovery_required' | 'refused';
export type PullRequestEvidence = { number: number; url: string };
export type PublicationFacts = { workItemId: string; sessionId: string; sessionUrl: string; trackerUrl?: string; title: string; candidateId: string; receiptId: string; approvalId: string; canonicalSha: string; baseSha: string; treeSha: string; policySha256: string; verifierId: string; approver: string };
export type PublicationRecord = { operationId: string; branch: string; baseBranch: string; repositoryUrl: string; phase: PublicationPhase; facts: PublicationFacts; pullRequest?: PullRequestEvidence };
export type PushOutcome = 'pushed' | 'present' | 'foreign';
type ForgePullRequest = { number: number; html_url: string; body: string; state: string; user?: { login?: string }; head: { ref: string; sha: string; repo?: { full_name?: string } }; base: { ref: string; repo?: { full_name?: string } } };

const branchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

export function validDeliveryBranch(branch: string): boolean {
  if (!branchPattern.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.')) return false;
  return branch.split('/').every(part => !part.startsWith('.') && !part.endsWith('.lock'));
}

export function publicationBranch(workItemId: string | undefined, sessionId: string, candidateId: string): string {
  const suffix = candidateId.slice(0, 12);
  const workItemBranch = `unfold/wi-${workItemId ?? ''}/${suffix}`;
  if (workItemId && /^[A-Za-z0-9._-]{1,64}$/.test(workItemId) && validDeliveryBranch(workItemBranch)) return workItemBranch;
  const sessionBranch = `unfold/session-${sessionId}/${suffix}`;
  return validDeliveryBranch(sessionBranch) ? sessionBranch : deliveryFailure('invalid_publication_branch');
}

export const publicationOperationId = (candidateId: string): string => `pub-${candidateId}`;
export const publicationMarker = (operationId: string): string => `<!-- unfold-publication: ${operationId} -->`;

export function pullRequestTitle(facts: PublicationFacts): string {
  const title = singleLine(facts.title).slice(0, 180);
  return `Unfold: ${title || `Work Item ${facts.workItemId}`}`;
}

const singleLine = (value: string): string => value.replace(/[\x00-\x1f\x7f]+/g, ' ').trim();

export function pullRequestBody(operationId: string, facts: PublicationFacts): string {
  return [
    publicationMarker(operationId),
    `Verified delivery candidate for Work Item ${facts.workItemId}, published by the Unfold control service.`,
    '',
    `- Session: ${facts.sessionUrl}`,
    ...(facts.trackerUrl && singleLine(facts.trackerUrl) ? [`- Tracker: ${singleLine(facts.trackerUrl)}`] : []),
    `- Candidate: \`${facts.candidateId}\``,
    `- Verification receipt: \`${facts.receiptId}\``,
    `- Approval: \`${facts.approvalId}\` by ${singleLine(facts.approver)}`,
    `- Canonical commit: \`${facts.canonicalSha}\``,
    `- Approved base: \`${facts.baseSha}\``,
    `- Tree: \`${facts.treeSha}\``,
    `- Policy SHA-256: \`${facts.policySha256}\``,
    `- Verifier: \`${facts.verifierId}\``,
    `- Publication operation: \`${operationId}\``,
    '',
    'Merge stays human: approving the candidate authorized this pull request, not its merge.',
  ].join('\n');
}

export function repositoryCoordinates(repositoryUrl: string): { origin: string; owner: string; name: string; fullName: string; protocol: 'https' | 'http' } {
  let url: URL;
  try { url = new URL(repositoryUrl); } catch { return deliveryFailure('publication_repository_unsupported'); }
  const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || parts.length !== 2) deliveryFailure('publication_repository_unsupported');
  return { origin: url.origin, owner: parts[0], name: parts[1], fullName: `${parts[0]}/${parts[1]}`, protocol: url.protocol === 'https:' ? 'https' : 'http' };
}

/** Publishes one canonical commit to Forgejo: a lease-guarded branch push and one pull request, with the token read from the configured server environment variable on every call and never placed in a URL or argument list. */
export class ForgejoPublisher {
  private config: ForgejoPublisherConfig;
  private plainHttp: boolean;
  constructor(config: ForgejoPublisherConfig, options: { plainHttp?: boolean } = {}) { this.config = config; this.plainHttp = options.plainHttp === true; }

  private get username(): string { return this.config.username ?? 'unfold-publisher'; }

  private token(): string {
    const token = process.env[this.config.tokenEnv];
    return token && token.length >= 16 && token.length <= 4096 && !/[^\x21-\x7e]/.test(token) ? token : deliveryFailure('publisher_credential_unavailable');
  }

  private remote(repositoryUrl: string): DeliveryRemote {
    const { protocol } = repositoryCoordinates(repositoryUrl);
    if (protocol === 'http' && !this.plainHttp) deliveryFailure('publication_repository_unsupported');
    const basic = Buffer.from(`${this.username}:${this.token()}`).toString('base64');
    return { protocol, configuration: { 'http.extraHeader': `Authorization: Basic ${basic}` } };
  }

  async remoteHead(gitDirectory: string, repositoryUrl: string, branch: string): Promise<string | null> {
    const output = (await this.git(gitDirectory, ['ls-remote', '--refs', repositoryUrl, `refs/heads/${branch}`], repositoryUrl)).toString('utf8').trim();
    if (!output) return null;
    const match = /^([a-f0-9]{40})\trefs\/heads\/(.+)$/.exec(output);
    return match && match[2] === branch ? match[1] : deliveryFailure('publication_unconfirmed');
  }

  async push(gitDirectory: string, repositoryUrl: string, canonicalSha: string, branch: string): Promise<PushOutcome> {
    if (!/^[a-f0-9]{40}$/.test(canonicalSha) || !validDeliveryBranch(branch)) deliveryFailure('invalid_publication_branch');
    let pushed = true;
    try { await this.git(gitDirectory, ['push', '--porcelain', '--no-verify', `--force-with-lease=refs/heads/${branch}:`, repositoryUrl, `${canonicalSha}:refs/heads/${branch}`], repositoryUrl); }
    catch { pushed = false; }
    const head = await this.remoteHead(gitDirectory, repositoryUrl, branch);
    if (head === canonicalSha) return pushed ? 'pushed' : 'present';
    if (head !== null) return 'foreign';
    return deliveryFailure('publication_push_failed');
  }

  async createPullRequest(repositoryUrl: string, input: { head: string; base: string; title: string; body: string }): Promise<ForgePullRequest | 'exists'> {
    const response = await this.api(repositoryUrl, '/pulls', { method: 'POST', body: input });
    if (response.status === 409) return 'exists';
    if (response.status !== 201) deliveryFailure('publication_proposal_rejected');
    return response.data as ForgePullRequest;
  }

  async findPullRequest(record: PublicationRecord): Promise<ForgePullRequest | undefined> {
    const { fullName } = repositoryCoordinates(record.repositoryUrl);
    for (let page = 1; page <= 20; page++) {
      const response = await this.api(record.repositoryUrl, `/pulls?state=all&sort=oldest&limit=50&page=${page}`);
      if (response.status !== 200 || !Array.isArray(response.data)) deliveryFailure('publication_unconfirmed');
      const found = (response.data as ForgePullRequest[]).find(pr => this.publisherProposal(pr, record, fullName));
      if (found) return found;
      if ((response.data as unknown[]).length < 50) return undefined;
    }
    return deliveryFailure('publication_unconfirmed');
  }

  async closePullRequest(record: PublicationRecord, number: number): Promise<void> {
    const response = await this.api(record.repositoryUrl, `/pulls/${number}`, { method: 'PATCH', body: { state: 'closed' } });
    if (response.status !== 201 && response.status !== 200) deliveryFailure('publication_close_failed');
  }

  private publisherProposal(pr: ForgePullRequest, record: PublicationRecord, fullName: string): boolean {
    return pr?.state === 'open' && pr.user?.login === this.username && pr.head?.ref === record.branch && pr.base?.ref === record.baseBranch && pr.base.repo?.full_name === fullName && pr.head.repo?.full_name === fullName && typeof pr.body === 'string' && pr.body.includes(publicationMarker(record.operationId));
  }

  async verifiedPullRequest(record: PublicationRecord, number: number): Promise<PullRequestEvidence | undefined> {
    const response = await this.api(record.repositoryUrl, `/pulls/${number}`);
    if (response.status === 404) return undefined;
    if (response.status !== 200) deliveryFailure('publication_unconfirmed');
    const pr = response.data as ForgePullRequest;
    const { origin, fullName } = repositoryCoordinates(record.repositoryUrl);
    let url: URL | undefined;
    try { url = new URL(pr.html_url); } catch { url = undefined; }
    const exact = Number.isSafeInteger(pr.number) && pr.number === number && pr.head?.sha === record.facts.canonicalSha && this.publisherProposal(pr, record, fullName) && url?.origin === origin && url.pathname.startsWith(`/${fullName}/`) && !url.search && !url.hash;
    return exact ? { number: pr.number, url: url!.toString() } : undefined;
  }

  private git(gitDirectory: string, args: string[], repositoryUrl: string): Promise<Buffer> {
    return deliveryGit(gitDirectory, args, undefined, this.remote(repositoryUrl));
  }

  private async api(repositoryUrl: string, suffix: string, init: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}): Promise<{ status: number; data: unknown }> {
    const { owner, name } = repositoryCoordinates(repositoryUrl);
    const base = new URL(this.config.apiUrl);
    if (base.protocol !== 'https:' && !(this.plainHttp && base.protocol === 'http:')) deliveryFailure('publisher_unconfigured');
    let response: Response;
    try {
      response = await fetch(`${this.config.apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`, { method: init.method ?? 'GET', headers: { authorization: `token ${this.token()}`, accept: 'application/json', ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) }, body: init.body === undefined ? undefined : JSON.stringify(init.body), redirect: 'manual', signal: AbortSignal.timeout(15000) });
    } catch (error) { if ((error as { code?: string })?.code?.startsWith('publi')) throw error; return deliveryFailure('publication_forge_unavailable'); }
    const chunks: Uint8Array[] = []; let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4 * 1024 * 1024) deliveryFailure('publication_response_too_large'); chunks.push(part.value); } }
      catch (error) { if ((error as { code?: string })?.code?.startsWith('publi')) throw error; return deliveryFailure('publication_forge_unavailable'); }
      finally { await reader.cancel().catch(() => undefined); }
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let data: unknown = null;
    if (text && (response.headers.get('content-type') ?? '').includes('application/json')) { try { data = JSON.parse(text); } catch { deliveryFailure('publication_unconfirmed'); } }
    return { status: response.status, data };
  }
}
