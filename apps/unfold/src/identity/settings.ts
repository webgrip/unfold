/** Which SCIM User attribute names the person a SCIM User is: one that equals the OIDC `sub` claim, or the email they sign in with. */
export type ScimLink = 'externalId' | 'userName' | 'email';

/** The SCIM service provider: the environment variable holding the bearer token the identity provider sends, and how SCIM Users link to sign-ins. */
export type ScimSettings = { tokenEnv: string; linkBy: ScimLink };

/** One Shared Signals transmitter whose Security Event Tokens Unfold accepts. */
export type TransmitterSettings = { name: string; issuer: string; jwksUri: string; audience?: string; authorizationEnv?: string };

/** The Shared Signals push receiver: the audience its SETs must name, how old a SET may be, and the transmitters it trusts. */
export type SharedSignalsSettings = { audience: string; maxAgeHours: number; transmitters: TransmitterSettings[] };

/** The `identity` configuration block: SCIM provisioning and the Shared Signals receiver, each absent unless configured. */
export type IdentitySettings = { scim?: ScimSettings; sharedSignals?: SharedSignalsSettings };

const envName = /^UNFOLD_[A-Z0-9_]{1,100}$/;
const minimumTokenLength = 32;

function object(raw: unknown, label: string, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(raw)) if (!keys.includes(key)) throw new Error(`${label}.${key} is not a setting`);
  return raw as Record<string, unknown>;
}

function httpsUrl(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error(`${label} must be a URL`);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a URL`); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) throw new Error(`${label} must be an https URL`);
  return value;
}

function secretEnv(value: unknown, label: string, env: NodeJS.ProcessEnv): string {
  if (typeof value !== 'string' || !envName.test(value)) throw new Error(`${label} must name a UNFOLD_ environment variable`);
  const secret = env[value];
  if (!secret || secret.length < minimumTokenLength || secret.length > 4096 || /[^\x21-\x7e ]/.test(secret)) throw new Error(`${label} names ${value}, which must hold at least ${minimumTokenLength} printable characters`);
  return value;
}

/**
 * Reads the `identity` block. `scim.tokenEnv` and each transmitter's `authorizationEnv` name environment variables that
 * must be set, so a secret never sits in the configuration file. Both parts need single sign-on, because SCIM Users and
 * SET subjects are matched to the people single sign-on creates. `baseUrl` is the default SET audience.
 */
export function identitySettings(raw: unknown, context: { oidc: boolean; baseUrl?: string }, env: NodeJS.ProcessEnv = process.env): IdentitySettings {
  const value = object(raw, 'identity', ['scim', 'sharedSignals']);
  if (!context.oidc && (value.scim !== undefined || value.sharedSignals !== undefined)) throw new Error('identity needs auth.oidc: SCIM Users and Shared Signals subjects are matched to the people single sign-on signs in');
  const settings: IdentitySettings = {};
  if (value.scim !== undefined) {
    const scim = object(value.scim, 'identity.scim', ['tokenEnv', 'linkBy']);
    const linkBy = scim.linkBy ?? 'externalId';
    if (linkBy !== 'externalId' && linkBy !== 'userName' && linkBy !== 'email') throw new Error('identity.scim.linkBy must be externalId, userName or email');
    settings.scim = { tokenEnv: secretEnv(scim.tokenEnv, 'identity.scim.tokenEnv', env), linkBy };
  }
  if (value.sharedSignals !== undefined) {
    const signals = object(value.sharedSignals, 'identity.sharedSignals', ['audience', 'maxAgeHours', 'transmitters']);
    const audience = signals.audience ?? context.baseUrl;
    if (typeof audience !== 'string' || !audience || audience.length > 2048) throw new Error('identity.sharedSignals.audience must be set, or baseUrl must be');
    const maxAgeHours = signals.maxAgeHours ?? 24;
    if (typeof maxAgeHours !== 'number' || !Number.isInteger(maxAgeHours) || maxAgeHours < 1 || maxAgeHours > 168) throw new Error('identity.sharedSignals.maxAgeHours must be a whole number of hours from 1 to 168');
    if (!Array.isArray(signals.transmitters) || !signals.transmitters.length || signals.transmitters.length > 20) throw new Error('identity.sharedSignals.transmitters must list one to twenty transmitters');
    const transmitters = signals.transmitters.map((entry, index): TransmitterSettings => {
      const label = `identity.sharedSignals.transmitters[${index}]`;
      const item = object(entry, label, ['name', 'issuer', 'jwksUri', 'audience', 'authorizationEnv']);
      if (typeof item.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(item.name)) throw new Error(`${label}.name must be lower-case letters, digits and hyphens`);
      if (typeof item.issuer !== 'string' || !item.issuer || item.issuer.length > 2048) throw new Error(`${label}.issuer must be the issuer its SETs name`);
      if (item.audience !== undefined && (typeof item.audience !== 'string' || !item.audience || item.audience.length > 2048)) throw new Error(`${label}.audience must be a string`);
      return {
        name: item.name,
        issuer: item.issuer,
        jwksUri: httpsUrl(item.jwksUri, `${label}.jwksUri`),
        ...(item.audience !== undefined ? { audience: item.audience as string } : {}),
        ...(item.authorizationEnv !== undefined ? { authorizationEnv: secretEnv(item.authorizationEnv, `${label}.authorizationEnv`, env) } : {}),
      };
    });
    if (new Set(transmitters.map(item => item.name)).size !== transmitters.length) throw new Error('identity.sharedSignals.transmitters must have distinct names');
    if (new Set(transmitters.map(item => normalIssuer(item.issuer))).size !== transmitters.length) throw new Error('identity.sharedSignals.transmitters must have distinct issuers');
    settings.sharedSignals = { audience, maxAgeHours, transmitters };
  }
  return settings;
}

/** An issuer compared without a trailing slash, as OIDC discovery compares them. */
export function normalIssuer(issuer: string): string { return issuer.replace(/\/+$/, ''); }
