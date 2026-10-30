import { deliveryFailure } from '../trusted-candidate.ts';
import { aiGeneratedLabel } from '../ai-marking.ts';
import type { DeliveryPublisher, DeliveryPublisherAdapter, PublisherConfig } from './registry.ts';
import { ForgeConnection, httpsRepository, publicationMarker, type PublicationRecord, type PullRequestEvidence, type PushOutcome } from './shared.ts';

type GitHubPullRequest = { number: number; html_url: string; body: string | null; state: string; user?: { login?: string }; head: { ref: string; sha: string; repo?: { full_name?: string } | null }; base: { ref: string; repo?: { full_name?: string } | null } };

const same = (a: string | undefined, b: string): boolean => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

/**
 * Publishes one canonical commit to GitHub (github.com, GHE.com or GitHub Enterprise Server): a lease-guarded branch
 * push authenticated as `x-access-token`, and one pull request through the REST API, labelled `ai-generated` through
 * the issue labels API after it opens. The label is created when the repository lacks it; a refusal leaves the pull
 * request unlabelled rather than unopened.
 */
export class GitHubPublisher implements DeliveryPublisher {
  private readonly forge: ForgeConnection;
  constructor(config: PublisherConfig, options: { plainHttp?: boolean } = {}) { this.forge = new ForgeConnection(config, options, { gitUser: 'x-access-token' }); }

  remoteHead(gitDirectory: string, repositoryUrl: string, branch: string): Promise<string | null> { return this.forge.remoteHead(gitDirectory, repositoryUrl, branch); }
  push(gitDirectory: string, repositoryUrl: string, canonicalSha: string, branch: string): Promise<PushOutcome> { return this.forge.push(gitDirectory, repositoryUrl, canonicalSha, branch); }

  async createPullRequest(repositoryUrl: string, input: { head: string; base: string; title: string; body: string }): Promise<GitHubPullRequest | 'exists'> {
    const response = await this.api(repositoryUrl, '/pulls', { method: 'POST', body: { title: input.title, head: input.head, base: input.base, body: input.body, maintainer_can_modify: false } });
    if (response.status === 422) return 'exists';
    if (response.status !== 201) deliveryFailure('publication_proposal_rejected');
    const pr = response.data as GitHubPullRequest;
    await this.label(repositoryUrl, pr.number);
    return pr;
  }

  /** Adds `ai-generated` to pull request `number`, creating the label first when the repository lacks it; true when the label is on it. */
  async label(repositoryUrl: string, number: number): Promise<boolean> {
    try {
      const found = await this.api(repositoryUrl, `/labels/${encodeURIComponent(aiGeneratedLabel.name)}`);
      if (found.status === 404) {
        const created = await this.api(repositoryUrl, '/labels', { method: 'POST', body: { name: aiGeneratedLabel.name, color: aiGeneratedLabel.color.replace('#', ''), description: aiGeneratedLabel.description } });
        if (created.status !== 201 && created.status !== 422) return false;
      } else if (found.status !== 200) return false;
      const added = await this.api(repositoryUrl, `/issues/${number}/labels`, { method: 'POST', body: { labels: [aiGeneratedLabel.name] } });
      return added.status === 200;
    } catch { return false; }
  }

  async findPullRequest(record: PublicationRecord): Promise<GitHubPullRequest | undefined> {
    const { owner, fullName } = this.forge.coordinates(record.repositoryUrl);
    for (let page = 1; page <= 20; page++) {
      const response = await this.api(record.repositoryUrl, `/pulls?state=open&head=${encodeURIComponent(`${owner}:${record.branch}`)}&base=${encodeURIComponent(record.baseBranch)}&per_page=50&page=${page}`);
      if (response.status !== 200 || !Array.isArray(response.data)) deliveryFailure('publication_unconfirmed');
      const found = (response.data as GitHubPullRequest[]).find(pr => this.publisherProposal(pr, record, fullName));
      if (found) return found;
      if ((response.data as unknown[]).length < 50) return undefined;
    }
    return deliveryFailure('publication_unconfirmed');
  }

  async closePullRequest(record: PublicationRecord, number: number): Promise<void> {
    const response = await this.api(record.repositoryUrl, `/pulls/${number}`, { method: 'PATCH', body: { state: 'closed' } });
    if (response.status !== 200) deliveryFailure('publication_close_failed');
  }

  private publisherProposal(pr: GitHubPullRequest, record: PublicationRecord, fullName: string): boolean {
    return pr?.state === 'open' && same(pr.user?.login, this.forge.username) && pr.head?.ref === record.branch && pr.base?.ref === record.baseBranch && same(pr.base.repo?.full_name, fullName) && same(pr.head.repo?.full_name, fullName) && typeof pr.body === 'string' && pr.body.includes(publicationMarker(record.operationId));
  }

  async verifiedPullRequest(record: PublicationRecord, number: number): Promise<PullRequestEvidence | undefined> {
    const response = await this.api(record.repositoryUrl, `/pulls/${number}`);
    if (response.status === 404) return undefined;
    if (response.status !== 200) deliveryFailure('publication_unconfirmed');
    const pr = response.data as GitHubPullRequest;
    const { fullName } = this.forge.coordinates(record.repositoryUrl);
    const url = this.forge.ownPage(pr.html_url, record.repositoryUrl);
    const exact = Number.isSafeInteger(pr.number) && pr.number === number && pr.head?.sha === record.facts.canonicalSha && this.publisherProposal(pr, record, fullName) && url !== undefined;
    return exact ? { number: pr.number, url: url!.toString() } : undefined;
  }

  private api(repositoryUrl: string, suffix: string, init: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}): Promise<{ status: number; data: unknown }> {
    const { owner, name } = this.forge.coordinates(repositoryUrl);
    return this.forge.fetchJson(`${this.forge.config.apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`, () => ({ authorization: `Bearer ${this.forge.token()}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'unfold-publisher' }), init);
  }
}

const gheComApi = /^api\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ghe\.com$/;

/** GitHub: `https://api.github.com`, a GHE.com API root `https://api.SUBDOMAIN.ghe.com`, or a GitHub Enterprise Server root ending with `/api/v3`; `owner/name` repositories. */
export const githubPublishing: DeliveryPublisherAdapter = {
  kind: 'github',
  label: 'GitHub',
  acceptsApiUrl(url) {
    const path = url.pathname.replace(/\/+$/, '');
    if (url.hostname === 'api.github.com' || gheComApi.test(url.hostname)) return path === '' && !url.port;
    return path.endsWith('/api/v3');
  },
  acceptsRepository: url => httpsRepository(url),
  create: (config, options) => new GitHubPublisher(config, options),
};
