import { BlockList, isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/** Reads the optional top-level `trustedProxies`: IP addresses and CIDR ranges of the reverse proxies in front of Unfold. */
export function trustedProxySettings(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('trustedProxies must list at most 100 addresses or CIDR ranges');
  return raw.map(entry => {
    const [address, bits, extra] = typeof entry === 'string' ? entry.trim().split('/') : [];
    const family = isIP(address ?? '');
    const prefix = bits === undefined ? undefined : Number(bits);
    if (!family || extra !== undefined || (prefix !== undefined && (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)))) throw new Error(`trustedProxies entry ${JSON.stringify(entry)} must be an IP address or a CIDR range such as 10.0.0.0/8`);
    return (entry as string).trim();
  });
}

const plain = (address: string) => address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;

/**
 * The address a request came from. It is the socket's peer unless that peer is one of `trusted`: then it is the
 * right-most `X-Forwarded-For` entry that is not itself a trusted proxy. Without `trusted`, the header is ignored,
 * because any client can write it.
 */
export function clientAddress(req: Pick<IncomingMessage, 'headers' | 'socket'>, trusted: readonly string[] | undefined): string {
  const peer = plain(req.socket.remoteAddress ?? 'unknown');
  if (!trusted?.length) return peer;
  const list = new BlockList();
  for (const entry of trusted) {
    const [address, bits] = entry.split('/');
    const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
    if (bits === undefined) list.addAddress(address, family); else list.addSubnet(address, Number(bits), family);
  }
  const isTrusted = (address: string) => { const family = isIP(address); return family !== 0 && list.check(address, family === 6 ? 'ipv6' : 'ipv4'); };
  if (!isTrusted(peer)) return peer;
  const header = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map(item => plain(item.trim())).filter(Boolean);
  for (let index = hops.length - 1; index >= 0; index--) {
    if (!isIP(hops[index])) return peer;
    if (!isTrusted(hops[index])) return hops[index];
  }
  return hops[0] ?? peer;
}
