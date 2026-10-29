import { expect, test as base, type Request } from '@playwright/test';

type Entry = { method: string; url: URL; body: unknown };
type Operation = Readonly<{ origin: string; method: string; path: string; count: number; query: Readonly<Record<string, string>>; purpose?: 'reference' | 'shot_video' }>;
type Allowance = Omit<Operation, 'count' | 'query'> & { query: string; consumed: boolean };
export type MaterialNetwork = { entries: Entry[]; expectOperations(...operations: Operation[]): void; assertSafe(): void };
const queryKey = (entries: Iterable<[string, string]>) => JSON.stringify([...entries].sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv)));

/** Records every HTTP request; exact operation allowances are consumed at observation, never retroactively. */
export const test = base.extend<{ materialNetwork: MaterialNetwork }>({
  materialNetwork: [async ({ context }, use) => {
    const entries: Entry[] = [];
    const allowances: Allowance[] = [];
    const unexpected: Entry[] = [];
    const record = (request: Request) => {
      let body: unknown = null;
      if (request.postData()) { try { body = request.postDataJSON(); } catch { body = 'non-JSON transfer'; } }
      const entry = { method: request.method(), url: new URL(request.url()), body };
      entries.push(entry);
      if (entry.url.pathname.startsWith('/v1/') || !['GET', 'HEAD', 'OPTIONS'].includes(entry.method)) {
        const allowance = allowances.find(value => !value.consumed && value.method === entry.method && value.origin === entry.url.origin && value.path === entry.url.pathname && value.query === queryKey(entry.url.searchParams.entries()));
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
        if (!(entry.method === 'GET' && /^\/v1\/(conversations\/[^/]+\/)?generation-requests(\/[^/]+)?$/.test(entry.url.pathname))) expect(entry.url.pathname).not.toMatch(/generation|provider/);
        if (entry.url.pathname === '/v1/library') {
          expect(entry.method).toBe('GET');
          expect([...entry.url.searchParams.keys()].filter(key => key !== 'cursor')).toEqual([]);
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
      }, assertSafe });
    } finally {
      await context.close();
      try {
        assertSafe();
        expect(allowances.filter(value => !value.consumed).map(value => `${value.method} ${value.origin}${value.path} query=${value.query}`), 'Expected operations were not consumed').toEqual([]);
      } finally { context.off('request', record); }
    }
  }, { auto: true }],
});
export { expect };
