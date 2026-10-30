import { deliveryFailure } from '../trusted-candidate.ts';
import { aiGeneratedLabel } from '../ai-marking.ts';
import type { DeliveryPublisher, DeliveryPublisherAdapter, PublisherConfig } from './registry.ts';
import { ForgeConnection, httpsRepository, publicationMarker, type PublicationRecord, type PullRequestEvidence, type PushOutcome } from './shared.ts';

type ForgePullRequest = { number: number; html_url: string; body: string; state: string; user?: { login?: string }; head: { ref: string; sha: string; repo?: { full_name?: string } }; base: { ref: string; repo?: { full_name?: string } } };

/** Publishes one canonical commit to Forgejo: a lease-guarded branch push and one pull request labelled `ai-generated`, with the token read from the configured server environment variable on every call and never placed in a URL or argument list. */
export class ForgejoPublisher implements DeliveryPublisher {
  private readonly forge: ForgeConnection;
  constructor(config: PublisherConfig, options: { plainHttp?: boolean } = {}) { this.forge = new ForgeConnection(config, options, {}); }

  remoteHead(gitDirectory: string, repositoryUrl: string, branch: string): Promise<string | null> { return this.forge.remoteHead(gitDirectory, repositoryUrl, branch); }
  push(gitDirectory: string, repositoryUrl: string, canonicalSha: string, branch: string): Promise<PushOutcome> { return this.forge.push(gitDirectory, repositoryUrl, canonicalSha, branch); }

  async createPullRequest(repositoryUrl: string, input: { head: string; base: string; title: string; body: string }): Promise<ForgePullRequest | 'exists'> {
    const label = await this.aiLabel(repositoryUrl);
    const response = await this.api(repositoryUrl, '/pulls', { method: 'POST', body: { ...input, ...(label === undefined ? {} : { labels: [label] }) } });
    if (response.status === 409) return 'exists';
    if (response.status !== 201) deliveryFailure('publication_proposal_rejected');
    return response.data as ForgePullRequest;
  }

  /** The id of the repository's `ai-generated` label, created when it is missing; undefined when the forge refuses either, so a pull request still opens without it. */
  async aiLabel(repositoryUrl: string): Promise<number | undefined> {
    try {
      for (let page = 1; page <= 5; page++) {
        const listed = await this.api(repositoryUrl, `/labels?limit=50&page=${page}`);
        if (listed.status !== 200 || !Array.isArray(listed.data)) return undefined;
        const found = (listed.data as { id?: unknown; name?: unknown }[]).find(entry => entry?.name === aiGeneratedLabel.name && Number.isSafeInteger(entry.id));
        if (found) return found.id as number;
        if (listed.data.length < 50) break;
      }
      const created = await this.api(repositoryUrl, '/labels', { method: 'POST', body: { ...aiGeneratedLabel } });
      const id = (created.data as { id?: unknown } | null)?.id;
      return created.status === 201 && Number.isSafeInteger(id) ? id as number : undefined;
    } catch { return undefined; }
  }

  async findPullRequest(record: PublicationRecord): Promise<ForgePullRequest | undefined> {
    const { fullName } = this.forge.coordinates(record.repositoryUrl);
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
    return pr?.state === 'open' && pr.user?.login === this.forge.username && pr.head?.ref === record.branch && pr.base?.ref === record.baseBranch && pr.base.repo?.full_name === fullName && pr.head.repo?.full_name === fullName && typeof pr.body === 'string' && pr.body.includes(publicationMarker(record.operationId));
  }

  async verifiedPullRequest(record: PublicationRecord, number: number): Promise<PullRequestEvidence | undefined> {
    const response = await this.api(record.repositoryUrl, `/pulls/${number}`);
    if (response.status === 404) return undefined;
    if (response.status !== 200) deliveryFailure('publication_unconfirmed');
    const pr = response.data as ForgePullRequest;
    const { origin, fullName } = this.forge.coordinates(record.repositoryUrl);
    let url: URL | undefined;
    try { url = new URL(pr.html_url); } catch { url = undefined; }
    const exact = Number.isSafeInteger(pr.number) && pr.number === number && pr.head?.sha === record.facts.canonicalSha && this.publisherProposal(pr, record, fullName) && url?.origin === origin && url.pathname.startsWith(`/${fullName}/`) && !url.search && !url.hash;
    return exact ? { number: pr.number, url: url!.toString() } : undefined;
  }

  private api(repositoryUrl: string, suffix: string, init: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}): Promise<{ status: number; data: unknown }> {
    const { owner, name } = this.forge.coordinates(repositoryUrl);
    return this.forge.fetchJson(`${this.forge.config.apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${suffix}`, () => ({ authorization: `token ${this.forge.token()}`, accept: 'application/json' }), init);
  }
}

/** Forgejo (and Gitea): any HTTPS API root, `owner/name` repositories. */
export const forgejoPublishing: DeliveryPublisherAdapter = {
  kind: 'forgejo',
  label: 'Forgejo',
  acceptsApiUrl: () => true,
  acceptsRepository: url => httpsRepository(url),
  create: (config, options) => new ForgejoPublisher(config, options),
};
