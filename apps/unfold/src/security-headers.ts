/** `Strict-Transport-Security`: how long browsers keep to HTTPS, whether subdomains are included, and whether the host asks for the preload list. */
export type HstsSettings = { maxAge: number; includeSubDomains: boolean; preload: boolean };

/** Two years, the preload list's recommendation. */
export const defaultHsts: HstsSettings = Object.freeze({ maxAge: 63_072_000, includeSubDomains: true, preload: false });

const preloadMinimum = 31_536_000;

/**
 * Reads the optional top-level `hsts`: `false` turns it off, `true` or absent keeps the default, an object sets
 * `maxAge`, `includeSubDomains` and `preload`. It applies only when `baseUrl` is https; an explicit `true` or object
 * with any other `baseUrl` is refused, because browsers ignore the header over plain HTTP.
 */
export function hstsSettings(raw: unknown, baseUrl: string | undefined): HstsSettings | undefined {
  const https = baseUrl?.startsWith('https://') === true;
  if (raw === false) return undefined;
  if (raw === undefined) return https ? { ...defaultHsts } : undefined;
  if (!https) throw new Error('hsts needs an https baseUrl: browsers ignore Strict-Transport-Security over plain HTTP');
  if (raw === true) return { ...defaultHsts };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['maxAge', 'includeSubDomains', 'preload'].includes(key))) throw new Error('hsts is true, false, or takes maxAge, includeSubDomains and preload');
  const entry = raw as Record<string, unknown>;
  const maxAge = entry.maxAge ?? defaultHsts.maxAge;
  if (!Number.isInteger(maxAge) || (maxAge as number) < 0 || (maxAge as number) > 315_360_000) throw new Error('hsts.maxAge must be a whole number of seconds from 0 to 315360000');
  for (const key of ['includeSubDomains', 'preload']) if (entry[key] !== undefined && typeof entry[key] !== 'boolean') throw new Error(`hsts.${key} must be true or false`);
  const settings: HstsSettings = { maxAge: maxAge as number, includeSubDomains: (entry.includeSubDomains as boolean | undefined) ?? defaultHsts.includeSubDomains, preload: (entry.preload as boolean | undefined) ?? false };
  if (settings.preload && (!settings.includeSubDomains || settings.maxAge < preloadMinimum)) throw new Error(`hsts.preload needs includeSubDomains and a maxAge of at least ${preloadMinimum}`);
  return settings;
}

/** The `Strict-Transport-Security` value of `settings`. */
export function hstsHeader(settings: HstsSettings): string {
  return [`max-age=${settings.maxAge}`, ...(settings.includeSubDomains ? ['includeSubDomains'] : []), ...(settings.preload ? ['preload'] : [])].join('; ');
}

const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

/** The headers every response starts with: a route may tighten the content security policy, never drop one. */
export function securityHeaders(hsts: HstsSettings | undefined): Readonly<Record<string, string>> {
  return Object.freeze({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': contentSecurityPolicy,
    ...(hsts ? { 'Strict-Transport-Security': hstsHeader(hsts) } : {}),
  });
}
