export const LOCAL_SITE_URL = 'http://localhost:4321';

export function resolveSiteUrl(configured: string | undefined): string {
  const value = configured?.trim();
  if (!value) return LOCAL_SITE_URL;
  const url = new URL(value);
  if (url.origin !== value)
    throw new Error(`UNFOLD_SITE_URL must be an origin without a path or trailing slash: ${value}`);
  return url.origin;
}

export const SITE_URL = resolveSiteUrl(process.env['UNFOLD_SITE_URL']);

const PLATFORM_HOST_SUFFIXES = ['.workers.dev', '.pages.dev'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

export function isIndexable(siteUrl: string): boolean {
  const { hostname } = new URL(siteUrl);
  if (LOCAL_HOSTS.includes(hostname)) return false;
  return !PLATFORM_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export const SITE_INDEXABLE = isIndexable(SITE_URL);
export const SITE_NAME = 'Unfold';

export const SOURCE_URL = 'https://forgejo.webgrip.dev/webgrip/glide';
export const DEMO_GUIDE_URL = `${SOURCE_URL}/src/branch/development/docs/workflows/local-demo.md`;
export const LICENSE_URL = `${SOURCE_URL}/src/branch/development/LICENSE`;
export const DOCS_URL = 'https://docs.webgrip.dev/glide/';
export const LICENSE_ID = 'Apache-2.0';

export const PRIVACY_VERSION = '2026-10-02';
export const SIGNUP_RETENTION_MONTHS = 24;
export const CONTROLLER = {
  name: 'WebGrip',
  person: 'Ryan Grippeling',
  city: 'Enschede',
  kvk: '75281120',
  email: 'ryan@webgrip.nl',
} as const;
export const DEMO_REPLAY_PATH = '/demo';
