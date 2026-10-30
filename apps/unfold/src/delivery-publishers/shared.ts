import { deliveryFailure, deliveryGit, type DeliveryRemote } from '../trusted-candidate.ts';
import { aiMarkingBlock } from '../ai-marking.ts';
import type { PublisherConfig } from './registry.ts';

export type PublicationPhase = 'reserving' | 'authorized' | 'pushed' | 'proposed' | 'published' | 'unknown' | 'recovery_required' | 'refused';
export type PullRequestEvidence = { number: number; url: string };
export type PublicationFacts = { workItemId: string; sessionId: string; sessionUrl: string; trackerUrl?: string; title: string; candidateId: string; receiptId: string; approvalId: string; canonicalSha: string; baseSha: string; treeSha: string; policySha256: string; verifierId: string; approver: string };
export type PublicationRecord = { operationId: string; branch: string; baseBranch: string; repositoryUrl: string; phase: PublicationPhase; facts: PublicationFacts; pullRequest?: PullRequestEvidence };
export type PushOutcome = 'pushed' | 'present' | 'foreign';
/** A repository URL split into its origin, the namespace that owns it, its name and its full path. */
export type RepositoryCoordinates = { origin: string; owner: string; name: string; fullName: string; protocol: 'https' | 'http' };

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
    aiMarkingBlock({ subject: 'pull-request', review: { state: 'approved', by: [facts.approver] }, session: facts.sessionUrl }),
    '',
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

/** Splits an `https://host/owner/name(.git)` repository URL; `nested` allows a namespace of several groups, as GitLab has. */
export function repositoryCoordinates(repositoryUrl: string, nested = false): RepositoryCoordinates {
  let url: URL;
  try { url = new URL(repositoryUrl); } catch { return deliveryFailure('publication_repository_unsupported'); }
  const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (nested ? parts.length < 2 : parts.length !== 2)) deliveryFailure('publication_repository_unsupported');
  const owner = parts.slice(0, -1).join('/');
  const name = parts.at(-1)!;
  return { origin: url.origin, owner, name, fullName: `${owner}/${name}`, protocol: url.protocol === 'https:' ? 'https' : 'http' };
}

/** Whether `url` is an `https://host/owner/name` repository URL, with `nested` allowing several namespace groups. */
export function httpsRepository(url: string, nested = false): boolean {
  return nested ? /^https:\/\/[^/@\s]+(?:\/[^/\s]+){2,}$/.test(url) : /^https:\/\/[^/@\s]+\/[^/\s]+\/[^/\s]+$/.test(url);
}

/** How a forge's `git` calls authenticate and where its repositories sit: the user name `git` sends with the token, and whether a namespace may have several groups. */
export type ForgeAccess = { gitUser?: string; nested?: boolean };

/**
 * What every forge publisher shares: the token read from the configured server environment variable on every call and
 * never placed in a URL or argument list, a lease-guarded `git push` that never overwrites a branch someone else moved,
 * and bounded JSON calls that refuse redirects.
 */
export class ForgeConnection {
  readonly config: PublisherConfig;
  private readonly plainHttp: boolean;
  private readonly access: ForgeAccess;
  constructor(config: PublisherConfig, options: { plainHttp?: boolean } = {}, access: ForgeAccess = {}) { this.config = config; this.plainHttp = options.plainHttp === true; this.access = access; }

  /** The forge account that opens pull requests. */
  get username(): string { return this.config.username ?? 'unfold-publisher'; }

  coordinates(repositoryUrl: string): RepositoryCoordinates { return repositoryCoordinates(repositoryUrl, this.access.nested === true); }

  token(): string {
    const token = process.env[this.config.tokenEnv];
    return token && token.length >= 16 && token.length <= 4096 && !/[^\x21-\x7e]/.test(token) ? token : deliveryFailure('publisher_credential_unavailable');
  }

  private remote(repositoryUrl: string): DeliveryRemote {
    const { protocol } = this.coordinates(repositoryUrl);
    if (protocol === 'http' && !this.plainHttp) deliveryFailure('publication_repository_unsupported');
    const basic = Buffer.from(`${this.access.gitUser ?? this.username}:${this.token()}`).toString('base64');
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

  private git(gitDirectory: string, args: string[], repositoryUrl: string): Promise<Buffer> {
    return deliveryGit(gitDirectory, args, undefined, this.remote(repositoryUrl));
  }

  /** One JSON call to the forge API at `url`, with `headers` read only once the API root is checked, bounded to 4 MiB and 15 seconds, without following redirects. */
  async fetchJson(url: string, headers: () => Record<string, string>, init: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT'; body?: unknown } = {}): Promise<{ status: number; data: unknown }> {
    const base = new URL(this.config.apiUrl);
    if (base.protocol !== 'https:' && !(this.plainHttp && base.protocol === 'http:')) deliveryFailure('publisher_unconfigured');
    let response: Response;
    try {
      response = await fetch(url, { method: init.method ?? 'GET', headers: { ...headers(), ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) }, body: init.body === undefined ? undefined : JSON.stringify(init.body), redirect: 'manual', signal: AbortSignal.timeout(15000) });
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

  /** Whether `html` is an address of the repository's own web page on its origin, with no query or fragment. */
  ownPage(html: unknown, repositoryUrl: string): URL | undefined {
    const { origin, fullName } = this.coordinates(repositoryUrl);
    let url: URL | undefined;
    try { url = new URL(String(html)); } catch { return undefined; }
    return url.origin === origin && url.pathname.toLowerCase().startsWith(`/${fullName.toLowerCase()}/`) && !url.search && !url.hash ? url : undefined;
  }
}
