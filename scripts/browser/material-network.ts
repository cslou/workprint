import { expect, test as base, type Request } from '@playwright/test';

type Entry = { method: string; url: URL; body: unknown };
export type MaterialNetwork = { entries: Entry[]; allowPost(origin: string, path: string): void; assertSafe(): void };

/** Records every browser HTTP request before navigation and keeps observing through context teardown. */
export const test = base.extend<{ materialNetwork: MaterialNetwork }>({
  materialNetwork: [async ({ context }, use) => {
    const entries: Entry[] = [];
    const permitted = new Set<string>();
    const record = (request: Request) => {
      let body: unknown = null;
      if (request.postData()) { try { body = request.postDataJSON(); } catch { body = 'non-JSON transfer'; } }
      entries.push({ method: request.method(), url: new URL(request.url()), body });
    };
    const assertSafe = () => {
      for (const entry of entries) {
        expect(['127.0.0.1', 'localhost', '[::1]']).toContain(entry.url.hostname);
        expect(entry.url.pathname).not.toMatch(/generation|provider/);
        if (entry.url.pathname === '/v1/library') {
          expect(entry.method).toBe('GET');
          expect([...entry.url.searchParams.keys()].filter(key => key !== 'cursor')).toEqual([]);
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(entry.method)) {
          expect(permitted.has(`${entry.method} ${entry.url.origin}${entry.url.pathname}`), `Unexpected mutation/transfer: ${entry.method} ${entry.url.origin}${entry.url.pathname}`).toBe(true);
          if (entry.url.pathname.endsWith('/uses')) expect(entry.body).toMatchObject({ purpose: 'reference' });
        }
      }
    };
    context.on('request', record);
    await context.route('**/*', async route => {
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)) { await route.abort('blockedbyclient'); return; }
      await route.continue();
    });
    try { await use({ entries, allowPost(origin, path) { permitted.add(`POST ${origin}${path}`); }, assertSafe }); }
    finally { await context.close(); assertSafe(); context.off('request', record); }
  }, { auto: true }],
});
export { expect };
