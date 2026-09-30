export const SITE_URL = 'https://glide-site.SUBDOMAIN.workers.dev';

const PLATFORM_HOST_SUFFIXES = ['.workers.dev', '.pages.dev'];

export function isIndexable(siteUrl: string): boolean {
  const { hostname } = new URL(siteUrl);
  return !PLATFORM_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export const SITE_INDEXABLE = isIndexable(SITE_URL);
export const SITE_NAME = 'Glide';

export const SOURCE_URL = 'https://forgejo.webgrip.dev/webgrip/glide';
export const DEMO_GUIDE_URL = `${SOURCE_URL}/src/branch/development/docs/workflows/local-demo.md`;
export const LICENSE_URL = `${SOURCE_URL}/src/branch/development/LICENSE`;
export const DOCS_URL = 'https://docs.webgrip.dev/glide/';
export const LICENSE_ID = 'Apache-2.0';
