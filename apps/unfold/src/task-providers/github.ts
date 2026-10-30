import type { TaskProviderAdapter } from './registry.ts';
import { authorize, isPullRequest, ownerRepository, parseRepositoryIssue, repositoryIssueDetails, repositoryIssuePath, repositoryIssueUrl } from './repository-issues.ts';
import { apiWebRoot, listPage, numericId, readOne } from './shared.ts';

const gheComApiHost = /^api\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.ghe\.com$/;

function githubApiRoot(parsed: URL, path: string): void {
  const rule = 'GitHub baseUrl must be https://api.github.com, a GHE.com API root https://api.SUBDOMAIN.ghe.com, or a GitHub Enterprise Server API root ending with /api/v3';
  const host = parsed.hostname.replace(/\.$/, '');
  if (host === 'ghe.com' || host.endsWith('.ghe.com')) {
    if (!gheComApiHost.test(parsed.hostname) || parsed.port || path !== '') throw new Error(rule);
    return;
  }
  if (!(parsed.hostname === 'api.github.com' && path === '') && !path.endsWith('/api/v3')) throw new Error(rule);
}

/** GitHub issues of one repository on github.com, GHE.com or GitHub Enterprise Server, read with a Bearer token. */
export const github: TaskProviderAdapter = {
  name: 'github',
  label: 'GitHub',
  descriptionFormat: 'markdown',
  taskId: numericId,
  apiRoot: githubApiRoot,
  project: ownerRepository,
  webRoot(source) {
    const host = new URL(source.baseUrl).hostname;
    if (host === 'api.github.com') return 'https://github.com';
    const gheCom = gheComApiHost.exec(host);
    if (gheCom) return `https://${gheCom[1]}.ghe.com`;
    return apiWebRoot(source);
  },
  taskUrl: (source, id, _value, base) => repositoryIssueUrl(source, id, base),
  headers(source, headers) {
    headers.Accept = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    authorize(source, headers, 'Bearer');
  },
  parse: parseRepositoryIssue,
  details: (_source, value, read) => repositoryIssueDetails(value, read),
  list: (source, page, reading) => listPage(page, reading, { path: repositoryIssuePath(source), query: { page: String(page), per_page: '50', state: 'open', sort: 'updated', direction: 'desc' }, pageSize: 50, skip: isPullRequest }),
  read: (source, id, truncate, reading) => readOne(id, truncate, reading, `${repositoryIssuePath(source)}/${id}`),
};
