import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';

/** A target Unfold refuses to send to, with the code the admin API answers. */
export class TargetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = 'TargetError'; }
}

const nonPublicV4 = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];
const nonPublicV6 = ['::/128', '::1/128', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64', '2001::/32', '2001:db8::/32', '2002::/16', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8'];
const blocked = new BlockList();
for (const range of nonPublicV4) { const [network, prefix] = range.split('/'); blocked.addSubnet(network, Number(prefix), 'ipv4'); }
for (const range of nonPublicV6) { const [network, prefix] = range.split('/'); blocked.addSubnet(network, Number(prefix), 'ipv6'); }

/**
 * The `outboundEvents.allowedPrivateTargets` setting, read: host names (exact, any case) and addresses or CIDR ranges
 * that Unfold may send to although they are not public. An allowed host may also use `http`.
 */
export type TargetAllowlist = { hosts: Set<string>; ranges: BlockList; entries: string[] };

/** Reads the allowlist entries; throws on an entry that is neither a host name nor an address or CIDR range. */
export function targetAllowlist(entries: readonly string[] = []): TargetAllowlist {
  const hosts = new Set<string>();
  const ranges = new BlockList();
  for (const raw of entries) {
    const entry = raw.trim().toLowerCase();
    const [network, prefix] = entry.split('/');
    const family = isIP(network);
    if (family) {
      const bits = prefix === undefined ? (family === 4 ? 32 : 128) : Number(prefix);
      if (!Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128) || (prefix !== undefined && !/^\d{1,3}$/.test(prefix))) throw new Error(`outboundEvents.allowedPrivateTargets entry ${raw} is not a valid CIDR range`);
      ranges.addSubnet(network, bits, family === 4 ? 'ipv4' : 'ipv6');
    } else if (/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(entry) && prefix === undefined) hosts.add(entry);
    else throw new Error(`outboundEvents.allowedPrivateTargets entry ${raw} must be a host name, an address or a CIDR range`);
  }
  return { hosts, ranges, entries: [...entries] };
}

const bare = (host: string) => host.replace(/^\[|\]$/g, '').toLowerCase();

/** Whether `address` is a public unicast address: not loopback, private, link-local, unique-local, CGNAT, multicast, documentation or reserved. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function addressAllowed(address: string, allow: TargetAllowlist): boolean {
  const family = isIP(address);
  return family !== 0 && allow.ranges.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** Whether the allowlist names the URL's host, or the host is an address inside an allowed range. */
export function hostAllowed(host: string, allow: TargetAllowlist): boolean {
  const name = bare(host);
  return allow.hosts.has(name) || addressAllowed(name, allow);
}

/**
 * Checks a subscription URL's form: an absolute `https` URL without credentials, at most 2048 characters; `http` only for
 * an allowed host. A host that is an address must be public or allowed. Host names are resolved by {@link resolveTarget}.
 */
export function parseTarget(value: unknown, allow: TargetAllowlist): URL {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new TargetError('webhook_url', 'Give the receiver\'s URL, at most 2048 characters.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new TargetError('webhook_url', 'Give the receiver\'s full URL, starting with https://.'); }
  if (url.username || url.password) throw new TargetError('webhook_url', 'Leave credentials out of the URL. The signature authenticates each delivery.');
  if (url.hash) throw new TargetError('webhook_url', 'Leave the #fragment out of the URL.');
  const allowed = hostAllowed(url.hostname, allow);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowed)) throw new TargetError('webhook_url_scheme', 'Use an https:// URL. Plain http is only for a host the allowedPrivateTargets setting names.');
  const literal = bare(url.hostname);
  if (isIP(literal) && !isPublicAddress(literal) && !allowed) throw new TargetError('webhook_target_private', `${literal} is not a public address. An administrator can allow it in outboundEvents.allowedPrivateTargets.`);
  if (!isIP(literal) && (literal === 'localhost' || literal.endsWith('.localhost') || !literal.includes('.')) && !allowed) throw new TargetError('webhook_target_private', `${literal} is not a public host name. An administrator can allow it in outboundEvents.allowedPrivateTargets.`);
  return url;
}

type Resolver = (host: string) => Promise<LookupAddress[]>;
const systemResolver: Resolver = host => new Promise((resolve, reject) => dnsLookup(host, { all: true, verbatim: true }, (error, addresses) => error ? reject(error) : resolve(addresses)));

/** The first resolved address the allowlist does not permit, or `undefined` when every one is public or allowed. */
export function refusedAddress(host: string, addresses: readonly LookupAddress[], allow: TargetAllowlist): string | undefined {
  if (hostAllowed(host, allow)) return undefined;
  return addresses.find(entry => !isPublicAddress(entry.address) && !addressAllowed(entry.address, allow))?.address;
}

/** Resolves the URL's host and refuses it when any address it resolves to is neither public nor allowed. */
export async function resolveTarget(url: URL, allow: TargetAllowlist, resolver: Resolver = systemResolver): Promise<void> {
  const host = bare(url.hostname);
  let addresses: LookupAddress[];
  if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
  else {
    try { addresses = await resolver(host); } catch { throw new TargetError('webhook_target_unresolved', `${host} does not resolve.`); }
  }
  const refused = refusedAddress(host, addresses, allow);
  if (refused) throw new TargetError('webhook_target_private', `${host} resolves to ${refused}, which is not a public address. An administrator can allow it in outboundEvents.allowedPrivateTargets.`);
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * A `lookup` for `node:http(s).request` that resolves as the system does and fails with code `webhook_target_private`
 * when any address is neither public nor allowed, so the address Unfold connects to is the one it checked.
 */
export function guardedLookup(allow: TargetAllowlist) {
  return (hostname: string, options: { all?: boolean; family?: number } | number, callback: LookupCallback): void => {
    const wanted = typeof options === 'number' ? { family: options } : options;
    dnsLookup(hostname, { all: true, verbatim: true, ...(wanted.family ? { family: wanted.family } : {}) }, (error, addresses) => {
      if (error) return callback(error, '', 0);
      const refused = refusedAddress(hostname, addresses, allow);
      if (refused) return callback(Object.assign(new Error(`${hostname} resolved to ${refused}, which is not a public address`), { code: 'webhook_target_private' }), '', 0);
      if (wanted.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

/** The `outboundEvents` configuration block. */
export type OutboundEventsSettings = { allowedPrivateTargets: string[] };

/** Reads the optional `outboundEvents` block: `{ allowedPrivateTargets: [host | address | CIDR, …] }`, at most 100 entries. */
export function outboundEventsSettings(raw: unknown): OutboundEventsSettings {
  if (raw === undefined) return { allowedPrivateTargets: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => key !== 'allowedPrivateTargets')) throw new Error('outboundEvents takes only allowedPrivateTargets');
  const entries = (raw as { allowedPrivateTargets?: unknown }).allowedPrivateTargets ?? [];
  if (!Array.isArray(entries) || entries.length > 100 || entries.some(entry => typeof entry !== 'string')) throw new Error('outboundEvents.allowedPrivateTargets must be a list of at most 100 host names, addresses or CIDR ranges');
  targetAllowlist(entries);
  return { allowedPrivateTargets: entries };
}
