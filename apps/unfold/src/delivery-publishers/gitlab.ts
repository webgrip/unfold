import { deliveryFailure } from '../trusted-candidate.ts';
import { aiGeneratedLabel } from '../ai-marking.ts';
import type { DeliveryPublisher, DeliveryPublisherAdapter, PublisherConfig } from './registry.ts';
import { ForgeConnection, httpsRepository, publicationMarker, type PublicationRecord, type PullRequestEvidence, type PushOutcome } from './shared.ts';

type GitLabMergeRequest = { iid: number; web_url: string; description: string | null; state: string; author?: { username?: string }; source_branch: string; target_branch: string; sha: string; source_project_id?: number; target_project_id?: number };

/**
 * Publishes one canonical commit to GitLab: a lease-guarded branch push authenticated as `oauth2`, and one merge
 * request through the REST API with the `ai-generated` label, created first with its colour and description when the
 * project lacks it. Projects may sit in nested groups. The merge request's `iid` is the number Unfold records.
 */
export class GitLabPublisher implements DeliveryPublisher {
  private readonly forge: ForgeConnection;
  constructor(config: PublisherConfig, options: { plainHttp?: boolean } = {}) { this.forge = new ForgeConnection(config, options, { gitUser: 'oauth2', nested: true }); }

  remoteHead(gitDirectory: string, repositoryUrl: string, branch: string): Promise<string | null> { return this.forge.remoteHead(gitDirectory, repositoryUrl, branch); }
  push(gitDirectory: string, repositoryUrl: string, canonicalSha: string, branch: string): Promise<PushOutcome> { return this.forge.push(gitDirectory, repositoryUrl, canonicalSha, branch); }

  async createPullRequest(repositoryUrl: string, input: { head: string; base: string; title: string; body: string }): Promise<{ number: number } | 'exists'> {
    const labelled = await this.ensureLabel(repositoryUrl);
    const response = await this.api(repositoryUrl, '/merge_requests', { method: 'POST', body: { source_branch: input.head, target_branch: input.base, title: input.title, description: input.body, remove_source_branch: false, ...(labelled ? { labels: aiGeneratedLabel.name } : {}) } });
    if (response.status === 409) return 'exists';
    if (response.status !== 201) deliveryFailure('publication_proposal_rejected');
    return { number: (response.data as GitLabMergeRequest).iid };
  }

  /** Whether the project has the `ai-generated` label, creating it when it is missing; false when GitLab refuses either, so a merge request still opens without it. */
  async ensureLabel(repositoryUrl: string): Promise<boolean> {
    try {
      const found = await this.api(repositoryUrl, `/labels/${encodeURIComponent(aiGeneratedLabel.name)}`);
      if (found.status === 200) return true;
      if (found.status !== 404) return false;
      const created = await this.api(repositoryUrl, '/labels', { method: 'POST', body: { name: aiGeneratedLabel.name, color: aiGeneratedLabel.color, description: aiGeneratedLabel.description } });
      return created.status === 201 || created.status === 409;
    } catch { return false; }
  }

  async findPullRequest(record: PublicationRecord): Promise<{ number: number } | undefined> {
    for (let page = 1; page <= 20; page++) {
      const response = await this.api(record.repositoryUrl, `/merge_requests?state=opened&source_branch=${encodeURIComponent(record.branch)}&target_branch=${encodeURIComponent(record.baseBranch)}&per_page=50&page=${page}`);
      if (response.status !== 200 || !Array.isArray(response.data)) deliveryFailure('publication_unconfirmed');
      const found = (response.data as GitLabMergeRequest[]).find(mr => this.publisherProposal(mr, record));
      if (found) return { number: found.iid };
      if ((response.data as unknown[]).length < 50) return undefined;
    }
    return deliveryFailure('publication_unconfirmed');
  }

  async closePullRequest(record: PublicationRecord, number: number): Promise<void> {
    const response = await this.api(record.repositoryUrl, `/merge_requests/${number}`, { method: 'PUT', body: { state_event: 'close' } });
    if (response.status !== 200) deliveryFailure('publication_close_failed');
  }

  private publisherProposal(mr: GitLabMergeRequest, record: PublicationRecord): boolean {
    return mr?.state === 'opened' && mr.author?.username === this.forge.username && mr.source_branch === record.branch && mr.target_branch === record.baseBranch && Number.isSafeInteger(mr.source_project_id) && mr.source_project_id === mr.target_project_id && typeof mr.description === 'string' && mr.description.includes(publicationMarker(record.operationId));
  }

  async verifiedPullRequest(record: PublicationRecord, number: number): Promise<PullRequestEvidence | undefined> {
    const response = await this.api(record.repositoryUrl, `/merge_requests/${number}`);
    if (response.status === 404) return undefined;
    if (response.status !== 200) deliveryFailure('publication_unconfirmed');
    const mr = response.data as GitLabMergeRequest;
    const url = this.forge.ownPage(mr.web_url, record.repositoryUrl);
    const exact = Number.isSafeInteger(mr.iid) && mr.iid === number && mr.sha === record.facts.canonicalSha && this.publisherProposal(mr, record) && url !== undefined && url.pathname.endsWith(`/-/merge_requests/${number}`);
    return exact ? { number: mr.iid, url: url!.toString() } : undefined;
  }

  private api(repositoryUrl: string, suffix: string, init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<{ status: number; data: unknown }> {
    const { fullName } = this.forge.coordinates(repositoryUrl);
    return this.forge.fetchJson(`${this.forge.config.apiUrl}/projects/${encodeURIComponent(fullName)}${suffix}`, () => ({ authorization: `Bearer ${this.forge.token()}`, accept: 'application/json' }), init);
  }
}

/** GitLab (gitlab.com or self-managed): an API root ending with `/api/v4`; repositories in a group or nested groups. */
export const gitlabPublishing: DeliveryPublisherAdapter = {
  kind: 'gitlab',
  label: 'GitLab',
  acceptsApiUrl: url => url.pathname.replace(/\/+$/, '').endsWith('/api/v4'),
  acceptsRepository: url => httpsRepository(url, true),
  create: (config, options) => new GitLabPublisher(config, options),
};
