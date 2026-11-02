/**
 * A bounded GET of a provider's result URL: HTTPS to public addresses only, no credentials sent,
 * every redirect re-checked, and each connection pinned to the addresses that were checked.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { readBounded } from './http.js';

export type DownloadFailure = 'refused' | 'unavailable' | 'too_large' | 'aborted';
export class DownloadError extends Error {
  override readonly name = 'DownloadError';
  constructor(readonly reason: DownloadFailure) { super(`Download ${reason}`); }
}
/** Resolves a host name to its addresses. */
export type AddressLookup = (hostname: string) => Promise<readonly { readonly address: string; readonly family: number }[]>;
export type SafeDownload = (url: string, signal: AbortSignal | undefined, maxBytes: number) => Promise<Uint8Array>;
type Address = { readonly address: string; readonly family: number };

const maxRedirects = 3;

function privateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
/** The eight 16-bit groups of an IPv6 address, with any dotted IPv4 tail folded in. */
function groups(address: string): number[] | undefined {
  let value = address;
  const tail = /:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (tail) {
    const parts = tail[1]!.split('.').map(Number);
    if (parts.some(part => part > 255)) return undefined;
    value = `${value.slice(0, tail.index)}:${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const [head = '', rest] = value.split('::');
  const left = head ? head.split(':') : [], right = rest ? rest.split(':') : [];
  const fill = value.includes('::') ? 8 - left.length - right.length : 0;
  const all = [...left, ...Array(Math.max(0, fill)).fill('0'), ...right].map(group => Number.parseInt(group, 16));
  return all.length === 8 && all.every(group => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? all : undefined;
}
const embedded = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
/**
 * True for loopback, private, link-local, multicast and unparseable addresses, including IPv6 forms
 * that carry an IPv4 address (mapped, compatible, NAT64 and 6to4), which are judged by that address.
 */
export function privateAddress(address: string) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(value);
  if (family === 4) return privateIpv4(value);
  if (family !== 6) return true;
  const g = groups(value);
  if (!g) return true;
  if (g.every(group => group === 0) || (g.slice(0, 7).every(group => group === 0) && g[7] === 1)) return true;
  const first = g[0]!;
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true;
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible)
  if (g.slice(0, 5).every(group => group === 0) && (g[5] === 0xffff || g[5] === 0)) return privateIpv4(embedded(g[6]!, g[7]!));
  // 64:ff9b::/96 and 64:ff9b:1::/48 (NAT64)
  if (first === 0x64 && g[1] === 0xff9b) return g[2] === 1 || privateIpv4(embedded(g[6]!, g[7]!));
  // 2002::/16 (6to4)
  if (first === 0x2002) return privateIpv4(embedded(g[1]!, g[2]!));
  return false;
}

const loopback = (host: string) => ['127.0.0.1', '::1', 'localhost'].includes(host);
const defaultLookup: AddressLookup = async hostname => dnsLookup(hostname, { all: true, verbatim: true });

/** One GET to addresses already checked, pinned so a second DNS answer can't redirect it. */
function pinnedGet(url: URL, addresses: readonly Address[], signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(url, {
      method: 'GET', signal, agent: false,
      lookup: (_host, options, callback) => {
        const wanted = options.family === 4 || options.family === 6 ? addresses.filter(item => item.family === options.family) : addresses;
        if (!wanted.length) { callback(new Error('no checked address'), '', 4); return; }
        if (options.all) (callback as unknown as (error: null, all: readonly Address[]) => void)(null, wanted);
        else callback(null, wanted[0]!.address, wanted[0]!.family);
      },
    }, resolve);
    request.on('error', reject);
    request.end();
  });
}

/**
 * The production download, or with `allowLoopback` (test composition only) one that also reaches
 * plain-HTTP loopback hosts such as a fake provider. Nothing in configuration sets `allowLoopback`.
 */
export function createSafeDownload(options: { readonly lookup?: AddressLookup; readonly timeoutMs?: number; readonly allowLoopback?: boolean } = {}): SafeDownload {
  const lookup = options.lookup ?? defaultLookup, timeoutMs = options.timeoutMs ?? 120_000;

  async function checked(value: string): Promise<{ url: URL; addresses: readonly Address[] }> {
    let url: URL;
    try { url = new URL(value); } catch { throw new DownloadError('refused'); }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const testLoopback = options.allowLoopback === true && url.protocol === 'http:' && loopback(host);
    if ((url.protocol !== 'https:' && !testLoopback) || url.username || url.password) throw new DownloadError('refused');
    if (testLoopback) return { url, addresses: [host === '::1' ? { address: '::1', family: 6 } : { address: '127.0.0.1', family: 4 }] };
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new DownloadError('refused');
    let addresses: readonly Address[];
    try { addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host); } catch { throw new DownloadError('unavailable'); }
    if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw new DownloadError('refused');
    return { url, addresses };
  }

  return async (value, signal, maxBytes) => {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new DownloadError('refused');
    if (signal?.aborted) throw new DownloadError('aborted');
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let current = value;
    try {
      for (let hop = 0; ; hop++) {
        const { url, addresses } = await checked(current);
        const response = await pinnedGet(url, addresses, combined);
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.destroy();
          if (!location || hop >= maxRedirects) throw new DownloadError('refused');
          current = new URL(location, url).href;
          continue;
        }
        if (status !== 200) { response.destroy(); throw new DownloadError(status >= 500 ? 'unavailable' : 'refused'); }
        const bytes = await readBounded(response, Number(response.headers['content-length'] ?? NaN), maxBytes, () => new DownloadError('too_large'), () => response.destroy());
        return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      }
    } catch (error) {
      if (signal?.aborted) throw new DownloadError('aborted');
      if (error instanceof DownloadError) throw error;
      throw new DownloadError('unavailable');
    }
  };
}
