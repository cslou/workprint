import { expect, test as base, type Request } from '@playwright/test';
import type { OperationRequest } from '../../packages/contracts/src/index.js';

type Entry = { method: string; url: URL; body: unknown };
type Operation = Readonly<{ origin: string; method: string; path: string; count: number; query: Readonly<Record<string, string>>; purpose?: OperationRequest<'useVersion'>['body']['purpose'] }>;
type Allowance = Omit<Operation, 'count' | 'query'> & { query: string; consumed: boolean };
export type MaterialNetwork = { entries: Entry[]; expectOperations(...operations: Operation[]): void; expectObjectTransfer(url: string, count?: number): void; assertSafe(): void };
const redactQuery = (entries: Iterable<[string, string]>) => [...entries].map(([key, value]): [string, string] => [key, /^x-amz-/i.test(key) ? '[redacted]' : value]);
const safeURL = (input: URL) => { const url = new URL(input); url.search = new URLSearchParams(redactQuery(url.searchParams)).toString(); return url; };
const queryKey = (entries: Iterable<[string, string]>) => JSON.stringify([...entries].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv)));

/** Records every HTTP request; exact operation allowances are consumed at observation, never retroactively. */
export const test = base.extend<{ materialNetwork: MaterialNetwork }>({
  materialNetwork: [async ({ context }, use) => {
    const entries: Entry[] = [];
    const allowances: Allowance[] = [];
    const unexpected: Entry[] = [];
    const objectOrigins = new Set<string>();
    const record = (request: Request) => {
      const actualURL = new URL(request.url());
      const objectRequest = objectOrigins.has(actualURL.origin) || actualURL.searchParams.has('X-Amz-Signature');
      let body: unknown = objectRequest ? 'private object transfer' : null;
      if (!objectRequest && request.postData()) { try { body = request.postDataJSON(); } catch { body = 'non-JSON transfer'; } }
      const entry = { method: request.method(), url: safeURL(actualURL), body };
      entries.push(entry);
      if (objectRequest) {
        expect(Object.hasOwn(request.headers(), 'authorization'), 'API bearer must never reach object storage').toBe(false);
        expect(Object.hasOwn(request.headers(), 'cookie'), 'Application cookies must never reach object storage').toBe(false);
      }
      if (objectRequest || entry.url.pathname.startsWith('/v1/') || !['GET', 'HEAD', 'OPTIONS'].includes(entry.method)) {
        const allowance = allowances.find(value => !value.consumed && value.method === entry.method && value.origin === actualURL.origin && value.path === actualURL.pathname && value.query === queryKey(actualURL.searchParams.entries()));
        if (allowance) {
          allowance.consumed = true;
          if (entry.method === 'POST' && entry.url.pathname.endsWith('/uses')) expect(entry.body).toMatchObject({ purpose: allowance.purpose ?? 'reference' });
        } else unexpected.push(entry);
      }
    };
    const assertSafe = () => {
      expect(unexpected.map(entry => `${entry.method} ${entry.url.origin}${entry.url.pathname}${entry.url.search}`), 'Unexpected or repeated operation/transfer').toEqual([]);
      for (const entry of entries) {
        expect(['127.0.0.1', 'localhost', '[::1]']).toContain(entry.url.hostname);
        if (!((entry.method === 'GET' && /^\/v1\/(conversations\/[^/]+\/)?generation-requests(\/[^/]+)?$/.test(entry.url.pathname)) || (entry.method === 'POST' && /^\/v1\/generation-requests\/[^/]+\/cancel$/.test(entry.url.pathname)))) expect(entry.url.pathname).not.toMatch(/generation|provider/);
        if (entry.url.pathname === '/v1/library') {
          expect(entry.method).toBe('GET');
          expect([...entry.url.searchParams.keys()].filter(key => !['cursor', 'kind', 'limit'].includes(key))).toEqual([]);
          const limit = entry.url.searchParams.get('limit');
          if (limit !== null) expect(/^[1-9]\d*$/.test(limit) && Number(limit) <= 100).toBe(true);
          const kind = entry.url.searchParams.get('kind');
          if (kind !== null) expect(['script', 'reference', 'storyboard', 'image', 'video']).toContain(kind);
        }
      }
    };
    context.on('request', record);
    await context.route('**/*', async route => {
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)) { await route.abort('blockedbyclient'); return; }
      await route.continue();
    });
    try {
      await use({ entries, expectOperations(...operations) {
        for (const operation of operations) {
          expect(Number.isInteger(operation.count) && operation.count > 0).toBe(true);
          for (let index = 0; index < operation.count; index++) allowances.push({ origin: operation.origin, method: operation.method, path: operation.path, query: queryKey(Object.entries(operation.query)), ...(operation.purpose ? { purpose: operation.purpose } : {}), consumed: false });
        }
      }, expectObjectTransfer(value, count = 1) {
        const url = new URL(value);
        expect(url.searchParams.has('X-Amz-Signature'), 'Only an exact signed object grant may be allowed').toBe(true);
        expect(Number.isInteger(count) && count > 0).toBe(true);
        objectOrigins.add(url.origin);
        for (let index = 0; index < count; index++) allowances.push({ origin: url.origin, method: 'PUT', path: url.pathname, query: queryKey(url.searchParams), consumed: false });
      }, assertSafe });
    } finally {
      await context.close();
      try {
        assertSafe();
        expect(allowances.filter(value => !value.consumed).map(value => `${value.method} ${value.origin}${value.path} query=${JSON.stringify(redactQuery(JSON.parse(value.query) as [string, string][]))}`), 'Expected operations were not consumed').toEqual([]);
      } finally { context.off('request', record); }
    }
  }, { auto: true }],
});
export { expect };
